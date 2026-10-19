import { INTAKE_BATCH_LIMIT } from "../../../../../src/notificationIntake/policy";
import type { CandidateConfirmResult } from "../../../../../src/notificationIntake/types";

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
  void refresh();
  return "retry" as const;
}
