import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { IntakeReceipt, IntakeStore } from "../src/notificationIntake/types";
import { IntakeError } from "../src/notificationIntake/policy";

function view({ _id, _creationTime, workspaceId, ...receipt }: Doc<"notificationIntakeReceipts">): IntakeReceipt {
  return {
    id: _id,
    workspaceId,
    ...receipt,
    suggestion: {
      ...receipt.suggestion,
      amount: {
        currency: receipt.suggestion.amount.currency === "USD" ? "USD" : "COP",
        minorUnits: receipt.suggestion.amount.minorUnits,
      },
    },
  };
}

export function intakeWriteStore(ctx: Pick<MutationCtx, "db">): IntakeStore {
  return {
    findReceipt: async (workspaceId, idempotencyKey) => {
      const id = ctx.db.normalizeId("workspaces", workspaceId);
      if (!id) return null;
      const row = await ctx.db
        .query("notificationIntakeReceipts")
        .withIndex("by_workspace_request", (q) =>
          q.eq("workspaceId", id).eq("idempotencyKey", idempotencyKey),
        )
        .unique();
      return row ? view(row) : null;
    },
    readPosted: async (journalEntryId) => {
      const id = ctx.db.normalizeId("journalEntries", journalEntryId);
      if (!id) return null;
      const entry = await ctx.db.get(id);
      if (!entry) return null;
      const workspace = await ctx.db.get(entry.workspaceId);
      const lines = await ctx.db
        .query("journalLines")
        .withIndex("by_entry", (q) => q.eq("journalEntryId", id))
        .collect();
      return {
        id: entry._id,
        description: entry.description,
        amount: {
          currency: workspace?.functionalCurrency === "USD" ? "USD" : "COP",
          minorUnits: lines.reduce((sum, line) => sum + line.debitMinorUnits, 0),
        },
        replay: true,
      };
    },
    insertReceipt: async (receipt) => {
      const workspaceId = ctx.db.normalizeId("workspaces", receipt.workspaceId);
      const journalEntryId = ctx.db.normalizeId("journalEntries", receipt.journalEntryId);
      if (!workspaceId) throw new IntakeError("workspace_not_found");
      if (!journalEntryId) throw new IntakeError("journal_entry_not_found");
      const id = await ctx.db.insert("notificationIntakeReceipts", {
        ...receipt,
        workspaceId,
        journalEntryId,
      });
      return { ...receipt, id };
    },
  };
}
