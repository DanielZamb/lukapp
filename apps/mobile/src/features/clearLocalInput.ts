import { clearPendingExpense } from "./localEntryDrafts";
import { clearIntakeCandidates } from "./intake/candidates";

export async function clearLocalInput(subject: string) {
  await Promise.all([
    clearPendingExpense(subject),
    clearIntakeCandidates(subject),
  ]);
}
