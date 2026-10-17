import { useAction } from "convex/react";
import { useMemo } from "react";
import { ActivityIndicator, Text } from "react-native";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { useLocalEntryInteraction } from "../../local-auth/interaction";
import { Header, Screen, ui } from "../../ui/core";
import { api } from "../api";
import { useLocalEntryDrafts } from "../useLocalEntryDrafts";
import { useWorkspaceCalendar } from "../useWorkspaceCalendar";
import { MonthCloseScreen } from "./MonthCloseScreen";
import {
  evaluateMonthClose,
  monthLabel,
  periodFromMonthKey,
  periodStatusOf,
  type PeriodStatus,
} from "./model";
import { noPendingCandidates } from "./pendingCandidates";
import { useMonthClose, type MonthCloseTransport } from "./useMonthClose";

const pendingCandidates = noPendingCandidates();

export function MonthClose({
  workspaceId,
  timeZone,
  currentPeriod,
  subject,
  onBack,
  onReviewDrafts,
}: {
  workspaceId: string;
  timeZone: string;
  currentPeriod: { year: number; month: number; status: PeriodStatus };
  subject: string;
  onBack: () => void;
  onReviewDrafts: () => void;
}) {
  const calendar = useWorkspaceCalendar(timeZone);
  const period = periodFromMonthKey(calendar.month);
  const drafts = useLocalEntryDrafts({ subject, workspaceId, month: period });
  const lock = useAction(api.accounting.lockAccountingPeriod);
  const reportFailure = useDeviceAccessFailure();
  const interact = useLocalEntryInteraction();
  const transport = useMemo<MonthCloseTransport>(
    () => ({
      lock: async (input) => {
        await lock(input);
      },
      reportFailure,
    }),
    [lock, reportFailure],
  );
  const readiness =
    drafts.monthCount === null
      ? null
      : evaluateMonthClose({
          period,
          periodStatus: periodStatusOf(period, currentPeriod),
          draftCount: drafts.monthCount,
          candidateCount: pendingCandidates.countForMonth(period),
        });
  const close = useMonthClose(workspaceId, readiness, transport);
  const title = `Complete ${monthLabel(period)}`;
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
