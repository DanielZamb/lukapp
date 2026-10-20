import { requireWorkspace } from "../membership";
import type { AccountingStore, Actor, TrialBalanceRow } from "../types";
import { byCode } from "../views";

/** Every Ledger Account with Posted activity, in code order; debits and credits sum to equal totals. */
export async function trialBalance(
  store: AccountingStore,
  input: { actor: Actor; workspaceId: string },
): Promise<TrialBalanceRow[]> {
  await requireWorkspace(store, input.workspaceId, input.actor);
  const [accounts, totals] = await Promise.all([
    store.listLedgerAccounts(input.workspaceId),
    store.accountTotals(input.workspaceId),
  ]);
  return accounts.sort(byCode).flatMap((account) => {
    const row = totals.get(account.id);
    return row
      ? [
          {
            ledgerAccountId: account.id,
            code: account.code,
            name: account.name,
            nature: account.nature,
            debitMinorUnits: row.debitMinorUnits,
            creditMinorUnits: row.creditMinorUnits,
          },
        ]
      : [];
  });
}
