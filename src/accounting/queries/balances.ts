import { normalBalance } from "../chartOfAccounts";
import { AccountingError } from "../errors";
import { totalsByAccount } from "../ledgerTotals";
import { requireWorkspace } from "../membership";
import type { AccountBalance, AccountingStore, Actor } from "../types";

export async function balances(
  store: AccountingStore,
  input: { actor: Actor; workspaceId: string },
): Promise<AccountBalance[]> {
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor);
  const [profiles, accounts, entries] = await Promise.all([
    store.listProfiles(input.workspaceId),
    store.listLedgerAccounts(input.workspaceId),
    store.listJournalEntries(input.workspaceId),
  ]);
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const totals = totalsByAccount(entries);
  return profiles.map((profile) => {
    const ledgerAccount = accountsById.get(profile.postingAccountId);
    if (!ledgerAccount) {
      throw new AccountingError("ledger_account_not_found");
    }
    const account = totals.get(profile.postingAccountId) ?? {
      debitMinorUnits: 0,
      creditMinorUnits: 0,
    };
    return {
      financialAccountProfileId: profile.id,
      name: profile.name,
      nature: ledgerAccount.nature,
      debitMinorUnits: account.debitMinorUnits,
      creditMinorUnits: account.creditMinorUnits,
      balance: {
        currency: workspace.functionalCurrency,
        minorUnits: normalBalance(ledgerAccount.normalSide, account),
      },
    };
  });
}
