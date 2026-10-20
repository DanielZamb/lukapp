import { AccountingError } from "../src/accounting/errors";
import type { HistoryStore } from "../src/accounting/queries/postedHistory";
import type { Doc } from "./_generated/dataModel";
import { convexReadStore, storedId, toEntry, type ReadDb } from "./store";

export function convexHistoryStore(db: ReadDb): HistoryStore {
  const store = convexReadStore(db);
  return {
    ...store,
    async pageJournalEntries(input) {
      const workspaceId = storedId<"workspaces">(input.workspaceId);
      const profileId = input.financialAccountProfileId;
      const paginationOpts = {
        ...input.paginationOpts,
        numItems: Math.min(50, input.paginationOpts.numItems),
      };
      async function withLines(doc: Doc<"journalEntries">) {
        const lines = await db
          .query("journalLines")
          .withIndex("by_entry", (q) => q.eq("journalEntryId", doc._id))
          .collect();
        return toEntry(doc, lines);
      }
      if (profileId) {
        const ordered = db
          .query("journalEntryProfiles")
          .withIndex("by_workspace_profile_date", (q) =>
            q
              .eq("workspaceId", workspaceId)
              .eq(
                "financialAccountProfileId",
                storedId<"financialAccountProfiles">(profileId),
              ),
          )
          .order("desc");
        const page = await (input.includeReversals
          ? ordered
          : ordered.filter((q) => q.eq(q.field("reversesEntryId"), undefined))
        ).paginate(paginationOpts);
        return {
          ...page,
          page: await Promise.all(
            page.page.map(async (link) => {
              const doc = await db.get(link.journalEntryId);
              if (!doc) throw new AccountingError("journal_entry_not_found");
              return withLines(doc);
            }),
          ),
        };
      }
      const ordered = db
        .query("journalEntries")
        .withIndex("by_workspace_date", (q) => q.eq("workspaceId", workspaceId))
        .order("desc");
      const page = await (input.includeReversals
        ? ordered
        : ordered.filter((q) => q.eq(q.field("reversesEntryId"), undefined))
      ).paginate(paginationOpts);
      return {
        ...page,
        page: await Promise.all(page.page.map(withLines)),
      };
    },
  };
}
