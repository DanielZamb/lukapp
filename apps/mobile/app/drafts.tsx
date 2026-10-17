import { useAuth } from "@clerk/expo";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useAction } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { DraftsScreen, type InboxSegment } from "../src/features/DraftsScreen";
import { useLocalEntryDrafts } from "../src/features/useLocalEntryDrafts";
import { useIntakeCandidates } from "../src/features/useIntakeCandidates";
import { applyBatchResults, readyTotalMinorUnits } from "../src/features/intake/applyBatch";
import { suggestionOf } from "../src/features/intake/facts";
import { api } from "../src/features/api";
import { Screen } from "../src/ui/core";
import type { IntakeCandidate } from "../src/features/intake/candidates";

function seedCandidate(
  workspaceId: string,
  profileId: string,
  currency: "COP" | "USD",
): IntakeCandidate {
  const createdAt = Date.now();
  return {
    id: "seed-groceries",
    createdAt,
    expiresAt: createdAt + 2 * 24 * 60 * 60 * 1000,
    workspaceId,
    currency,
    suggestion: {
      direction: "out",
      description: "Groceries",
      amountMinorUnits: 126400,
      accountingDate: "2026-10-17",
      financialAccountProfileId: profileId,
      userCategoryIds: [],
      primaryUserCategoryId: null,
    },
    parserVersion: "parser@test",
    consentVersion: "consent@test",
  };
}

function Drafts({
  subject,
  workspaceId,
  currency,
  profileId,
}: {
  subject: string;
  workspaceId: string;
  currency: "COP" | "USD";
  profileId: string;
}) {
  const { seed } = useLocalSearchParams<{ seed?: string }>();
  const drafts = useLocalEntryDrafts({ subject, workspaceId });
  const intake = useIntakeCandidates({ subject, workspaceId });
  const confirmCandidates = useAction(api.notificationIntake.confirmCandidates);
  const [segment, setSegment] = useState<InboxSegment>("now");
  const [confirming, setConfirming] = useState(false);
  const seeded = useRef(false);
  useEffect(() => {
    if (seed !== "1" || seeded.current) return;
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
      readyToShow={drafts.count !== null && intake.count !== null}
      error={drafts.error || intake.error}
      confirming={confirming}
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
            const batch = await confirmCandidates({
              workspaceId,
              items: intake.ready.map((candidate) => ({
                workspaceId,
                candidateId: candidate.id,
                confirmed: suggestionOf(candidate),
                suggestion: suggestionOf(candidate),
                parserVersion: candidate.parserVersion,
                consentVersion: candidate.consentVersion,
              })),
            });
            await applyBatchResults(batch.results, intake.consume, intake.fail);
          } catch {
            await intake.refresh();
          } finally {
            setConfirming(false);
          }
        })();
      }}
      onMonthClose={() => router.push("/month-close")}
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
