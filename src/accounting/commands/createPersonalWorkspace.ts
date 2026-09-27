import { toWorkspace } from "../helpers";
import { clockMonth } from "../period";
import type { AccountingClock, AccountingStore, Actor, Workspace } from "../types";

export async function createPersonalWorkspace(
  store: AccountingStore,
  clock: AccountingClock,
  input: { actor: Actor; functionalCurrency: string },
): Promise<Workspace> {
  const workspace = await store.insertWorkspace(
    { kind: "Personal", functionalCurrency: input.functionalCurrency },
    input.actor.userId,
  );
  const expense = await store.insertLedgerAccount({
    workspaceId: workspace.id,
    name: "Expenses",
  });
  await store.insertLedgerAccount({
    workspaceId: workspace.id,
    name: "Opening Balance Equity",
  });
  await store.setExpenseAccount(workspace.id, expense.id);
  const period = await store.insertAccountingPeriod(workspace.id, {
    ...clockMonth(clock.now()),
    status: "open",
  });
  return toWorkspace({ ...workspace, expenseAccountId: expense.id }, period);
}
