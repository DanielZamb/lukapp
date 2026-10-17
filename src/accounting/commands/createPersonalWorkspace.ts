import { chartTemplate, personalChartTemplate, provisionChartOfAccounts } from "../chartOfAccounts";
import { requireFunctionalCurrencyCode } from "../money";
import { clockMonth } from "../period";
import { FALLBACK_WORKSPACE_TIME_ZONE, requireTimeZone } from "../timeZone";
import type { AccountingClock, AccountingStore, Actor, Workspace } from "../types";
import { toWorkspace } from "../views";

export async function createPersonalWorkspace(
  store: AccountingStore,
  clock: AccountingClock,
  input: {
    actor: Actor;
    functionalCurrency: string;
    chartOfAccountsTemplate?: string;
    timeZone?: string;
  },
): Promise<Workspace> {
  const functionalCurrency = requireFunctionalCurrencyCode(input.functionalCurrency);
  const timeZone = requireTimeZone(input.timeZone ?? FALLBACK_WORKSPACE_TIME_ZONE);
  const template = chartTemplate(input.chartOfAccountsTemplate ?? personalChartTemplate.version);
  const month = clockMonth(clock.now(), timeZone);
  const workspace = await store.insertWorkspace(
    {
      kind: "Personal",
      functionalCurrency,
      chartOfAccountsTemplate: template.version,
      timeZone,
    },
    input.actor.userId,
  );
  await provisionChartOfAccounts(store, workspace.id, template);
  const period = await store.insertAccountingPeriod(workspace.id, {
    ...month,
    status: "open",
  });
  return toWorkspace(workspace, period);
}
