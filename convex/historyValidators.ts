import { v } from "convex/values";
import { money } from "./validators";

export const activityRow = v.object({
  id: v.string(),
  financialAccountProfileId: v.optional(v.string()),
  title: v.string(),
  date: v.string(),
  detail: v.string(),
  userCategories: v.array(v.object({ id: v.string(), name: v.string() })),
  primaryUserCategoryId: v.optional(v.string()),
  reversed: v.boolean(),
  reversesEntryId: v.optional(v.string()),
  reversedByEntryId: v.optional(v.string()),
  amount: money,
});
