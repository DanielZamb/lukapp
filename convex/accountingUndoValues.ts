import { v } from "convex/values";
import { money } from "./validators";
import { placeCloseBlocker, placeClosure } from "./accountingPlaceValues";

export const undoPlace = {
  workspaceId: v.string(), financialAccountProfileId: v.string(), idempotencyKey: v.string(),
  previewFingerprint: v.string(),
  reversalDescriptionPrefix: v.optional(v.string()),
  replacementDefaultFinancialAccountProfileId: v.optional(v.string()),
};
export const undoSnapshot = v.object({
  fingerprint: v.string(), entriesToReverse: v.number(), lockedMonthEntries: v.number(), earlierOpenMonthEntries: v.number(),
  otherPlaces: v.array(v.object({ financialAccountProfileId: v.string(), name: v.string(), balanceChange: money })),
  currentMonthExpenseChange: money, currentMonthIncomeChange: money,
});
export const abortUndo = { workspaceId: v.string(), operationId: v.string() };
export const undoState = v.union(
  v.object({ kind: v.literal("pending") }),
  v.object({ kind: v.literal("running") }),
  v.object({ kind: v.literal("paused"), code: v.string(), detail: v.optional(v.string()), retryAt: v.number() }),
  v.object({ kind: v.literal("needs_attention"), code: v.string(), detail: v.string(), journalEntryId: v.optional(v.string()) }),
  v.object({ kind: v.literal("aborted"), abortedAt: v.number(), abortedBy: v.string(), defaultRestored: v.optional(v.boolean()) }),
  v.object({ kind: v.literal("done"), endingId: v.string(), completedAt: v.number() }),
);
export const undoOperationFields = {
  totalEntriesToReverse: v.optional(v.number()), startedPreview: v.optional(undoSnapshot),
  workspaceId: v.id("workspaces"), financialAccountProfileId: v.id("financialAccountProfiles"),
  idempotencyKey: v.string(), request: v.string(), authorizedBy: v.string(), startedAt: v.number(),
  replacementDefaultFinancialAccountProfileId: v.optional(v.string()),
  reversalDescriptionPrefix: v.optional(v.string()),
  counterparties: v.optional(v.array(v.object({ financialAccountProfileId: v.string(), remainingEntries: v.number() }))),
  state: undoState, version: v.number(), cursor: v.union(v.string(), v.null()),
  reversedCount: v.number(), alreadyReversedCount: v.number(), scannedLineCount: v.number(),
  heartbeatAt: v.optional(v.number()), retryCount: v.optional(v.number()), watchdogCount: v.optional(v.number()),
  lockedMonthCount: v.number(),
};
export const undoOperation = v.object({ id: v.string(), ...undoOperationFields, hasReversedEntries: v.boolean() });
export const undoReceipt = v.object({ operation: undoOperation, replay: v.boolean() });
export const undoBlocker = v.union(placeCloseBlocker,
  v.object({ code: v.literal("place_undo_ended_counterparty"), places: v.array(v.object({ id: v.string(), name: v.string() })) }),
  v.object({ code: v.literal("place_undo_invalid_entry"), journalEntryId: v.string(), reason: v.string() }),
  v.object({ code: v.literal("place_recovery_contributed_destination"), plans: v.array(v.object({ id: v.string(), title: v.string() })) }),
  v.object({ code: v.literal("place_recovery_covered_expenses"), plans: v.array(v.object({ id: v.string(), title: v.string() })) }),
  v.object({ code: v.literal("place_undo_current_period_locked") }),
);
export const undoPreview = v.object({
  fingerprint: v.string(), snapshot: v.union(undoSnapshot, v.null()),
  closure: placeClosure, canUndo: v.boolean(), blockers: v.array(undoBlocker),
  operation: v.union(undoOperation, v.null()),
  page: v.object({
    entriesToReverse: v.number(), alreadyReversed: v.number(), lockedMonthEntries: v.number(), earlierOpenMonthEntries: v.number(),
    otherPlaces: v.array(v.object({ financialAccountProfileId: v.string(), name: v.string(), balanceChange: money })),
    currentMonthExpenseChange: money, currentMonthIncomeChange: money,
    scannedLines: v.number(), isDone: v.boolean(), continueCursor: v.string(),
  }),
});
