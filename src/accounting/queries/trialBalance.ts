import { totalsByAccount } from "../ledgerTotals";
import { requireWorkspace } from "../membership";
import type { AccountingStore, Actor, TrialBalanceRow } from "../types";

/** Every Ledger Account with Posted activity; debits and credits sum to equal totals. */
export async function trialBalance(
  store: AccountingStore,
  input: { actor: Actor; workspaceId: string },
): Promise<TrialBalanceRow[]> {
  await requireWorkspace(store, input.workspaceId, input.actor);
  const [accounts, entries] = await Promise.all([
    store.listLedgerAccounts(input.workspaceId),
    store.listJournalEntries(input.workspaceId),
  ]);
  const totals = totalsByAccount(entries);
  return accounts.flatMap((account) => {
    const row = totals.get(account.id);
    return row
      ? [
          {
            ledgerAccountId: account.id,
            name: account.name,
            nature: account.nature,
            debitMinorUnits: row.debitMinorUnits,
            creditMinorUnits: row.creditMinorUnits,
          },
        ]
      : [];
  });
}
