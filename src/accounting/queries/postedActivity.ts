import { balances } from "./balances";
import { activityRow, profileNamesByPostingAccount } from "./activityRow";
import { requireWorkspace } from "../membership";
import { journalContext, toPostedJournalEntry } from "../views";
import type { AccountingStore, Actor } from "../types";

export async function postedActivity(
  store: AccountingStore,
  input: { actor: Actor; workspaceId: string; month: string; includeRows?: boolean },
) {
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor);
  const [accounts, entries, context] = await Promise.all([
    balances(store, input),
    store.listJournalEntries(input.workspaceId),
    journalContext(store, workspace),
  ]);
  const monthSpendMinorUnits = entries
    .filter((entry) => entry.accountingDate.slice(0, 7) === input.month)
    .flatMap((entry) => entry.lines)
    .filter((line) => context.accounts.get(line.ledgerAccountId)?.nature === "Expense")
    .reduce((sum, line) => sum + line.debitMinorUnits - line.creditMinorUnits, 0);
  const reversedBy = new Map(entries.flatMap((entry) =>
    entry.reversesEntryId ? [[entry.reversesEntryId, entry.id] as const] : []));
  const rows = input.includeRows === false ? [] : await Promise.all(entries
    .filter((entry) => !entry.reversesEntryId)
    .sort((a, b) => b.accountingDate.localeCompare(a.accountingDate) || b.postedAt - a.postedAt || b.id.localeCompare(a.id))
    .map(async (stored) => {
      const reversalId = reversedBy.get(stored.id);
      const entry = await toPostedJournalEntry(store, context, stored, {
        replay: false,
        ...(reversalId ? { reversedByEntryId: reversalId } : {}),
      });
      const profile = entry.financialAccountProfileId ? context.profiles.get(entry.financialAccountProfileId) : undefined;
      return activityRow(
        entry,
        profile?.postingAccountId,
        profileNamesByPostingAccount(context.profiles.values()),
      );
    }));
  return {
    accounts: accounts.map((account) => ({
      financialAccountProfileId: account.financialAccountProfileId,
      name: account.name,
      nature: account.nature,
      balance: account.balance,
    })),
    rows,
    monthSpendMinorUnits,
  };
}
