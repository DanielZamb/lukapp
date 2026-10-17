import { AccountingError } from "../errors";
import { requireWorkspace } from "../membership";
import type { AccountingStore, Actor } from "../types";
import { journalContext, toPostedJournalEntry } from "../views";
import { activityRow, profileNamesByPostingAccount } from "./activityRow";

export async function postedEntry(
  store: AccountingStore,
  input: { actor: Actor; workspaceId: string; journalEntryId: string },
) {
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor);
  const stored = await store.getJournalEntry(input.journalEntryId);
  if (!stored || stored.workspaceId !== workspace.id)
    throw new AccountingError("journal_entry_not_found");
  const [context, reversal] = await Promise.all([
    journalContext(store, workspace),
    store.findReversalOf(stored.id),
  ]);
  const entry = await toPostedJournalEntry(store, context, stored, {
    replay: false,
    ...(reversal ? { reversedByEntryId: reversal.id } : {}),
  });
  const profile = entry.financialAccountProfileId
    ? context.profiles.get(entry.financialAccountProfileId)
    : undefined;
  return {
    entry,
    row: activityRow(
      entry,
      profile?.postingAccountId,
      profileNamesByPostingAccount(context.profiles.values()),
    ),
  };
}
