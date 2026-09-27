import { requireWorkspace } from "../helpers";
import type { AccountBalance, AccountingStore, Actor } from "../types";

export async function balances(
  store: AccountingStore,
  input: { actor: Actor; workspaceId: string },
): Promise<AccountBalance[]> {
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor);
  const [profiles, entries] = await Promise.all([
    store.listProfiles(input.workspaceId),
    store.listPostedCashExpenses(input.workspaceId),
  ]);
  const lines = entries.flatMap((entry) => entry.lines);
  return profiles.map((profile) => ({
    financialAccountProfileId: profile.id,
    name: profile.name,
    debitMinusCredit: {
      currency: workspace.functionalCurrency,
      minorUnits: lines
        .filter((line) => line.ledgerAccountId === profile.postingAccountId)
        .reduce((sum, line) => sum + line.debitMinorUnits - line.creditMinorUnits, 0),
    },
  }));
}
