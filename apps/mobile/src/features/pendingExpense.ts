import { parsePendingPosting, type PendingPosting } from "./posting/pendingPostingSchema";
import * as SecureStore from "expo-secure-store";
export type { PendingExpense } from "./pendingExpenseSchema";

const storageKey = (subject: string) => `u01.expense.${subject}`;
export function clearPendingExpense(subject: string) {
  return SecureStore.deleteItemAsync(storageKey(subject));
}

// The shared slot keeps G01's existing admission cleanup and write fencing intact.
export async function loadPendingPosting(subject: string) {
  const raw = await SecureStore.getItemAsync(storageKey(subject));
  return raw === null ? null : parsePendingPosting(JSON.parse(raw));
}
export function savePendingPosting(subject: string, entry: PendingPosting) {
  return SecureStore.setItemAsync(storageKey(subject), JSON.stringify(entry));
}
