import { v } from "convex/values";

export const categoryNature = v.union(
  v.literal("Expense"),
  v.literal("Income"),
);
export const natureAnswer = v.union(
  v.literal("spend"),
  v.literal("receive"),
  v.literal("stillMine"),
  v.literal("payDebt"),
);
export const categoryStyle = v.object({
  emoji: v.string(),
  tone: v.union(
    v.literal("primary"),
    v.literal("positive"),
    v.literal("warning"),
  ),
});
export const categorySelection = v.union(
  v.object({
    kind: v.literal("preset"),
    presetId: v.string(),
    style: categoryStyle,
  }),
  v.object({
    kind: v.literal("custom"),
    name: v.string(),
    answer: natureAnswer,
    style: categoryStyle,
  }),
);
export const categoryFields = {
  name: v.string(),
  normalizedName: v.string(),
  nature: v.optional(categoryNature),
  natureSource: v.union(
    v.literal("preset"),
    v.literal("answered"),
    v.literal("lexiconConfirmed"),
    v.literal("legacy"),
  ),
  defaultPostingAccountCode: v.optional(v.string()),
  classification: v.union(
    v.object({ kind: v.literal("preset"), concept: v.string() }),
    v.object({
      kind: v.literal("lexicon"),
      concept: v.string(),
      version: v.string(),
    }),
    v.object({ kind: v.literal("fallback"), version: v.string() }),
  ),
  style: categoryStyle,
};
export const userCategory = v.object({
  id: v.string(),
  workspaceId: v.string(),
  ...categoryFields,
});
export const createCategoryResult = v.union(
  v.object({ kind: v.literal("category"), category: userCategory }),
  v.object({
    kind: v.literal("accountSetupRequired"),
    name: v.string(),
    answer: v.union(v.literal("stillMine"), v.literal("payDebt")),
  }),
);
