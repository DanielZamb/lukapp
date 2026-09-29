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
  const natures = new Map(accounts.map((account) => [account.id, account.nature]));
  const totals = totalsByAccount(entries);
  return profiles.map((profile) => {
    const nature = natures.get(profile.postingAccountId);
    if (!nature) {
      throw new AccountingError("ledger_account_not_found");
    }
    const account = totals.get(profile.postingAccountId) ?? {
      debitMinorUnits: 0,
      creditMinorUnits: 0,
    };
    return {
      financialAccountProfileId: profile.id,
      name: profile.name,
      nature,
      debitMinorUnits: account.debitMinorUnits,
      creditMinorUnits: account.creditMinorUnits,
      balance: {
        currency: workspace.functionalCurrency,
        minorUnits: normalBalance(nature, account),
      },
    };
  });
}
