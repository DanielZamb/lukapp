import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { isOpening } from "../src/accounting/openingControl";

// Entries posted before journalEntryProfiles and financialAccountOpenings existed have
// neither row, so account history omits them and their openings stop guarding dates.
// This adds exactly the rows a current write would have added. Re-running it adds nothing.
// Run it with the returned cursor until done is true.
export const backfillProfileHistory = internalMutation({
  args: { cursor: v.union(v.string(), v.null()), batchSize: v.optional(v.number()) },
  returns: v.object({
    cursor: v.string(), done: v.boolean(), entries: v.number(), links: v.number(), openings: v.number(),
  }),
  handler: async (ctx, { cursor, batchSize }) => {
    const page = await ctx.db.query("journalEntries").paginate({ cursor, numItems: batchSize ?? 100 });
    const profilesByWorkspace = new Map<Id<"workspaces">, Doc<"financialAccountProfiles">[]>();
    let links = 0;
    let openings = 0;
    for (const entry of page.page) {
      let profiles = profilesByWorkspace.get(entry.workspaceId);
      if (!profiles) {
        profiles = await ctx.db.query("financialAccountProfiles")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", entry.workspaceId)).collect();
        profilesByWorkspace.set(entry.workspaceId, profiles);
      }
      const lines = await ctx.db.query("journalLines")
        .withIndex("by_entry", (q) => q.eq("journalEntryId", entry._id)).collect();
      const linked = await ctx.db.query("journalEntryProfiles")
        .withIndex("by_entry", (q) => q.eq("journalEntryId", entry._id)).collect();
      for (const profile of profiles) {
        const touching = lines.filter((line) => line.ledgerAccountId === profile.postingAccountId);
        if (touching.length === 0) continue;
        if (!linked.some((row) => row.financialAccountProfileId === profile._id)) {
          await ctx.db.insert("journalEntryProfiles", {
            workspaceId: entry.workspaceId,
            journalEntryId: entry._id,
            financialAccountProfileId: profile._id,
            accountingDate: entry.accountingDate,
            postedAt: entry.postedAt,
            ...(entry.reversesEntryId ? { reversesEntryId: entry.reversesEntryId } : {}),
          });
          links++;
        }
        if (!isOpening(entry)) continue;
        const markers = await ctx.db.query("financialAccountOpenings")
          .withIndex("by_workspace_profile", (q) =>
            q.eq("workspaceId", entry.workspaceId).eq("financialAccountProfileId", profile._id))
          .collect();
        if (markers.some((marker) => marker.journalEntryId === entry._id)) continue;
        const workspace = await ctx.db.get(entry.workspaceId);
        if (!workspace) throw new Error(`Workspace ${entry.workspaceId} is missing for entry ${entry._id}`);
        const net = touching.reduce((sum, line) => sum + line.debitMinorUnits - line.creditMinorUnits, 0);
        await ctx.db.insert("financialAccountOpenings", {
          workspaceId: entry.workspaceId,
          financialAccountProfileId: profile._id,
          accountingDate: entry.accountingDate,
          idempotencyKey: entry.idempotencyKey,
          amount: { currency: workspace.functionalCurrency, minorUnits: Math.abs(net) },
          description: entry.description,
          policy: entry.policy,
          journalEntryId: entry._id,
        });
        openings++;
      }
    }
    return { cursor: page.continueCursor, done: page.isDone, entries: page.page.length, links, openings };
  },
});
