import { ConvexError } from "convex/values";
import type { Language, Translator } from "../../../../../src/i18n";
import { formatMonthName } from "../../../../../src/i18n/format";

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

/** The month as it reads inside a sentence: "October" / "octubre". */
export function monthLabel(period: ClosePeriod, language: Language = "en") {
  return formatMonthName(language, Date.UTC(period.year, period.month - 1, 1), { timeZone: "UTC", capitalize: false });
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
  language: Language;
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
    monthLabel: monthLabel(input.period, input.language),
    periodStatus: input.periodStatus,
    draftCount: input.draftCount,
    candidateCount: input.candidateCount,
    blocked,
    alreadyLocked,
    canLock: !blocked && !alreadyLocked && !mismatched,
  };
}

export function footerLabel(period: ClosePeriod, { t, language }: Translator) {
  return t("review.closeTitle", { month: monthLabel(period, language) });
}

export function reviewEyebrow(readiness: MonthCloseReadiness, { t }: Translator) {
  return readiness.blocked
    ? t("review.closeEyebrowBlocked")
    : readiness.candidateCount > 0
      ? t("review.closeEyebrowCandidates")
      : t("review.closeEyebrowReady");
}

export function draftsDetail(count: number, { t, tn }: Translator) {
  return count ? tn("review.draftsPending", count) : t("review.draftsDone");
}

export function candidatesDetail(count: number, { t, tn }: Translator) {
  return count === 0 ? t("review.candidatesNone") : tn("review.candidatesPending", count);
}

export function lockActionLabel(period: ClosePeriod, { t, language }: Translator) {
  return t("review.closeAction", { month: monthLabel(period, language) });
}

export function confirmDetail(readiness: MonthCloseReadiness, { t }: Translator) {
  return t(readiness.candidateCount > 0 ? "review.closeConfirmCandidates" : "review.closeConfirm",
    { month: readiness.monthLabel });
}

export function closedTitle(period: ClosePeriod, { t, language }: Translator) {
  return t("review.closedTitle", { month: monthLabel(period, language) });
}

/** The server's own message is English; only a known rejection is shown, in the reader's language. */
export function lockFailureMessage(error: unknown, { t }: Translator) {
  const data: unknown = error instanceof ConvexError ? error.data : null;
  if (data && typeof data === "object" && "kind" in data && data.kind === "accounting")
    return t("review.closeRejected");
  return t("review.closeUnknown");
}
