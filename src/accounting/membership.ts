import { AccountingError } from "./errors";
import type { AccountingStore, Actor, StoredWorkspace } from "./types";

/** Workspace scope: every command and query acts inside one Workspace its actor belongs to. */
export async function requireWorkspace(
  store: AccountingStore,
  workspaceId: string,
  actor: Actor,
): Promise<StoredWorkspace> {
  if (!(await store.isMember(workspaceId, actor.userId))) {
    throw new AccountingError("workspace_membership_required");
  }
  const workspace = await store.getWorkspace(workspaceId);
  if (!workspace) {
    throw new AccountingError("workspace_membership_required");
  }
  return workspace;
}
