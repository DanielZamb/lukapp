import { AccountingError } from "../errors";
import { requireWorkspace } from "../membership";
import type { AccountingStore, Actor } from "../types";
import { journalContext, toPostedJournalEntry } from "../views";
import { activityRow, profilesByPostingAccount } from "./activityRow";

export async function postedEntry(
  store: AccountingStore,
  input: { actor: Actor; workspaceId: string; journalEntryId: string; financialAccountProfileId?: string },
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
  const viewingId = input.financialAccountProfileId ?? entry.financialAccountProfileId;
  const profile = viewingId ? context.profiles.get(viewingId) : undefined;
  if (input.financialAccountProfileId && !profile)
    throw new AccountingError("financial_account_profile_not_found");
  return {
    entry,
    row: activityRow(
      entry,
      profile?.postingAccountId,
      profilesByPostingAccount(context.profiles.values()),
    ),
  };
}
