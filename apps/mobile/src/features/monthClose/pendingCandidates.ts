import { monthKey, type ClosePeriod } from "./model";

export type PendingCandidateCount = {
  countForMonth(period: ClosePeriod): number;
};

export function noPendingCandidates(): PendingCandidateCount {
  return { countForMonth: () => 0 };
}

export function countCandidatesInMonth(
  candidates: { suggestion: { accountingDate: string } }[],
  period: ClosePeriod,
) {
  const prefix = `${monthKey(period)}-`;
  return candidates.filter((row) =>
    row.suggestion.accountingDate.startsWith(prefix),
  ).length;
}
