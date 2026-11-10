import type { DiscardOutcome } from "../discardOutcome";
import type { IntakeService } from "./service";

const refusals = new Map<string, DiscardOutcome>([
  ["RECORD_REVISION_MISMATCH", "changed"],
  ["Confirmation frozen", "frozen"],
  ["Candidate unavailable", "gone"],
]);

/** Discards one open Candidate at the revision the person saw. The service refuses a frozen confirmation. */
export async function discardCandidate(service: IntakeService, id: string, revision: number): Promise<DiscardOutcome> {
  try {
    await service.deleteCandidate(id, revision);
    return "discarded";
  } catch (error) {
    const refusal = error instanceof Error ? refusals.get(error.message) : undefined;
    if (!refusal) throw error;
    return refusal;
  }
}
