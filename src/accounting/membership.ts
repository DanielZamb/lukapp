import { AccountingError } from "./errors";
import type {
  AccountingStore,
  Actor,
  StoredWorkspace,
  WorkspaceRole,
} from "./types";

export type WorkspacePermission =
  | "view"
  | "prepare"
  | "post"
  | "correct"
  | "managePeriods"
  | "administerMembership";

export const workspaceRolePolicyVersion = "workspace-roles@1";

export const workspaceRolePolicy = {
  Owner: [
    "view",
    "prepare",
    "post",
    "correct",
    "managePeriods",
    "administerMembership",
  ],
  Accountant: ["view", "prepare", "post", "correct", "managePeriods"],
  Preparer: ["view", "prepare"],
  Viewer: ["view"],
} satisfies Record<WorkspaceRole, readonly WorkspacePermission[]>;

export function hasWorkspacePermission(
  role: WorkspaceRole,
  permission: WorkspacePermission,
): boolean {
  const permissions: readonly WorkspacePermission[] = workspaceRolePolicy[role];
  return permissions.includes(permission);
}

export async function requireWorkspace(
  store: AccountingStore,
  workspaceId: string,
  actor: Actor,
  permission: WorkspacePermission = "view",
): Promise<StoredWorkspace> {
  const role = await store.membershipRole(workspaceId, actor.userId);
  const workspace = role && (await store.getWorkspace(workspaceId));
  if (!role || !workspace) {
    throw new AccountingError("workspace_membership_required");
  }
  if (!hasWorkspacePermission(role, permission)) {
    throw new AccountingError("workspace_permission_required");
  }
  return workspace;
}
