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
  return profiles.map((profile) => {
    const postingLines = lines.filter(
      (line) => line.ledgerAccountId === profile.postingAccountId,
    );
    const debitMinorUnits = postingLines.reduce(
      (sum, line) => sum + line.debitMinorUnits,
      0,
    );
    const creditMinorUnits = postingLines.reduce(
      (sum, line) => sum + line.creditMinorUnits,
      0,
    );
    return {
      financialAccountProfileId: profile.id,
      name: profile.name,
      debitMinorUnits,
      creditMinorUnits,
      debitMinusCredit: {
        currency: workspace.functionalCurrency,
        minorUnits: debitMinorUnits - creditMinorUnits,
      },
    };
  });
}
