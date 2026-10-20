import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { FALLBACK_WORKSPACE_TIME_ZONE } from "../src/accounting/timeZone";

export const backfillWorkspaceTimeZones = internalMutation({
  args: { cursor: v.union(v.string(), v.null()), batchSize: v.optional(v.number()) },
  returns: v.object({
    cursor: v.string(), done: v.boolean(), workspaces: v.number(), updated: v.number(),
  }),
  handler: async (ctx, { cursor, batchSize }) => {
    const page = await ctx.db.query("workspaces").paginate({ cursor, numItems: batchSize ?? 100 });
    let updated = 0;
    for (const workspace of page.page) {
      if (workspace.timeZone) continue;
      await ctx.db.patch(workspace._id, { timeZone: FALLBACK_WORKSPACE_TIME_ZONE });
      updated++;
    }
    return {
      cursor: page.continueCursor, done: page.isDone, workspaces: page.page.length, updated,
    };
  },
});
