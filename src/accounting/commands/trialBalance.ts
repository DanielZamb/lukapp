import { requireMember } from "../helpers";
import type { AccountingStore, Actor, TrialBalanceRow } from "../types";

export async function trialBalance(
  store: AccountingStore,
  input: { actor: Actor; workspaceId: string },
): Promise<TrialBalanceRow[]> {
  await requireMember(store, input.workspaceId, input.actor);
  const [accounts, entries] = await Promise.all([
    store.listLedgerAccounts(input.workspaceId),
    store.listPostedCashExpenses(input.workspaceId),
  ]);
  const lines = entries.flatMap((entry) => entry.lines);
  return accounts
    .map((account) => ({
      name: account.name,
      debitMinorUnits: lines
        .filter((line) => line.ledgerAccountId === account.id)
        .reduce((sum, line) => sum + line.debitMinorUnits, 0),
      creditMinorUnits: lines
        .filter((line) => line.ledgerAccountId === account.id)
        .reduce((sum, line) => sum + line.creditMinorUnits, 0),
    }))
    .filter((row) => row.debitMinorUnits !== 0 || row.creditMinorUnits !== 0);
}
