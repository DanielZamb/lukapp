import { requireWorkspace, toPostedCashExpense } from "../helpers";
import type { AccountingStore, Actor, PostedCashExpense } from "../types";

export async function listPostedCashExpenses(
  store: AccountingStore,
  input: { actor: Actor; workspaceId: string },
): Promise<PostedCashExpense[]> {
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor);
  const entries = await store.listPostedCashExpenses(input.workspaceId);
  return Promise.all(
    entries.map((entry) => toPostedCashExpense(store, workspace, entry, false)),
  );
}
