import { v } from "convex/values";
export const categoryNature = v.union(v.literal("Expense"), v.literal("Income"));
export const natureAnswer = v.union(categoryNature, v.literal("stillMine"), v.literal("payingDebt"));
export const accountResolution = v.union(
  v.object({ kind: v.literal("preset"), concept: v.string(), policy: v.string(), accountCode: v.string() }),
  v.object({ kind: v.literal("lexicon"), concept: v.string(), policy: v.string(), accountCode: v.string() }),
  v.object({ kind: v.literal("fallback"), policy: v.string(), accountCode: v.string(), candidates: v.array(v.string()) }),
  v.object({ kind: v.literal("advanced"), accountCode: v.string() }),
);
export const natureProvenance = v.union(
  v.object({ kind: v.literal("preset"), concept: v.string() }),
  v.object({ kind: v.literal("answered") }),
  v.object({ kind: v.literal("lexiconConfirmed"), policy: v.string(), answer: natureAnswer }),
);
export const categoryClassification = v.union(
  v.object({ kind: v.literal("unresolved") }),
  v.object({ kind: v.literal("resolved"), nature: categoryNature, natureProvenance, account: accountResolution }),
  v.object({ kind: v.literal("converted"), financialAccountProfileId: v.string() }),
);
export const categoryFields = {
  workspaceId: v.string(), name: v.string(), revision: v.number(),
  status: v.union(v.literal("active"), v.literal("archived")),
  mergedIntoCategoryId: v.optional(v.string()), classification: categoryClassification,
};
export const userCategory = v.object({ id: v.string(), ...categoryFields });
export const categorySnapshot = v.object({ categoryId: v.string(), revision: v.number(), name: v.string(), nature: categoryNature, natureProvenance, account: accountResolution });
export const correctionSource = v.object({ entryId: v.string(), lineNumber: v.number(), signedMinorUnits: v.number() });
export const categoryCorrection = v.object({ reclassificationKey: v.string(), side: v.union(v.literal("reversing"), v.literal("replacement")), sources: v.array(correctionSource), rootSources: v.array(correctionSource), priorLockedPeriods: v.array(v.string()) });
