import { ConvexError } from "convex/values";

export type ClosePeriod = { year: number; month: number };
export type PeriodStatus = "open" | "locked" | "not_opened" | "mismatch";

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

export function monthKey(period: ClosePeriod) {
  return `${String(period.year).padStart(4, "0")}-${String(period.month).padStart(2, "0")}`;
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
    : "mismatch";
}

export function evaluateMonthClose(input: {
  period: ClosePeriod;
  periodStatus: PeriodStatus;
  draftCount: number;
  candidateCount: number;
}): MonthCloseReadiness {
  const alreadyLocked = input.periodStatus === "locked";
  const mismatched = input.periodStatus === "mismatch";
  const blocked = !alreadyLocked && !mismatched && input.draftCount > 0;
  return {
    period: input.period,
    monthLabel: monthLabel(input.period),
    periodStatus: input.periodStatus,
    draftCount: input.draftCount,
    candidateCount: input.candidateCount,
    blocked,
    alreadyLocked,
    canLock: !blocked && !alreadyLocked && !mismatched,
  };
}

export function footerLabel(period: ClosePeriod) {
  return `Complete ${monthLabel(period)}`;
}

export function reviewEyebrow(readiness: MonthCloseReadiness) {
  return readiness.blocked
    ? "1 STEP NEEDS ATTENTION"
    : readiness.candidateCount > 0
      ? "CANDIDATES STILL LOCAL"
      : "READY TO REVIEW";
}

export function draftsDetail(count: number) {
  return count ? `${count} still need review` : "All reviewed";
}

export function candidatesDetail(count: number) {
  return count === 0
    ? "None waiting"
    : `${count} still local. Intake is not a statement.`;
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

export function mismatchDetail() {
  return "This device and the workspace do not agree on the current month yet.";
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
