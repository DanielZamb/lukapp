import { z } from "zod";
import * as SecureStore from "expo-secure-store";
import type { FunctionArgs } from "convex/server";
import { api } from "./api";

const expense = z.object({
  workspaceId: z.string(),
  financialAccountProfileId: z.string(),
  amount: z.object({
    currency: z.enum(["COP", "USD"]),
    minorUnits: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  }),
  accountingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string(),
  idempotencyKey: z.string().min(1),
}) satisfies z.ZodType<FunctionArgs<typeof api.accounting.recordCashExpense>>;
export type PendingExpense = z.infer<typeof expense>;
const storageKey = (subject: string) => `u01.expense.${subject}`;
export async function loadPendingExpense(subject: string) {
  const raw = await SecureStore.getItemAsync(storageKey(subject));
  return raw === null ? null : expense.parse(JSON.parse(raw));
}
export function savePendingExpense(subject: string, payload: PendingExpense) {
  return SecureStore.setItemAsync(storageKey(subject), JSON.stringify(payload));
}
export function clearPendingExpense(subject: string) {
  return SecureStore.deleteItemAsync(storageKey(subject));
}
