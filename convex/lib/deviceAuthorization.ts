import { ConvexError } from "convex/values";
import type { Infer } from "convex/values";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { requireSession, requireLiveObservation } from "./session";
import type { LiveSession } from "./session";
import { workspacePermission } from "./securityValues";

export type WorkspacePermission = Infer<typeof workspacePermission>;
type ReadCtx = Pick<QueryCtx, "auth" | "db">;
const ownerPermissions: readonly WorkspacePermission[] = [
  "workspace:read", "workspace:admin", "accounting:post", "accounting:correct",
  "period:lock", "category:manage",
];

export function requireRolePermission(role: string, permission: WorkspacePermission) {
  if (role !== "Owner" || !ownerPermissions.includes(permission))
    throw new ConvexError({ code: "permission_denied" });
}

export async function requireDevice(ctx: ReadCtx) {
  const actor = await requireSession(ctx.auth);
  const revoked = await ctx.db.query("clerkRevocations")
    .withIndex("by_session", (q) => q.eq("clerkSessionId", actor.clerkSessionId)).unique();
  const device = await ctx.db.query("mobileDevices")
    .withIndex("by_session", (q) => q.eq("clerkSessionId", actor.clerkSessionId)).unique();
  if (revoked || device?.revokedAt !== undefined)
    throw new ConvexError({ code: "device_revoked", wipeLocalInput: true, ...(device?.replacedByLabel ? { movedTo: device.replacedByLabel } : {}) });
  if (!device || device.clerkUserId !== actor.userId)
    throw new ConvexError({ code: "device_registration_required" });
  return { actor: { userId: actor.userId }, device };
}

export async function requireWorkspacePermission(
  ctx: ReadCtx,
  args: { workspaceId: string; permission: WorkspacePermission },
) {
  const { actor } = await requireDevice(ctx);
  const workspaceId = ctx.db.normalizeId("workspaces", args.workspaceId);
  const membership = workspaceId && await ctx.db.query("workspaceMemberships")
    .withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", actor.userId)).unique();
  if (!membership) throw new ConvexError({ code: "membership_required", wipeLocalInput: true });
  requireRolePermission(membership.role, args.permission);
  return actor;
}

export async function requireSubmission(
  ctx: MutationCtx,
  args: { session: LiveSession; workspaceId: string; permission: WorkspacePermission },
) {
  await requireLiveObservation(ctx.auth, args.session);
  const { device } = await requireDevice(ctx);
  if (device.clerkClientId !== args.session.clerkClientId)
    throw new ConvexError({ code: "device_registration_required" });
  return requireWorkspacePermission(ctx, args);
}

export async function requirePersonalSetup(ctx: MutationCtx, session: LiveSession) {
  await requireLiveObservation(ctx.auth, session);
  const { actor, device } = await requireDevice(ctx);
  if (device.clerkClientId !== session.clerkClientId)
    throw new ConvexError({ code: "device_registration_required" });
  const defaults = await ctx.db.query("personalDefaults")
    .withIndex("by_owner", (q) => q.eq("ownerSubject", actor.userId)).unique();
  if (defaults) await requireWorkspacePermission(ctx, { workspaceId: defaults.workspaceId, permission: "workspace:admin" });
  return actor;
}

export async function requirePersonalRead(ctx: ReadCtx) {
  const { actor } = await requireDevice(ctx);
  const defaults = await ctx.db.query("personalDefaults")
    .withIndex("by_owner", (q) => q.eq("ownerSubject", actor.userId)).unique();
  if (defaults) await requireWorkspacePermission(ctx, { workspaceId: defaults.workspaceId, permission: "workspace:read" });
  return actor;
}
