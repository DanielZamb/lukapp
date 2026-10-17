import { requireWorkspace } from "../membership";
import type { AccountingStore, Actor, PostedJournalEntry } from "../types";
import { journalContext, toPostedJournalEntry } from "../views";

/** Every Posted Journal Entry, reversals included, with links between each pair. */
export async function listJournalEntries(
  store: AccountingStore,
  input: { actor: Actor; workspaceId: string },
): Promise<PostedJournalEntry[]> {
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor);
  const [entries, context] = await Promise.all([
    store.listJournalEntries(input.workspaceId),
    journalContext(store, workspace),
  ]);
  const reversedBy = new Map(
    entries.flatMap((entry) =>
      entry.reversesEntryId ? [[entry.reversesEntryId, entry.id] as const] : [],
    ),
  );
  return Promise.all(
    entries.map((entry) => {
      const reversedByEntryId = reversedBy.get(entry.id);
      return toPostedJournalEntry(store, context, entry, {
        replay: false,
        ...(reversedByEntryId ? { reversedByEntryId } : {}),
      });
    }),
  );
}
