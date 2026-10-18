import { useQuery } from "convex/react";
import { api } from "../api";
import { inboxBadgeCount } from "../inboxCount";
import { evaluateMonthClose, type ClosePeriod, type PeriodStatus } from "../monthClose/model";
import { countCandidatesInMonth } from "../monthClose/pendingCandidates";
import { useIntakeCandidates } from "../useIntakeCandidates";
import { useLocalEntryDrafts } from "../useLocalEntryDrafts";
import { useWorkspaceCalendar } from "../useWorkspaceCalendar";
import { attentionRows, type AttentionState } from "./model";

export function useAttention(input: {
  subject: string;
  workspaceId: string;
  currency: string;
  timeZone: string;
  currentPeriod: ClosePeriod & { status: PeriodStatus };
}): { inboxCount: number | undefined; alerts: AttentionState } {
  const calendar = useWorkspaceCalendar(input.timeZone);
  const drafts = useLocalEntryDrafts({ ...input, month: input.currentPeriod });
  const intake = useIntakeCandidates({
    ...input,
    currency: input.currency === "USD" ? "USD" : "COP",
  });
  const recovery = useQuery(api.savingsRecovery.evaluate, {
    workspaceId: input.workspaceId,
    month: calendar.month,
  });
  const error = drafts.error || intake.error;
  const inboxCount = error ? undefined : inboxBadgeCount(drafts.count, intake.count);
  if (error) return { inboxCount, alerts: { kind: "error", message: error } };
  if (inboxCount === undefined || drafts.monthCount === null || recovery === undefined)
    return { inboxCount, alerts: { kind: "loading" } };
  return {
    inboxCount,
    alerts: {
      kind: "ready",
      rows: attentionRows({
        draftCount: drafts.items.length,
        draftSegment: drafts.items.some((item) => item.status === "posting") ? "now" : "wait",
        candidateNowCount: intake.now.length,
        candidateWaitCount: intake.wait.length,
        plans: recovery.plans,
        currency: recovery.currency,
        readiness: evaluateMonthClose({
          period: input.currentPeriod,
          periodStatus: input.currentPeriod.status,
          draftCount: drafts.monthCount,
          candidateCount: countCandidatesInMonth([...intake.now, ...intake.wait], input.currentPeriod),
        }),
      }),
    },
  };
}
