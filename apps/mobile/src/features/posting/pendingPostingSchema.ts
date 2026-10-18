import { z } from "zod";
import type { FunctionArgs } from "convex/server";
import { api } from "../api";
import { pendingExpenseSchema } from "../pendingExpenseSchema";

const base = pendingExpenseSchema.omit({
  userCategoryId: true,
  userCategoryIds: true,
  primaryUserCategoryId: true,
});
const opening = base.extend({
  amount: base.shape.amount.extend({
    minorUnits: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }),
}) satisfies z.ZodType<
  FunctionArgs<typeof api.accounting.recordOpeningPosition>
>;
const transfer = base.omit({ financialAccountProfileId: true }).extend({
  sourceFinancialAccountProfileId: z.string().min(1),
  destinationFinancialAccountProfileId: z.string().min(1),
}) satisfies z.ZodType<
  FunctionArgs<typeof api.accounting.recordAccountTransfer>
>;
const setup = opening
  .omit({ financialAccountProfileId: true, description: true })
  .extend({
    name: z.string().trim().min(1),
    emoji: z.string().min(1).optional(),
    productKind: z.enum([
      "cash",
      "bankAccount",
      "savingsAccount",
      "creditCard",
      "loan",
    ]),
  }) satisfies z.ZodType<
  FunctionArgs<typeof api.accounting.setupFinancialAccountProfile>
>;

export const pendingPostingSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("expense"), payload: pendingExpenseSchema }),
  z.object({ kind: z.literal("income"), payload: pendingExpenseSchema }),
  z.object({ kind: z.literal("transfer"), payload: transfer }),
  z.object({ kind: z.literal("opening"), payload: opening }),
  z.object({
    kind: z.literal("setup"),
    payload: setup,
    target: z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("source") }),
        z.object({
          kind: z.literal("destination"),
          sourceProfileId: z.string().min(1),
        }),
      ])
      .optional(),
  }),
]);
export type PendingPosting = z.infer<typeof pendingPostingSchema>;
export type PlaceKind = z.infer<typeof setup>["productKind"];
export function parsePendingPosting(value: unknown): PendingPosting {
  const legacy = pendingExpenseSchema.safeParse(value);
  return legacy.success
    ? { kind: "expense", payload: legacy.data }
    : pendingPostingSchema.parse(value);
}
