import { v } from "convex/values";
import { money, productKind, profileClassificationAnswers } from "./validators";

import { categoryNature, natureAnswer, categorySnapshot, correctionSource, userCategory } from "./categoryAnnotationValidators";
export { categoryFields, userCategory, categoryClassification, categorySnapshot, categoryCorrection } from "./categoryAnnotationValidators";
export const categorySelection = v.union(
  v.object({ kind: v.literal("preset"), concept: v.string() }),
  v.object({ kind: v.literal("custom"), answer: natureAnswer, confirmation: v.union(v.literal("answered"), v.literal("lexiconConfirmed")) }),
);
export const categoryChange = v.union(
  v.object({ kind: v.literal("rename"), name: v.string() }),
  v.object({ kind: v.literal("archive") }),
  v.object({ kind: v.literal("merge"), targetCategoryId: v.string() }),
  v.object({ kind: v.literal("defaultAccount"), accountCode: v.string() }),
);
export const reclassificationTarget = v.union(
  v.object({ kind: v.literal("category"), nature: categoryNature, accountCode: v.string() }),
  v.object({ kind: v.literal("profile"), setup: v.object({ name: v.string(), productKind,
    classificationAnswers: v.optional(profileClassificationAnswers), amount: money, accountingDate: v.string(), description: v.string() }) }),
);
export const reclassificationPreview = v.object({ categoryId: v.string(), categoryRevision: v.number(), revisionToken: v.string(), entryCount: v.number(), lineCount: v.number(), amount: money,
  lockedEntryCount: v.number(), lockedAmount: money, correctionDates: v.array(v.string()),
  buckets: v.array(v.object({ accountingDate: v.string(), ledgerAccountId: v.string(), signedMinorUnits: v.number(), sources: v.array(correctionSource), rootSources: v.array(correctionSource), priorLockedPeriods: v.array(v.string()), snapshot: categorySnapshot })) });
export const reclassificationResult = v.object({ category: userCategory, correctionEntryIds: v.array(v.string()), financialAccountProfileId: v.optional(v.string()), replay: v.boolean() });
