import { v } from "convex/values";
import { money } from "./validators";

export const revisionFields = {
  workspaceId: v.id("workspaces"), categoryId: v.id("userCategories"),
  effectiveMonth: v.string(), limitMinorUnits: v.number(), expectedRevisionId: v.union(v.string(), v.null()),
  sequence: v.number(), idempotencyKey: v.string(), createdBy: v.string(), createdAt: v.number(),
};
export const revision = v.object({ ...revisionFields, id: v.string(), workspaceId: v.string(), categoryId: v.string() });
export const setLimitArgs = {
  workspaceId: v.string(), categoryId: v.string(), effectiveMonth: v.string(),
  limit: money, expectedRevisionId: v.union(v.string(), v.null()), idempotencyKey: v.string(),
};
export const setLimitResult = v.object({ revision, replay: v.boolean() });
const category = v.object({ id: v.string(), name: v.string(), emoji: v.string() });
export const evaluation = v.object({
  month: v.string(), currentMonth: v.string(), currency: v.string(), totalsOverlap: v.literal(true),
  jars: v.array(v.object({ category, revisionId: v.string(), limitMinorUnits: v.number(), consumptionMinorUnits: v.number() })),
  availableCategories: v.array(category),
});
