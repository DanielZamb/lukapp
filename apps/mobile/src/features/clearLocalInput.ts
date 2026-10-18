import { clearPendingExpense } from "./localEntryDrafts";
import { clearIntakeCandidates } from "./intake/candidates";
import { clearDiscardNotices } from "./localDiscardNotices";

export async function clearLocalInput(subject: string) {
  await Promise.all([
    clearPendingExpense(subject),
    clearIntakeCandidates(subject),
    clearDiscardNotices(subject),
  ]);
}
