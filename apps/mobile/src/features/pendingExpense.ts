import * as SecureStore from "expo-secure-store";
import { pendingExpenseSchema, type PendingExpense } from "./pendingExpenseSchema";
export type { PendingExpense } from "./pendingExpenseSchema";

const storageKey = (subject: string) => `u01.expense.${subject}`;
export async function loadPendingExpense(subject: string) {
  const raw = await SecureStore.getItemAsync(storageKey(subject));
  return raw === null ? null : pendingExpenseSchema.parse(JSON.parse(raw));
}
export function savePendingExpense(subject: string, payload: PendingExpense) {
  return SecureStore.setItemAsync(storageKey(subject), JSON.stringify(payload));
}
export function clearPendingExpense(subject: string) {
  return SecureStore.deleteItemAsync(storageKey(subject));
}
