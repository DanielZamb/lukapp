import type { ClosePeriod } from "./model";

export type PendingCandidateCount = {
  countForMonth(period: ClosePeriod): number;
};

export function noPendingCandidates(): PendingCandidateCount {
  return { countForMonth: () => 0 };
}
