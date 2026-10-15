import { z } from "zod";
import type { FinancialArgs } from "../../../../../src/access/client";
import { validAccountingDate } from "./money";

const classification = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("receivable"), security: z.enum(["secured", "unsecured"]), counterpartyName: z.string().trim().min(1) }),
  z.object({ kind: z.literal("personalDebt"), counterpartyName: z.string().trim().min(1) }),
  z.object({ kind: z.literal("investment"), form: z.enum(["termDeposit", "fund"]), counterpartyName: z.string().trim().min(1).optional() }),
]);
const request = z.object({
  name: z.string().trim().min(1),
  productKind: z.enum(["cash", "bankAccount", "savingsAccount", "creditCard", "loan", "receivable", "investment", "personalDebt"]),
  amount: z.object({ currency: z.string().length(3), minorUnits: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }),
  accountingDate: z.string().refine(validAccountingDate), description: z.string(), idempotencyKey: z.string().min(1),
  classificationAnswers: classification.optional(),
}) satisfies z.ZodType<Omit<FinancialArgs<"setupFinancialAccount">, "workspaceId">>;
const target = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("existing") }),
  z.object({ kind: z.literal("household"), request: z.object({
    functionalCurrency: z.string().length(3), idempotencyKey: z.string().min(1), now: z.number().finite(),
  }) satisfies z.ZodType<FinancialArgs<"createHouseholdWorkspace">> }),
]);
export const accountSetupDraft = z.object({
  kind: z.literal("account-setup"), stage: z.literal("confirmed"),
  id: z.string().min(1), workspaceId: z.string().min(1), target, request,
}).superRefine((draft, context) => {
  if (draft.request.idempotencyKey !== draft.id + "-account" ||
    (draft.target.kind === "household" && (draft.target.request.idempotencyKey !== draft.id + "-household" ||
      draft.target.request.functionalCurrency !== draft.request.amount.currency))) {
    context.addIssue({ code: "custom", message: "Setup retry identity mismatch" });
  }
});
export type AccountSetupDraft = z.infer<typeof accountSetupDraft>;
