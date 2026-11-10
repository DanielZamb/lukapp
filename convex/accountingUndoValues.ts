import { v } from "convex/values";
import { money } from "./validators";
import { placeCloseBlocker, placeClosure } from "./accountingPlaceValues";

export const undoPlace = {
  workspaceId: v.string(), financialAccountProfileId: v.string(), idempotencyKey: v.string(),
  replacementDefaultFinancialAccountProfileId: v.optional(v.string()),
};
export const undoState = v.union(
  v.object({ kind: v.literal("pending") }),
  v.object({ kind: v.literal("running") }),
  v.object({ kind: v.literal("paused"), code: v.string(), retryAt: v.number() }),
  v.object({ kind: v.literal("needs_attention"), code: v.string(), detail: v.string(), journalEntryId: v.optional(v.string()) }),
  v.object({ kind: v.literal("done"), endingId: v.string(), completedAt: v.number() }),
);
export const undoOperationFields = {
  workspaceId: v.id("workspaces"), financialAccountProfileId: v.id("financialAccountProfiles"),
  idempotencyKey: v.string(), request: v.string(), authorizedBy: v.string(), startedAt: v.number(),
  replacementDefaultFinancialAccountProfileId: v.optional(v.string()),
  state: undoState, version: v.number(), cursor: v.union(v.string(), v.null()),
  reversedCount: v.number(), alreadyReversedCount: v.number(), scannedLineCount: v.number(),
  lockedMonthCount: v.number(),
};
export const undoOperation = v.object({ id: v.string(), ...undoOperationFields });
export const undoReceipt = v.object({ operation: undoOperation, replay: v.boolean() });
export const undoBlocker = v.union(placeCloseBlocker,
  v.object({ code: v.literal("place_recovery_covered_expenses"), plans: v.array(v.object({ id: v.string(), title: v.string() })) }),
  v.object({ code: v.literal("place_undo_current_period_locked") }),
);
export const undoPreview = v.object({
  closure: placeClosure, canUndo: v.boolean(), blockers: v.array(undoBlocker),
  operation: v.union(undoOperation, v.null()),
  page: v.object({
    entriesToReverse: v.number(), alreadyReversed: v.number(), lockedMonthEntries: v.number(),
    otherPlaces: v.array(v.object({ financialAccountProfileId: v.string(), name: v.string(), balanceChange: money })),
    currentMonthExpenseChange: money, currentMonthIncomeChange: money,
    scannedLines: v.number(), isDone: v.boolean(), continueCursor: v.string(),
  }),
});
