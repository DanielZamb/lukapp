import { useAction } from "convex/react";
import { useMemo } from "react";
import { ActivityIndicator, Text } from "react-native";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
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
import { noPendingCandidates } from "./pendingCandidates";
import { useMonthClose, type MonthCloseTransport } from "./useMonthClose";

const pendingCandidates = noPendingCandidates();

export function MonthClose({
  workspaceId,
  requestedPeriod,
  currentPeriod,
  subject,
  onBack,
  onReviewDrafts,
}: {
  workspaceId: string;
  requestedPeriod: ClosePeriod;
  currentPeriod: { year: number; month: number; status: PeriodStatus };
  subject: string;
  onBack: () => void;
  onReviewDrafts: () => void;
}) {
  const drafts = useLocalEntryDrafts({
    subject,
    workspaceId,
    month: requestedPeriod,
  });
  const lock = useAction(api.accounting.lockAccountingPeriod);
  const reportFailure = useDeviceAccessFailure();
  const interact = useLocalEntryInteraction();
  const transport = useMemo<MonthCloseTransport>(
    () => ({
      lock: async (input) => {
        await lock(input);
      },
      draftsInMonth: drafts.countMonth,
      reportFailure,
    }),
    [lock, drafts.countMonth, reportFailure],
  );
  const readiness =
    drafts.monthCount === null
      ? null
      : evaluateMonthClose({
          period: requestedPeriod,
          periodStatus: periodStatusOf(requestedPeriod, currentPeriod),
          draftCount: drafts.monthCount,
          candidateCount: pendingCandidates.countForMonth(requestedPeriod),
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
