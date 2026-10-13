import { dateFromTimestamp } from "../period";
import { openWorkspace } from "./openWorkspace";
import type { AccountingClock, AccountingStore, Actor, Workspace } from "../types";

export async function listOwnedWorkspaces(
  store: AccountingStore,
  clock: AccountingClock,
  input: { actor: Actor; now?: number },
): Promise<Workspace[]> {
  const now = input.now ?? clock.now().getTime();
  dateFromTimestamp(now);
  const ids = await store.listOwnedWorkspaceIds(input.actor.userId);
  return Promise.all(
    ids.map((workspaceId) =>
      openWorkspace(store, clock, { ...input, now, workspaceId }),
    ),
  );
}
