import { v } from "convex/values";

export const intakeSuggestion = v.object({
  direction: v.union(v.literal("in"), v.literal("out")),
  description: v.string(),
  amount: v.object({
    currency: v.union(v.literal("COP"), v.literal("USD")),
    minorUnits: v.number(),
  }),
  accountingDate: v.string(),
  financialAccountProfileId: v.string(),
  userCategoryIds: v.array(v.string()),
  primaryUserCategoryId: v.union(v.string(), v.null()),
});

export const confirmOneArgs = {
  workspaceId: v.string(),
  candidateId: v.string(),
  confirmed: intakeSuggestion,
  suggestion: intakeSuggestion,
  parserVersion: v.string(),
  consentVersion: v.string(),
};

export const confirmOneResult = v.object({
  posted: v.object({
    id: v.string(),
    description: v.string(),
    amount: v.object({ currency: v.string(), minorUnits: v.number() }),
    replay: v.boolean(),
  }),
  receipt: v.object({
    id: v.string(),
    workspaceId: v.string(),
    journalEntryId: v.string(),
    idempotencyKey: v.string(),
    suggestion: intakeSuggestion,
    changedFields: v.array(v.string()),
    parserVersion: v.string(),
    consentVersion: v.string(),
    actorId: v.string(),
    confirmedAt: v.number(),
  }),
  replay: v.boolean(),
});

export const confirmCandidatesArgs = {
  workspaceId: v.string(),
  items: v.array(v.object(confirmOneArgs)),
};

export const confirmCandidatesResult = v.object({
  results: v.array(
    v.union(
      v.object({
        candidateId: v.string(),
        ok: v.literal(true),
        result: confirmOneResult,
      }),
      v.object({
        candidateId: v.string(),
        ok: v.literal(false),
        error: v.string(),
      }),
    ),
  ),
});
