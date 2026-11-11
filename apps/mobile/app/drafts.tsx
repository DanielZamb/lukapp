import { useFormState } from "../src/features/amount/useAmountState";
import { useAuth } from "@clerk/expo";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useAction, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { DraftsScreen, type InboxSegment } from "../src/features/DraftsScreen";
import { useLocalEntryDrafts } from "../src/features/useLocalEntryDrafts";
import { useIntakeCandidates } from "../src/features/useIntakeCandidates";
import { readyTotalMinorUnits } from "../src/features/intake/applyBatch";
import { confirmReadyCandidates, handleReadyBatchError } from "../src/features/intake/confirmReady";
import { discardCandidate } from "../src/features/intake/discard";
import { api } from "../src/features/api";
import { everyPlace } from "../src/features/placeEnding/model";
import { useDeviceAccessFailure } from "../src/local-auth/accessFailure";
import { clearDiscardNotices, DISCARD_NOTICE_TTL_MS, readDiscardNotices, type DiscardNotice } from "../src/features/localDiscardNotices";
import { Screen } from "../src/ui/core";
import { formatMonthName, useT } from "../src/i18n";
import { intakeActionError } from "../src/features/intake/presentation";

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
  currency: string;
  profileId: string;
  timeZone: string;
}) {
  const { t, language } = useT();
  const { segment: segmentParam } = useLocalSearchParams<{ segment?: string | string[] }>();
  const requestedSegment = Array.isArray(segmentParam) ? segmentParam[0] : segmentParam;
  const paramSegment = inboxSegmentFromParam(requestedSegment);
  const drafts = useLocalEntryDrafts({ subject, workspaceId });
  const intake = useIntakeCandidates({ subject, workspaceId, currency });
  const [discardNotices, setDiscardNotices] = useState<DiscardNotice[]>([]);
  const [discardRevision, setDiscardRevision] = useState(0);
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
  }, [subject, discardRevision]);
  const confirmCandidates = useAction(api.notificationIntake.confirmCandidates);
  const places = useQuery(api.accounting.listFinancialAccountProfiles, { workspaceId, ...everyPlace });
  // A Candidate naming a Place that ended or is being undone waits for the person to pick another; it is never confirmed in bulk.
  const unavailable = new Set(places?.filter((place) => place.status !== undefined && place.status !== "open").map((place) => place.id));
  const ready = places ? intake.ready.filter((candidate) => candidate.status?.kind === "pending"
    || !unavailable.has(candidate.suggestion.financialAccountProfileId)) : [];
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
  const [confirming, setConfirming, readConfirming] = useFormState(false);
  const [confirmedCount, setConfirmedCount] = useState<number | null>(null);
  const period = { year: currentPeriod.year, month: currentPeriod.month };
  return (
    <DraftsScreen
      onSources={() => router.push("/intake")}
      intakeWarning={intake.warning}
      drafts={drafts.items}
      discardNotices={[...discardNotices, ...intake.notices].slice(-64)}
      onDismissDiscardNotices={async () => {
        await intake.dismissNotices();
        await clearDiscardNotices(subject);
        setDiscardNotices([]);
      }}
      now={intake.now}
      wait={intake.wait}
      ready={ready}
      otherNotifications={intake.otherNotifications}
      readyTotal={readyTotalMinorUnits(ready)}
      currency={currency}
      segment={segment}
      readyToShow={drafts.count !== null && (intake.count !== null || !!intake.error)}
      error={drafts.error || (intake.error ? intakeActionError(t, new Error(intake.error)) : "")}
      confirming={confirming}
      month={formatMonthName(language, Date.UTC(period.year, period.month - 1, 1), { timeZone: "UTC", capitalize: false })}
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
      onDiscardCandidate={async (id, revision) => {
        const outcome = await discardCandidate(intake.service, id, revision);
        if (outcome !== "discarded") await intake.refresh().catch(() => {});
        return outcome;
      }}
      onDiscardDraft={(id) => drafts.port.discard(id)}
      onConfirmReady={() => {
        void (async () => {
          if (!ready.length || readConfirming()) return;
          setConfirming(true);
          let addedCount = 0;
          try {
            addedCount = await confirmReadyCandidates(intake.service, ready,
              (items) => confirmCandidates({ workspaceId, items }));
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
      currency={defaults.workspace.functionalCurrency}
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
