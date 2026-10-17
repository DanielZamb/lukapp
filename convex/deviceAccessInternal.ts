import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { liveSession, mobilePlatform } from "./lib/securityValues";
import { registerDevice, revokeDevice, queueRevocation, requireDeviceManagement } from "./lib/deviceRegistry";
import { requireLiveObservation } from "./lib/session";
import { revokeClerkSession } from "./lib/clerkProvider";

export const register = internalMutation({
  args: { session: liveSession, installId: v.string(), label: v.string(), platform: mobilePlatform, appVersion: v.string() },
  returns: v.id("mobileDevices"),
  handler: async (ctx, { session, ...metadata }) => registerDevice(ctx, session, metadata),
});

export const ownedDevices = internalQuery({
  args: {},
  handler: async (ctx) => {
    const actor = await requireDeviceManagement(ctx);
    return ctx.db.query("mobileDevices").withIndex("by_user", (q) => q.eq("clerkUserId", actor.userId)).collect();
  },
});

export const revoke = internalMutation({
  args: { session: liveSession, deviceId: v.id("mobileDevices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await revokeDevice(ctx, args.session, args.deviceId);
    return null;
  },
});

export const revokeOthers = internalMutation({
  args: { session: liveSession, sessionIds: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireLiveObservation(ctx.auth, args.session);
    await requireDeviceManagement(ctx);
    const devices = await ctx.db.query("mobileDevices")
      .withIndex("by_user", (q) => q.eq("clerkUserId", actor.userId)).collect();
    const sids = new Set([...args.sessionIds, ...devices.filter((d) => d.revokedAt === undefined).map((d) => d.clerkSessionId)]);
    for (const sid of sids) {
      if (sid !== actor.clerkSessionId) await queueRevocation(ctx, actor.userId, sid);
    }
    return null;
  },
});

export const revocation = internalQuery({
  args: { id: v.id("clerkRevocations") },
  handler: (ctx, { id }) => ctx.db.get(id),
});

export const recordAttempt = internalMutation({
  args: { id: v.id("clerkRevocations"), success: v.boolean() },
  handler: async (ctx, { id, success }) => {
    const job = await ctx.db.get(id);
    if (!job || job.completedAt !== undefined) return;
    const attempts = job.attempts + 1;
    await ctx.db.patch(id, { attempts, ...(success ? { completedAt: Date.now() } : {}) });
    if (!success) await ctx.scheduler.runAfter(
      Math.min(300_000, 1000 * 2 ** Math.min(attempts, 8)),
      internal.deviceAccessInternal.reconcileRevocation, { id },
    );
  },
});

export const reconcileRevocation = internalAction({
  args: { id: v.id("clerkRevocations") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const job = await ctx.runQuery(internal.deviceAccessInternal.revocation, { id });
    if (!job || job.completedAt !== undefined) return null;
    let success = false;
    try {
      await revokeClerkSession(job.clerkSessionId, job.clerkUserId);
      success = true;
    } catch {
      // Local denial is durable even when Clerk is unavailable. Retry without logging credentials.
    }
    await ctx.runMutation(internal.deviceAccessInternal.recordAttempt, { id, success });
    return null;
  },
});
