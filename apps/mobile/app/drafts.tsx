import { useAuth } from "@clerk/expo";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useAction } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { DraftsScreen, type InboxSegment } from "../src/features/DraftsScreen";
import { footerLabel, monthKey } from "../src/features/monthClose/model";
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
  const { seed } = useLocalSearchParams<{ seed?: string }>();
  const drafts = useLocalEntryDrafts({ subject, workspaceId });
  const intake = useIntakeCandidates({ subject, workspaceId, currency });
  const confirmCandidates = useAction(api.notificationIntake.confirmCandidates);
  const reportFailure = useDeviceAccessFailure();
  const [segment, setSegment] = useState<InboxSegment>("now");
  const [confirming, setConfirming] = useState(false);
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
      readyToShow={drafts.count !== null}
      error={drafts.error || intake.error}
      confirming={confirming}
      completeLabel={footerLabel(period)}
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
                applyBatchResults(results, intake.consume, intake.fail),
            );
          } catch (error) {
            handleReadyBatchError(error, reportFailure, intake.refresh);
          } finally {
            setConfirming(false);
          }
        })();
      }}
      onCompleteMonth={() =>
        router.push({ pathname: "/month-close", params: { month: monthKey(period) } })
      }
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
