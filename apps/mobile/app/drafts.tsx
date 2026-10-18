import { useAuth } from "@clerk/expo";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useAction, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { DraftsScreen, type InboxSegment } from "../src/features/DraftsScreen";
import { monthLabel } from "../src/features/monthClose/model";
import { useLocalEntryDrafts } from "../src/features/useLocalEntryDrafts";
import { useIntakeCandidates } from "../src/features/useIntakeCandidates";
import { applyBatchResults, readyTotalMinorUnits } from "../src/features/intake/applyBatch";
import { confirmReadyBatches, handleReadyBatchError } from "../src/features/intake/confirmReady";
import { devSeedAction, readySeedCandidate, seedCandidate } from "../src/features/intake/devSeed";
import { suggestionOf } from "../src/features/intake/facts";
import { api } from "../src/features/api";
import { useDeviceAccessFailure } from "../src/local-auth/accessFailure";
import { clearDiscardNotices, DISCARD_NOTICE_TTL_MS, readDiscardNotices, type DiscardNotice } from "../src/features/localDiscardNotices";
import { Screen } from "../src/ui/core";

function inboxSegmentFromParam(param: string | undefined): InboxSegment | null {
  if (param === "wait") return "wait";
  if (param === "now") return "now";
  return null;
}

function Drafts({
  subject,
  workspaceId,
  currentPeriod,
  currency,
  profileId,
  timeZone,
}: {
  subject: string;
  workspaceId: string;
  currentPeriod: { year: number; month: number };
  currency: "COP" | "USD";
  profileId: string;
  timeZone: string;
}) {
  const { seed, seedId, seedCategoryId, segment: segmentParam } = useLocalSearchParams<{
    seed?: string | string[];
    seedId?: string | string[];
    seedCategoryId?: string | string[];
    segment?: string | string[];
  }>();
  const requestedSegment = Array.isArray(segmentParam) ? segmentParam[0] : segmentParam;
  const paramSegment = inboxSegmentFromParam(requestedSegment);
  const drafts = useLocalEntryDrafts({ subject, workspaceId });
  const intake = useIntakeCandidates({ subject, workspaceId, currency });
  const [discardNotices, setDiscardNotices] = useState<DiscardNotice[]>([]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const notices = await readDiscardNotices(subject);
        if (!active) return;
        setDiscardNotices(notices);
        if (notices.length > 0) {
          const expiry = Math.min(...notices.map((notice) => notice.time + DISCARD_NOTICE_TTL_MS));
          timer = setTimeout(() => void refresh(), Math.max(1, expiry - Date.now()));
        }
      } catch {
        if (active) setDiscardNotices([]);
      }
    }
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [subject]);
  const confirmCandidates = useAction(api.notificationIntake.confirmCandidates);
  const places = useQuery(api.accounting.listFinancialAccountProfiles, { workspaceId });
  const seedAction = devSeedAction(seed, seedId);
  const seedCategories = useQuery(api.accounting.listUserCategories,
    seedAction?.kind === "ready" && typeof seedCategoryId === "string" && seedCategoryId.trim()
      ? { workspaceId } : "skip");
  const reportFailure = useDeviceAccessFailure();
  const listsLoaded =
    drafts.count !== null && (intake.count !== null || !!intake.error);
  const needsYouNowCount =
    intake.now.length + drafts.items.filter((item) => item.status === "posting").length;
  const [segment, setSegment] = useState<InboxSegment>(() => paramSegment ?? "now");
  const segmentTouched = useRef(false);
  useEffect(() => {
    const fromParam = inboxSegmentFromParam(requestedSegment);
    if (fromParam !== null) {
      segmentTouched.current = false;
      setSegment(fromParam);
    }
  }, [requestedSegment]);
  useEffect(() => {
    if (paramSegment !== null || !listsLoaded || segmentTouched.current) return;
    setSegment(needsYouNowCount > 0 ? "now" : "wait");
  }, [paramSegment, listsLoaded, needsYouNowCount]);
  const [confirming, setConfirming] = useState(false);
  const [confirmedCount, setConfirmedCount] = useState<number | null>(null);
  const handledSeed = useRef<string | null>(null);
  const period = { year: currentPeriod.year, month: currentPeriod.month };
  useEffect(() => {
    if (!__DEV__) return;
    const action = devSeedAction(seed, seedId);
    if (!action) return;
    const actionKey = `${action.kind}:${action.id}`;
    if (handledSeed.current === actionKey) return;
    const candidate = action.kind === "ready" ? readySeedCandidate({
      workspaceId, profileId, currency, seedId: action.id,
      categoryId: seedCategoryId, categories: seedCategories, timeZone,
    }) : null;
    if (action.kind === "ready" && (!candidate || !places?.some((place) => place.id === profileId))) return;
    handledSeed.current = actionKey;
    if (action.kind === "remove") void intake.consume(action.id);
    else if (candidate) void intake.accept(candidate);
    else void intake.accept(seedCandidate(workspaceId, profileId, currency, action.id));
  }, [seed, seedId, seedCategoryId, seedCategories, places, workspaceId, profileId, currency, timeZone, intake.accept, intake.consume]);
  return (
    <DraftsScreen
      drafts={drafts.items}
      discardNotices={discardNotices}
      onDismissDiscardNotices={async () => {
        await clearDiscardNotices(subject);
        setDiscardNotices([]);
      }}
      now={intake.now}
      wait={intake.wait}
      ready={intake.ready}
      readyTotal={readyTotalMinorUnits(intake.ready)}
      currency={currency}
      segment={segment}
      readyToShow={drafts.count !== null && (intake.count !== null || !!intake.error)}
      error={drafts.error || intake.error}
      confirming={confirming}
      month={monthLabel(period)}
      places={places ?? []}
      confirmedCount={confirmedCount}
      onContinueAfterConfirmation={() => setConfirmedCount(null)}
      onSegment={(next) => {
        segmentTouched.current = true;
        setSegment(next);
      }}
      onBack={() => router.back()}
      onResumeDraft={(id) =>
        router.push({ pathname: "/post", params: { draftId: id } })
      }
      onOpenCandidate={(id) =>
        router.push({ pathname: "/post", params: { candidateId: id } })
      }
      onConfirmReady={() => {
        void (async () => {
          if (!intake.ready.length || confirming) return;
          setConfirming(true);
          let addedCount = 0;
          try {
            await confirmReadyBatches(
              intake.ready.map((candidate) => ({
                workspaceId,
                candidateId: candidate.id,
                confirmed: suggestionOf(candidate),
                suggestion: suggestionOf(candidate),
                parserVersion: candidate.parserVersion,
                consentVersion: candidate.consentVersion,
              })),
              (items) => confirmCandidates({ workspaceId, items }),
              (results) =>
                applyBatchResults(results, async (id) => {
                  await intake.consume(id);
                  addedCount += 1;
                }, intake.fail),
            );
          } catch (error) {
            if (handleReadyBatchError(error, reportFailure, intake.refresh) === "wiped")
              addedCount = 0;
          } finally {
            setConfirming(false);
            if (addedCount > 0) setConfirmedCount(addedCount);
          }
        })();
      }}
      onCompleteMonth={() => router.replace("/month-close")}
    />
  );
}

export default function DraftsRoute() {
  const defaults = usePersonalDefaults();
  const { userId } = useAuth();
  return defaults && userId ? (
    <Drafts
      subject={userId}
      workspaceId={defaults.workspace.id}
      currentPeriod={defaults.workspace.currentAccountingPeriod}
      currency={defaults.workspace.functionalCurrency === "USD" ? "USD" : "COP"}
      profileId={defaults.financialAccountProfile.id}
      timeZone={defaults.workspace.timeZone}
    />
  ) : defaults === null ? (
    <Redirect href="/" />
  ) : (
    <Screen>
      <ActivityIndicator />
    </Screen>
  );
}
