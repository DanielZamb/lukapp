import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { applyJournalSummary } from "./ledgerSummary";
import { convexStore, toEntry } from "./store";
import { isOpening } from "../src/accounting/openingControl";
import { AccountingError } from "../src/accounting/errors";

// Run repeatedly per existing workspace until done. The stored cursor and per-entry
// receipts make retries and concurrent current-version postings safe.
export const backfill = internalMutation({
  args: { workspaceId: v.id("workspaces"), batchSize: v.optional(v.number()) },
  returns: v.object({ done: v.boolean(), scanned: v.number(), applied: v.number() }),
  handler: async (ctx, { workspaceId, batchSize = 50 }) => {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100)
      throw new Error("batchSize must be an integer between 1 and 100");
    const workspace = await ctx.db.get(workspaceId);
    if (!workspace) throw new Error("Workspace not found");
    if (workspace.ledgerSummaryVersion === 1) return { done: true, scanned: 0, applied: 0 };
    const page = await ctx.db.query("journalEntries")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .paginate({ cursor: workspace.ledgerSummaryCursor ?? null, numItems: batchSize });
    const store = convexStore(ctx.db);
    let applied = 0;
    for (const doc of page.page) {
      const lines = await ctx.db.query("journalLines")
        .withIndex("by_entry", (q) => q.eq("journalEntryId", doc._id)).collect();
      const entry = toEntry(doc, lines);
      if (await applyJournalSummary(ctx.db, entry)) applied++;
      if (!isOpening(entry)) continue;
      const existing = await store.findOpeningMarkerByIdempotencyKey(workspaceId, entry.idempotencyKey);
      if (existing) continue;
      const profile = entry.financialAccountProfileId ? await store.getProfile(entry.financialAccountProfileId) : undefined;
      if (!profile) throw new AccountingError("financial_account_profile_not_found");
      const net = entry.lines.filter((line) => line.ledgerAccountId === profile.postingAccountId)
        .reduce((sum, line) => sum + line.debitMinorUnits - line.creditMinorUnits, 0);
      await store.insertOpeningMarker({
        workspaceId, financialAccountProfileId: profile.id, accountingDate: entry.accountingDate,
        idempotencyKey: entry.idempotencyKey, description: entry.description, policy: entry.policy,
        amount: { currency: workspace.functionalCurrency, minorUnits: Math.abs(net) }, journalEntryId: entry.id,
      });
    }
    await ctx.db.patch(workspaceId, page.isDone
      ? { ledgerSummaryVersion: 1, ledgerSummaryCursor: undefined }
      : { ledgerSummaryCursor: page.continueCursor });
    return { done: page.isDone, scanned: page.page.length, applied };
  },
});
