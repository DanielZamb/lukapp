import { requireIntakeBatch } from "./policy";
import type {
  CandidateConfirmResult,
  ConfirmCandidateInput,
  ConfirmCandidateResult,
} from "./types";

export async function confirmEach(
  items: ConfirmCandidateInput[],
  confirm: (item: ConfirmCandidateInput) => Promise<ConfirmCandidateResult>,
): Promise<CandidateConfirmResult[]> {
  requireIntakeBatch(items.length);
  const results: CandidateConfirmResult[] = [];
  for (const item of items) {
    try {
      results.push({
        candidateId: item.candidateId,
        ok: true,
        result: await confirm(item),
      });
    } catch (error) {
      results.push({
        candidateId: item.candidateId,
        ok: false,
        error: error instanceof Error ? error.message : "confirm_failed",
      });
    }
  }
  return results;
}

export function leftoverFailures(results: CandidateConfirmResult[]) {
  return results.filter((result) => !result.ok);
}
