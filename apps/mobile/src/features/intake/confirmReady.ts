import { INTAKE_BATCH_LIMIT } from "../../../../../src/notificationIntake/policy";
import type { IntakeService } from "./service";
import { candidateSendsAsSaved } from "./amountText";
import type { IntakeCandidate } from "./candidates";
import type { ConfirmCandidateInput, CandidateConfirmResult } from "../../../../../src/notificationIntake/types";

export function chunkReady<T>(items: T[], size = INTAKE_BATCH_LIMIT) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    chunks.push(items.slice(index, index + size));
  return chunks;
}

export async function confirmReadyBatches<T>(
  items: T[],
  confirm: (chunk: T[]) => Promise<{ results: CandidateConfirmResult[] }>,
  apply: (results: CandidateConfirmResult[]) => Promise<unknown>,
) {
  for (const chunk of chunkReady(items)) {
    const batch = await confirm(chunk);
    await apply(batch.results);
  }
}

export function handleReadyBatchError(
  error: unknown,
  reportFailure: (error: unknown) => boolean,
  refresh: () => void | Promise<unknown>,
) {
  if (reportFailure(error)) return "wiped" as const;
  void Promise.resolve(refresh()).catch((failure: unknown) => { reportFailure(failure); });
  return "retry" as const;
}

/**
 * Confirms the Ready Candidates in batches. A Candidate in review whose amount would not be sent as it is when opened
 * alone, because it asks for confirmation or re-entry or reads other money, is left in review for the person, even
 * when an older list still called it Ready; it is checked before any of its batch is frozen, so leaving it out freezes
 * nothing else. A frozen Candidate is sent again with its stored command.
 */
export async function confirmReadyCandidates(
  service: IntakeService,
  candidates: IntakeCandidate[],
  confirm: (items: ConfirmCandidateInput[]) => Promise<{ results: CandidateConfirmResult[] }>,
) {
  let confirmed = 0;
  for (const chunk of chunkReady(candidates)) {
    const current = new Map(service.candidates().map((candidate) => [candidate.id, candidate]));
    const rows = chunk.map((candidate) => {
      const row = service.read(candidate.id);
      if (!row) throw new Error("Candidate unavailable");
      return row;
    }).filter((row) => {
      const candidate = current.get(row.id);
      return row.status.kind !== "review" || (!!candidate && candidateSendsAsSaved(candidate));
    });
    if (!rows.length) continue;
    const items: ConfirmCandidateInput[] = [];
    for (const row of rows) items.push(await service.beginConfirmation(row.id, row.recordRevision));
    service.assertAdmitted();
    const batch = await confirm(items);
    await service.recordOutcomes(batch.results);
    await service.applyRecordedOutcomes();
    confirmed += batch.results.filter((result) => result.ok).length;
  }
  return confirmed;
}
