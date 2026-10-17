import { ConvexError } from "convex/values";
import { z } from "zod";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { requireSession, requireLiveObservation } from "./session";
import type { LiveSession } from "./session";
import { requireRolePermission } from "./deviceAuthorization";

const registration = z.object({
  installId: z.string().min(16).max(128),
  label: z.string().trim().min(1).max(80),
  platform: z.enum(["ios", "android"]),
  appVersion: z.string().min(1).max(40),
});
export type Registration = z.infer<typeof registration>;

// A new phone can manage occupied slots before registration, but receives no Workspace data.
export async function requireDeviceManagement(ctx: Pick<QueryCtx, "db" | "auth">) {
  const actor = await requireSession(ctx.auth);
  const revoked = await ctx.db.query("clerkRevocations")
    .withIndex("by_session", (q) => q.eq("clerkSessionId", actor.clerkSessionId)).unique();
  const current = await ctx.db.query("mobileDevices")
    .withIndex("by_session", (q) => q.eq("clerkSessionId", actor.clerkSessionId)).unique();
  if (revoked || current?.revokedAt !== undefined)
    throw new ConvexError({ code: "device_revoked", wipeLocalInput: true });
  const defaults = await ctx.db.query("personalDefaults")
    .withIndex("by_owner", (q) => q.eq("ownerSubject", actor.userId)).unique();
  if (defaults) {
    const member = await ctx.db.query("workspaceMemberships")
      .withIndex("by_workspace_user", (q) => q.eq("workspaceId", defaults.workspaceId).eq("userId", actor.userId)).unique();
    if (!member) throw new ConvexError({ code: "membership_required", wipeLocalInput: true });
    requireRolePermission(member.role, "workspace:admin");
  }
  return actor;
}

export async function registerDevice(ctx: MutationCtx, session: LiveSession, input: Registration) {
  const actor = await requireLiveObservation(ctx.auth, session);
  await requireDeviceManagement(ctx);
  const parsed = registration.safeParse(input);
  if (!parsed.success) throw new ConvexError({ code: "device_metadata_invalid" });
  const metadata = parsed.data;
  const revoked = await ctx.db.query("clerkRevocations")
    .withIndex("by_session", (q) => q.eq("clerkSessionId", actor.clerkSessionId)).unique();
  const existing = await ctx.db.query("mobileDevices")
    .withIndex("by_session", (q) => q.eq("clerkSessionId", actor.clerkSessionId)).unique();
  if (revoked || existing?.revokedAt !== undefined)
    throw new ConvexError({ code: "device_revoked", wipeLocalInput: true });
  if (existing) {
    if (existing.clerkUserId !== actor.userId || existing.clerkClientId !== session.clerkClientId ||
        existing.platform !== metadata.platform || existing.installId !== metadata.installId)
      throw new ConvexError({ code: "device_conflict" });
    await ctx.db.patch(existing._id, { label: metadata.label, appVersion: metadata.appVersion, lastSeenAt: Date.now() });
    return existing._id;
  }
  const devices = await ctx.db.query("mobileDevices")
    .withIndex("by_user", (q) => q.eq("clerkUserId", actor.userId)).collect();
  if (devices.some((d) => d.revokedAt === undefined &&
      (d.platform === metadata.platform || d.clerkClientId === session.clerkClientId || d.installId === metadata.installId)))
    throw new ConvexError({ code: "device_slot_occupied" });
  return ctx.db.insert("mobileDevices", {
    ...metadata, clerkUserId: actor.userId, clerkSessionId: actor.clerkSessionId,
    clerkClientId: session.clerkClientId, createdAt: Date.now(), lastSeenAt: Date.now(),
  });
}

export async function queueRevocation(ctx: MutationCtx, userId: string, sid: string) {
  const existing = await ctx.db.query("clerkRevocations")
    .withIndex("by_session", (q) => q.eq("clerkSessionId", sid)).unique();
  if (existing) {
    if (existing.clerkUserId !== userId) throw new ConvexError({ code: "session_owner_mismatch" });
    return existing._id;
  }
  const device = await ctx.db.query("mobileDevices")
    .withIndex("by_session", (q) => q.eq("clerkSessionId", sid)).unique();
  if (device) {
    if (device.clerkUserId !== userId) throw new ConvexError({ code: "session_owner_mismatch" });
    await ctx.db.patch(device._id, { revokedAt: device.revokedAt ?? Date.now() });
  }
  const id = await ctx.db.insert("clerkRevocations", {
    clerkUserId: userId, clerkSessionId: sid, requestedAt: Date.now(), attempts: 0,
  });
  await ctx.scheduler.runAfter(0, internal.deviceAccessInternal.reconcileRevocation, { id });
  return id;
}

export async function revokeDevice(ctx: MutationCtx, session: LiveSession, deviceId: Id<"mobileDevices">) {
  const actor = await requireLiveObservation(ctx.auth, session);
  await requireDeviceManagement(ctx);
  const device = await ctx.db.get(deviceId);
  if (!device || device.clerkUserId !== actor.userId)
    throw new ConvexError({ code: "device_not_found" });
  await queueRevocation(ctx, actor.userId, device.clerkSessionId);
}
