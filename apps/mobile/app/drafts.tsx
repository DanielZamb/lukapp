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
import { seedCandidate, shouldPlantDevSeed } from "../src/features/intake/devSeed";
import { suggestionOf } from "../src/features/intake/facts";
import { api } from "../src/features/api";
import { useDeviceAccessFailure } from "../src/local-auth/accessFailure";
import { Screen } from "../src/ui/core";

function Drafts({
  subject,
  workspaceId,
  currentPeriod,
  currency,
  profileId,
}: {
  subject: string;
  workspaceId: string;
  currentPeriod: { year: number; month: number };
  currency: "COP" | "USD";
  profileId: string;
}) {
  const { seed, segment: segmentParam } = useLocalSearchParams<{
    seed?: string;
    segment?: string | string[];
  }>();
  const requestedSegment = Array.isArray(segmentParam) ? segmentParam[0] : segmentParam;
  const drafts = useLocalEntryDrafts({ subject, workspaceId });
  const intake = useIntakeCandidates({ subject, workspaceId, currency });
  const confirmCandidates = useAction(api.notificationIntake.confirmCandidates);
  const places = useQuery(api.accounting.listFinancialAccountProfiles, { workspaceId });
  const reportFailure = useDeviceAccessFailure();
  const [segment, setSegment] = useState<InboxSegment>(requestedSegment === "wait" ? "wait" : "now");
  useEffect(() => {
    setSegment(requestedSegment === "wait" ? "wait" : "now");
  }, [requestedSegment]);
  const [confirming, setConfirming] = useState(false);
  const [confirmedCount, setConfirmedCount] = useState<number | null>(null);
  const seeded = useRef(false);
  const period = { year: currentPeriod.year, month: currentPeriod.month };
  useEffect(() => {
    if (!__DEV__) return;
    if (
      !shouldPlantDevSeed(typeof seed === "string" ? seed : undefined) ||
      seeded.current
    )
      return;
    seeded.current = true;
    void intake.accept(seedCandidate(workspaceId, profileId, currency));
  }, [seed, workspaceId, profileId, currency, intake.accept]);
  return (
    <DraftsScreen
      drafts={drafts.items}
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
      onSegment={setSegment}
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
    />
  ) : defaults === null ? (
    <Redirect href="/" />
  ) : (
    <Screen>
      <ActivityIndicator />
    </Screen>
  );
}
