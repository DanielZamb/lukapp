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
  userCategoryIds: z.array(z.string().min(1)).max(3).optional(),
  primaryUserCategoryId: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
  const ids = value.userCategoryIds ?? (value.userCategoryId ? [value.userCategoryId] : []);
  if ((value.userCategoryId !== undefined && value.userCategoryIds !== undefined) ||
    new Set(ids).size !== ids.length ||
    (value.primaryUserCategoryId !== undefined && !ids.includes(value.primaryUserCategoryId)))
    ctx.addIssue({ code: "custom", message: "Invalid category selection" });
}) satisfies z.ZodType<FunctionArgs<typeof api.accounting.recordCashExpense>>;
export type PendingExpense = z.infer<typeof pendingExpenseSchema>;
