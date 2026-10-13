import {
  chartTemplate,
  personalChartTemplate,
  provisionChartOfAccounts,
} from "./chartOfAccounts";
import { AccountingError } from "./errors";
import { requireFunctionalCurrencyCode } from "./money";
import { clockMonth } from "./period";
import type {
  AccountingClock,
  AccountingStore,
  Actor,
  Workspace,
  WorkspaceKind,
} from "./types";
import { toWorkspace } from "./views";

export function workspaceConfiguration(input: {
  kind: WorkspaceKind;
  functionalCurrency: string;
  chartOfAccountsTemplate?: string;
}) {
  const functionalCurrency = requireFunctionalCurrencyCode(input.functionalCurrency);
  const template = chartTemplate(
    input.chartOfAccountsTemplate ?? personalChartTemplate.version,
  );
  if (!template.applicableWorkspaceKinds.includes(input.kind)) {
    throw new AccountingError("chart_of_accounts_template_not_applicable");
  }
  return { functionalCurrency, template };
}

export async function provisionWorkspace(
  store: AccountingStore,
  clock: AccountingClock,
  input: {
    actor: Actor;
    kind: WorkspaceKind;
    functionalCurrency: string;
    chartOfAccountsTemplate?: string;
  },
): Promise<Workspace> {
  const { functionalCurrency, template } = workspaceConfiguration(input);
  const month = clockMonth(clock.now());
  const workspace = await store.insertWorkspace(
    {
      kind: input.kind,
      functionalCurrency,
      chartOfAccountsTemplate: template.version,
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
