import { z } from "zod";
import type { FunctionArgs } from "convex/server";
import { api } from "./api";

export const pendingExpenseSchema = z.object({
  workspaceId: z.string(),
  financialAccountProfileId: z.string(),
  amount: z.object({
    currency: z.enum(["COP", "USD"]),
    minorUnits: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  }),
  accountingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string(),
  idempotencyKey: z.string().min(1),
  userCategoryId: z.string().min(1).optional(),
}) satisfies z.ZodType<FunctionArgs<typeof api.accounting.recordCashExpense>>;
export type PendingExpense = z.infer<typeof pendingExpenseSchema>;
