import { AccountingError } from "../errors";
import { requireWorkspace } from "../membership";
import type { AccountingStore, Actor, StoredJournalEntry } from "../types";
import { journalContext, toPostedJournalEntry } from "../views";
import { activityRow } from "./activityRow";

export type HistoryPageOptions = {
  cursor: string | null;
  numItems: number;
  endCursor?: string | null;
};
export type HistoryStore = AccountingStore & {
  pageJournalEntries(input: {
    workspaceId: string;
    financialAccountProfileId?: string;
    includeReversals: boolean;
    paginationOpts: HistoryPageOptions;
  }): Promise<{
    page: StoredJournalEntry[];
    isDone: boolean;
    continueCursor: string;
  }>;
};

export async function postedHistory(
  store: HistoryStore,
  input: {
    actor: Actor;
    workspaceId: string;
    financialAccountProfileId?: string;
    includeReversals?: boolean;
    paginationOpts: HistoryPageOptions;
  },
) {
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor);
  if (input.financialAccountProfileId) {
    const profile = await store.getProfile(input.financialAccountProfileId);
    if (!profile || profile.workspaceId !== workspace.id)
      throw new AccountingError("financial_account_profile_not_found");
  }
  const [page, context] = await Promise.all([
    store.pageJournalEntries({ ...input, includeReversals: input.includeReversals ?? true }),
    journalContext(store, workspace),
  ]);
  return {
    ...page,
    page: await Promise.all(page.page.map(async (stored) => {
      const reversal = await store.findReversalOf(stored.id);
      const entry = await toPostedJournalEntry(store, context, stored, {
        replay: false,
        ...(reversal ? { reversedByEntryId: reversal.id } : {}),
      });
      const profile = entry.financialAccountProfileId ? context.profiles.get(entry.financialAccountProfileId) : undefined;
      return activityRow(entry, profile?.postingAccountId);
    })),
  };
}
