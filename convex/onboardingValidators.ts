import { v } from "convex/values";
import { financialAccountProfile, openingPositionResult, workspace } from "./validators";
import { categorySelection, userCategory } from "./categoryValidators";

export const firstRunArgs = {
  functionalCurrency: v.string(),
  purchaseNotifications: v.boolean(),
  categories: v.array(v.object({ name: v.string(), selection: categorySelection })),
  startingAmountMinorUnits: v.number(),
  accountingDate: v.string(),
  now: v.number(),
};
export const firstRunResult = v.object({
  workspace,
  opening: openingPositionResult,
  categories: v.array(userCategory),
  purchaseNotifications: v.boolean(),
  replay: v.boolean(),
});
export const firstRunStatusResult = v.union(
  v.object({ kind: v.literal("required") }),
  v.object({ kind: v.literal("complete"), workspace, profile: financialAccountProfile, purchaseNotifications: v.boolean() }),
  v.object({ kind: v.literal("existing"), workspace }),
);
