import { personalChartTemplate, provisionChartOfAccounts } from "../chartOfAccounts";
import { requireFunctionalCurrencyCode } from "../money";
import { clockMonth } from "../period";
import type { AccountingClock, AccountingStore, Actor, Workspace } from "../types";
import { toWorkspace } from "../views";

export async function createPersonalWorkspace(
  store: AccountingStore,
  clock: AccountingClock,
  input: { actor: Actor; functionalCurrency: string },
): Promise<Workspace> {
  const functionalCurrency = requireFunctionalCurrencyCode(input.functionalCurrency);
  const month = clockMonth(clock.now());
  const workspace = await store.insertWorkspace(
    {
      kind: "Personal",
      functionalCurrency,
      chartOfAccountsTemplate: personalChartTemplate.version,
    },
    input.actor.userId,
  );
  await provisionChartOfAccounts(store, workspace.id, personalChartTemplate);
  const period = await store.insertAccountingPeriod(workspace.id, {
    ...month,
    status: "open",
  });
  return toWorkspace(workspace, period);
}
