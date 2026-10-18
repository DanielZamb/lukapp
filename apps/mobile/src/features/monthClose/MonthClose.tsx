import { useAction } from "convex/react";
import { useMemo } from "react";
import { ActivityIndicator, Text } from "react-native";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { useLocalInputLease } from "../../local-auth/localInput";
import { lockWhenClear } from "./lockWhenClear";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import { Header, Screen, ui } from "../../ui/core";
import { api } from "../api";
import { useLocalEntryDrafts } from "../useLocalEntryDrafts";
import { MonthCloseScreen } from "./MonthCloseScreen";
import {
  evaluateMonthClose,
  monthLabel,
  periodStatusOf,
  type ClosePeriod,
  type PeriodStatus,
} from "./model";
import { countCandidatesInMonth } from "./pendingCandidates";
import { useIntakeCandidates } from "../useIntakeCandidates";
import { useMonthClose, type MonthCloseTransport } from "./useMonthClose";

export function MonthClose({
  workspaceId,
  requestedPeriod,
  currentPeriod,
  subject,
  currency,
  onBack,
  onReviewDrafts,
}: {
  workspaceId: string;
  requestedPeriod: ClosePeriod;
  currentPeriod: { year: number; month: number; status: PeriodStatus };
  subject: string;
  currency: "COP" | "USD";
  onBack: () => void;
  onReviewDrafts: () => void;
}) {
  const intake = useIntakeCandidates({ subject, workspaceId, currency });
  const drafts = useLocalEntryDrafts({
    subject,
    workspaceId,
    month: requestedPeriod,
  });
  const lock = useAction(api.accounting.lockAccountingPeriod);
  const reportFailure = useDeviceAccessFailure();
  const interact = useLocalEntryInteraction();
  const lease = useLocalInputLease();
  const transport = useMemo<MonthCloseTransport>(
    () => ({
      lockWhenClear: async (input) => {
        const found = await lockWhenClear(lease, subject, input, lock);
        if (found > 0) void drafts.countMonth(input.period);
        return found;
      },
      reportFailure,
    }),
    [lease, subject, lock, drafts.countMonth, reportFailure],
  );
  const readiness =
    drafts.monthCount === null
      ? null
      : evaluateMonthClose({
          period: requestedPeriod,
          periodStatus: periodStatusOf(requestedPeriod, currentPeriod),
          draftCount: drafts.monthCount,
          candidateCount: countCandidatesInMonth(
            [...intake.now, ...intake.wait],
            requestedPeriod,
          ),
        });
  const close = useMonthClose(workspaceId, readiness, transport);
  const title = `Complete ${monthLabel(requestedPeriod)}`;
  if (drafts.error)
    return (
      <Screen>
        <Header title={title} onBack={onBack} />
        <Text accessibilityRole="alert" style={ui.error}>
          {drafts.error}
        </Text>
      </Screen>
    );
  if (!readiness)
    return (
      <Screen>
        <Header title={title} onBack={onBack} />
        <ActivityIndicator accessibilityLabel="Loading month close" />
      </Screen>
    );
  return (
    <MonthCloseScreen
      readiness={readiness}
      phase={close.phase}
      onBack={onBack}
      onReviewDrafts={onReviewDrafts}
      onRequest={() => {
        interact();
        close.request();
      }}
      onCancel={close.cancel}
      onConfirm={() => {
        interact();
        void close.confirm();
      }}
    />
  );
}
