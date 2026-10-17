import { ConvexError } from "convex/values";

export type ClosePeriod = { year: number; month: number };
export type PeriodStatus = "open" | "locked" | "not_opened";

export type MonthCloseReadiness = {
  period: ClosePeriod;
  monthLabel: string;
  periodStatus: PeriodStatus;
  draftCount: number;
  candidateCount: number;
  blocked: boolean;
  alreadyLocked: boolean;
  canLock: boolean;
};

export function periodFromMonthKey(month: string): ClosePeriod {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error("Month required");
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function monthLabel(period: ClosePeriod) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    timeZone: "UTC",
  }).format(Date.UTC(period.year, period.month - 1, 1));
}

export function periodStatusOf(
  period: ClosePeriod,
  current: ClosePeriod & { status: PeriodStatus },
): PeriodStatus {
  return current.year === period.year && current.month === period.month
    ? current.status
    : "not_opened";
}

export function evaluateMonthClose(input: {
  period: ClosePeriod;
  periodStatus: PeriodStatus;
  draftCount: number;
  candidateCount: number;
}): MonthCloseReadiness {
  const alreadyLocked = input.periodStatus === "locked";
  const blocked = !alreadyLocked && input.draftCount > 0;
  return {
    period: input.period,
    monthLabel: monthLabel(input.period),
    periodStatus: input.periodStatus,
    draftCount: input.draftCount,
    candidateCount: input.candidateCount,
    blocked,
    alreadyLocked,
    canLock: !blocked && !alreadyLocked,
  };
}

export function footerLabel(period: ClosePeriod) {
  return `Complete ${monthLabel(period)}`;
}

export function reviewEyebrow(blocked: boolean) {
  return blocked ? "1 STEP NEEDS ATTENTION" : "READY TO REVIEW";
}

export function draftsDetail(count: number) {
  return count ? `${count} still need review` : "All reviewed";
}

export function candidatesDetail(count: number) {
  return count === 0 ? "None pending" : `${count} still pending`;
}

export function lockActionLabel(period: ClosePeriod) {
  return `Complete and lock ${monthLabel(period)}`;
}

export function confirmDetail(readiness: MonthCloseReadiness) {
  const lock =
    `This review locks ${readiness.monthLabel}. It does not move money or change balances.`;
  return readiness.candidateCount > 0
    ? `${lock} Candidates will stay for later review.`
    : lock;
}

export function closedTitle(period: ClosePeriod) {
  return `${monthLabel(period)} is complete`;
}

export function closedDetail() {
  return "The month is locked. Balances and posted activity did not change because of the close itself.";
}

export function lockFailureMessage(error: unknown) {
  const data: unknown = error instanceof ConvexError ? error.data : null;
  if (
    data &&
    typeof data === "object" &&
    "kind" in data &&
    data.kind === "accounting" &&
    "message" in data &&
    typeof data.message === "string"
  )
    return data.message;
  return "Could not confirm the close. Retry to lock the same month safely.";
}
