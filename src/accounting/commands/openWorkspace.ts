import { requireWorkspace, toWorkspace } from "../helpers";
import { clockMonth } from "../period";
import type { AccountingClock, AccountingStore, Actor, Workspace } from "../types";

export async function openWorkspace(
  store: AccountingStore,
  clock: AccountingClock,
  input: { actor: Actor; workspaceId: string; now?: number },
): Promise<Workspace> {
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor);
  const month = clockMonth(
    input.now === undefined ? clock.now() : new Date(input.now),
  );
  const stored = await store.getAccountingPeriod(input.workspaceId, month);
  return toWorkspace(workspace, stored ?? { ...month, status: "not_opened" });
}
