import type { CandidateConfirmResult } from "../../../../../src/notificationIntake/types";
import { leftoverFailures } from "../../../../../src/notificationIntake/confirmEach";
import type { IntakeCandidate, IntakeCandidateId } from "./candidates";

export async function applyBatchResults(
  results: CandidateConfirmResult[],
  consume: (id: IntakeCandidateId) => Promise<unknown>,
  fail: (id: IntakeCandidateId, error: string) => Promise<unknown>,
) {
  for (const result of results) {
    if (result.ok) await consume(result.candidateId);
    else await fail(result.candidateId, result.error);
  }
  return leftoverFailures(results);
}

export function readyTotalMinorUnits(ready: IntakeCandidate[]) {
  return ready.reduce(
    (sum, row) => {
      const amount = row.suggestion.amountMinorUnits;
      if (amount === null) throw new Error("Resolve Candidate amount before totaling Ready entries");
      return sum + Math.abs(amount);
    },
    0,
  );
}
