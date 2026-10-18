import type { InboxSegment } from "../DraftsScreen";
import { formatMoney } from "../money";
import {
  footerLabel,
  mismatchDetail,
  monthKey,
  type MonthCloseReadiness,
} from "../monthClose/model";
import type { RecoveryPlanView } from "../recovery/model";

export type AlertDestination =
  | { pathname: "/drafts"; params: { segment: InboxSegment } }
  | { pathname: "/recovery" }
  | { pathname: "/month-close"; params: { month: string } };

export type AttentionRow = {
  id: string;
  title: string;
  detail: string;
  destination: AlertDestination;
};

export type AttentionState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; rows: AttentionRow[] };

export function attentionRows(input: {
  draftCount: number;
  draftSegment: InboxSegment;
  candidateNowCount: number;
  candidateWaitCount: number;
  plans: Pick<RecoveryPlanView, "dueMinorUnits">[];
  currency: string;
  readiness: MonthCloseReadiness;
}): AttentionRow[] {
  const rows: AttentionRow[] = [];
  if (input.draftCount > 0)
    rows.push({
      id: "drafts",
      title: "Review Drafts",
      detail: `${input.draftCount} on this device`,
      destination: { pathname: "/drafts", params: { segment: input.draftSegment } },
    });
  if (input.candidateNowCount > 0)
    rows.push({
      id: "candidates-now",
      title: "Candidates need you",
      detail: `${input.candidateNowCount} to review now`,
      destination: { pathname: "/drafts", params: { segment: "now" } },
    });
  if (input.candidateWaitCount > 0)
    rows.push({
      id: "candidates-wait",
      title: "Candidates can wait",
      detail: `${input.candidateWaitCount} for later review`,
      destination: { pathname: "/drafts", params: { segment: "wait" } },
    });
  const due = input.plans.filter((plan) => plan.dueMinorUnits > 0);
  if (due.length > 0)
    rows.push({
      id: "recovery",
      title: "Recovery due",
      detail: `${formatMoney({
        currency: input.currency,
        minorUnits: due.reduce((sum, plan) => sum + plan.dueMinorUnits, 0),
      })} across ${due.length} ${due.length === 1 ? "plan" : "plans"}`,
      destination: { pathname: "/recovery" },
    });
  const { readiness } = input;
  if (!readiness.alreadyLocked)
    rows.push({
      id: "month-close",
      title: footerLabel(readiness.period),
      detail: readiness.periodStatus === "mismatch"
        ? mismatchDetail()
        : readiness.blocked
          ? `${readiness.draftCount} dated Drafts need review first`
          : readiness.candidateCount > 0
            ? `Ready to review. ${readiness.candidateCount} Candidates can stay for later.`
            : "Ready to review and lock",
      destination: { pathname: "/month-close", params: { month: monthKey(readiness.period) } },
    });
  return rows;
}

export function updatesDetail(state: AttentionState) {
  if (state.kind === "loading") return "Loading updates";
  if (state.kind === "error") return "Review updates";
  return state.rows.length === 0
    ? "All caught up"
    : `${state.rows.length} ${state.rows.length === 1 ? "update" : "updates"}`;
}
