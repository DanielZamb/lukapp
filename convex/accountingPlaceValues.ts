import { v } from "convex/values";
import { accountNature, money, placeStatus, postedJournalEntry } from "./validators";

export const closingLine = v.union(
  v.object({ kind: v.literal("transfer"), otherFinancialAccountProfileId: v.string(), amount: money, description: v.optional(v.string()) }),
  v.object({ kind: v.literal("expense"), userCategoryId: v.string(), amount: money, description: v.optional(v.string()) }),
  v.object({ kind: v.literal("adjustment"), amount: money, description: v.optional(v.string()) }),
);
export const closePlace = {
  workspaceId: v.string(), financialAccountProfileId: v.string(), idempotencyKey: v.string(),
  reviewedBalance: money, reviewedAccountingDate: v.string(),
  closingAdjustmentExpenseName: v.optional(v.string()), closingAdjustmentIncomeName: v.optional(v.string()),
  lines: v.array(closingLine), replacementDefaultFinancialAccountProfileId: v.optional(v.string()),
};
export const closePlaceInput = v.object(closePlace);
export const placeEndingFields = {
  act: v.union(v.literal("close"), v.literal("undo")),
  accountingDate: v.optional(v.string()),
  occurredAt: v.number(), recordedAt: v.number(), endedBy: v.string(),
  workspaceId: v.string(), financialAccountProfileId: v.string(), idempotencyKey: v.string(),
  undoOperationId: v.optional(v.string()),
  request: v.string(), entries: v.array(postedJournalEntry),
  replacementDefaultFinancialAccountProfileId: v.optional(v.string()),
};
export const placeEnding = v.object({ id: v.string(), ...placeEndingFields });
export const closePlaceReceipt = v.object({ ending: placeEnding, replay: v.boolean() });
export const placeCloseBlocker = v.union(
  v.object({ code: v.literal("place_future_entries"), latestAccountingDate: v.string() }),
  v.object({ code: v.literal("place_ending_scan_limit") }),
  v.object({ code: v.literal("place_undo_dependency"), places: v.array(v.object({ id: v.string(), name: v.string() })) }),
  v.object({ code: v.literal("place_undo_in_progress") }),
  v.object({ code: v.literal("financial_account_profile_ended") }),
  v.object({ code: v.literal("place_last_open") }),
  v.object({ code: v.literal("place_recovery_destination"), plans: v.array(v.object({ id: v.string(), title: v.string() })) }),
);
export const placeClosure = v.object({
  financialAccountProfileId: v.string(), endedAt: v.optional(v.number()), status: placeStatus, canClose: v.boolean(),
  blockers: v.array(placeCloseBlocker), isDefault: v.boolean(), requiresReplacementDefault: v.boolean(),
  openPlaceCount: v.number(), balance: money, nature: accountNature, accountingDate: v.string(),
});
