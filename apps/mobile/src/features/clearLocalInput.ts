import { clearPendingExpense } from "./localEntryDrafts";
import { clearNativeIntake } from "./intake/cleanup";

export async function clearLocalInput(subject: string) {
  await Promise.all([
    clearPendingExpense(subject),
    clearNativeIntake(subject),
  ]);
}
