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
  | "administerMembership"
  | "manageBudgets";

export const workspaceRolePolicyVersion = "workspace-roles@2";

export const workspaceRolePolicy = {
  Owner: [
    "view",
    "prepare",
    "post",
    "correct",
    "managePeriods",
    "administerMembership",
    "manageBudgets",
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
  store: Pick<AccountingStore, "membershipRole" | "getWorkspace">,
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
