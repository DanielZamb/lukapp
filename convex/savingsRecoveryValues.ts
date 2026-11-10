import { v } from "convex/values";

export const cancellation = v.object({
  id: v.string(), workspaceId: v.string(), planId: v.string(), reason: v.optional(v.string()),
  idempotencyKey: v.string(), createdBy: v.string(), eventTime: v.number(), recordedAt: v.number(),
});
export const correction = v.object({
  id: v.string(), workspaceId: v.string(), contributionId: v.string(), reason: v.string(),
  targetPlanId: v.optional(v.string()), replacementContributionId: v.optional(v.string()),
  contributionDate: v.string(), idempotencyKey: v.string(), createdBy: v.string(), recordedAt: v.number(),
});
export const contribution = v.object({
  id: v.string(), workspaceId: v.string(), planId: v.string(),
  transferJournalEntryId: v.string(), amountMinorUnits: v.number(),
  contributionDate: v.string(), idempotencyKey: v.string(), createdBy: v.string(),
  recordedAt: v.number(), correctsContributionId: v.optional(v.string()),
});
const profile = v.object({ id: v.string(), name: v.string(), productKind: v.string() });
export const suggestion = v.object({
  principalMinorUnits: v.number(), installmentCount: v.number(), installmentMinorUnits: v.number(),
  minInstallmentMinorUnits: v.number(), maxInstallmentMinorUnits: v.number(),
  impliedAnnualRateBps: v.number(), premiumMinorUnits: v.number(), targetMinorUnits: v.number(),
});
export const plan = v.object({
  status: v.union(v.literal("active"), v.literal("suspended"), v.literal("cancelled"), v.literal("completed")),
  id: v.string(), title: v.string(), sourceJournalEntryId: v.string(), sourceTitle: v.string(),
  destinationFinancialAccountProfileId: v.string(), destinationName: v.string(),
  principalMinorUnits: v.number(), installmentCount: v.number(), installmentMinorUnits: v.number(),
  impliedAnnualRateBps: v.number(), activationMonth: v.string(), currency: v.string(),
  recoveredMinorUnits: v.number(), remainingMinorUnits: v.number(), targetMinorUnits: v.number(),
  dueMinorUnits: v.number(),
  cancellation: v.optional(cancellation),
  replacesPlanId: v.optional(v.string()), replacedByPlanId: v.optional(v.string()),
  contributionHistory: v.array(v.object({ ...contribution.fields,
    status: v.union(v.literal("active"), v.literal("voided"), v.literal("corrected")),
    transferReversed: v.boolean(), correction: v.optional(correction),
  })),
});
export const candidate = v.object({
  journalEntryId: v.string(), title: v.string(), accountingDate: v.string(),
  amountMinorUnits: v.number(), financialAccountProfileId: v.optional(v.string()),
  placeName: v.optional(v.string()),
});
export const evaluation = v.object({
  month: v.string(), currentMonth: v.string(), currency: v.string(),
  plans: v.array(plan), candidates: v.array(candidate),
  destinations: v.array(profile), sources: v.array(profile),
});
export const activateArgs = {
  replacesPlanId: v.optional(v.string()),
  workspaceId: v.string(), sourceJournalEntryId: v.string(),
  destinationFinancialAccountProfileId: v.string(), installmentCount: v.number(),
  installmentMinorUnits: v.number(), idempotencyKey: v.string(),
};
export const activateResult = v.object({
  plan: v.object({
    id: v.string(), workspaceId: v.string(), sourceJournalEntryId: v.string(),
    destinationFinancialAccountProfileId: v.string(), title: v.string(),
    principalMinorUnits: v.number(), installmentCount: v.number(), installmentMinorUnits: v.number(),
    impliedAnnualRateBps: v.number(), currency: v.string(), activationMonth: v.string(),
    idempotencyKey: v.string(), createdBy: v.string(), createdAt: v.number(),
    replacesPlanId: v.optional(v.string()),
  }),
  replay: v.boolean(),
});
export const contributeArgs = {
  workspaceId: v.string(), planId: v.string(),
  sourceFinancialAccountProfileId: v.string(),
  amount: v.object({ currency: v.string(), minorUnits: v.number() }),
  accountingDate: v.string(), description: v.string(), idempotencyKey: v.string(),
};
export const contributeResult = v.object({
  transfer: v.object({
    id: v.string(), amount: v.object({ currency: v.string(), minorUnits: v.number() }),
  }),
  contribution,
  replay: v.boolean(),
});

export const cancelArgs = {
  workspaceId: v.string(), planId: v.string(), reason: v.optional(v.string()), idempotencyKey: v.string(),
};
export const cancelResult = v.object({ cancellation, replay: v.boolean() });
export const correctArgs = {
  workspaceId: v.string(), contributionId: v.string(), reason: v.string(),
  targetPlanId: v.optional(v.string()), idempotencyKey: v.string(),
};
export const correctResult = v.object({ correction, replacementContribution: v.optional(contribution), replay: v.boolean() });
