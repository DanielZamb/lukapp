import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { action, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { mobilePlatform } from "./lib/securityValues";
import { requireSession, verifyCurrentSession } from "./lib/session";
import { getClerkSession, isTerminalClerkSession, listActiveClerkSessions } from "./lib/clerkProvider";
import { findOwnedInstall, requireDeviceManagement } from "./lib/deviceRegistry";

export const register = action({
  args: { installId: v.string(), label: v.string(), platform: mobilePlatform, appVersion: v.string() },
  returns: v.id("mobileDevices"),
  handler: async (ctx, args): Promise<Id<"mobileDevices">> => {
    const session = await verifyCurrentSession(ctx.auth);
    const devices = await ctx.runQuery(internal.deviceAccessInternal.ownedDevices, {});
    const stored = devices.find((d) => d.revokedAt === undefined &&
      d.installId === args.installId && d.platform === args.platform);
    const storedSessionTerminal = !!stored && stored.clerkSessionId !== session.clerkSessionId &&
      stored.clerkClientId !== session.clerkClientId &&
      isTerminalClerkSession(await getClerkSession(stored.clerkSessionId));
    return ctx.runMutation(internal.deviceAccessInternal.register, { ...args, session, storedSessionTerminal });
  },
});

const deviceStatus = v.union(
  v.object({
    status: v.literal("unregistered"),
    wipeLocalInput: v.literal(false),
    existingLabel: v.optional(v.string()),
  }),
  v.object({ status: v.literal("revoked"), wipeLocalInput: v.literal(true) }),
  v.object({ status: v.literal("registered"), deviceId: v.id("mobileDevices"), wipeLocalInput: v.literal(false) }),
);
export const status = query({
  args: { installId: v.optional(v.string()), platform: v.optional(mobilePlatform) },
  returns: deviceStatus,
  handler: async (ctx, args): Promise<Infer<typeof deviceStatus>> => {
    const actor = await requireSession(ctx.auth);
    const revoked = await ctx.db.query("clerkRevocations")
      .withIndex("by_session", (q) => q.eq("clerkSessionId", actor.clerkSessionId)).unique();
    const device = await ctx.db.query("mobileDevices")
      .withIndex("by_session", (q) => q.eq("clerkSessionId", actor.clerkSessionId)).unique();
    if (revoked || (device?.clerkUserId === actor.userId && device.revokedAt !== undefined))
      return { status: "revoked", wipeLocalInput: true };
    await requireDeviceManagement(ctx);
    if (device && device.clerkUserId === actor.userId)
      return { status: "registered", deviceId: device._id, wipeLocalInput: false };
    if (args.installId) {
      const known = await findOwnedInstall(ctx, {
        userId: actor.userId, installId: args.installId, platform: args.platform,
      });
      const storedDenied = known && await ctx.db.query("clerkRevocations")
        .withIndex("by_session", (q) => q.eq("clerkSessionId", known.clerkSessionId)).unique();
      if (known && storedDenied)
        return { status: "unregistered", wipeLocalInput: false, existingLabel: known.label };
    }
    return { status: "unregistered", wipeLocalInput: false };
  },
});

const listedDevice = v.object({
  deviceId: v.id("mobileDevices"), label: v.string(), platform: mobilePlatform,
  current: v.boolean(), revoked: v.boolean(), clerkActive: v.boolean(),
});
export const list = action({
  args: {},
  returns: v.array(listedDevice),
  handler: async (ctx): Promise<Infer<typeof listedDevice>[]> => {
    const actor = await verifyCurrentSession(ctx.auth);
    const devices = await ctx.runQuery(internal.deviceAccessInternal.ownedDevices, {});
    const sessions = await listActiveClerkSessions(actor.userId);
    return devices.map((d) => ({
      deviceId: d._id, label: d.label, platform: d.platform,
      current: d.clerkSessionId === actor.clerkSessionId,
      revoked: d.revokedAt !== undefined,
      clerkActive: sessions.some((s) => s.id === d.clerkSessionId && s.status === "active"),
    }));
  },
});

const revocationQueued = v.object({ status: v.literal("revoked"), clerkRevocation: v.literal("queued") });
export const revoke = action({
  args: { deviceId: v.id("mobileDevices") },
  returns: revocationQueued,
  handler: async (ctx, args): Promise<Infer<typeof revocationQueued>> => {
    const session = await verifyCurrentSession(ctx.auth);
    const devices = await ctx.runQuery(internal.deviceAccessInternal.ownedDevices, {});
    const device = devices.find((d) => d._id === args.deviceId);
    if (!device) throw new ConvexError({ code: "device_not_found" });
    const target = await getClerkSession(device.clerkSessionId);
    if (target && (target.id !== device.clerkSessionId || target.user_id !== session.userId))
      throw new ConvexError({ code: "session_owner_mismatch" });
    await ctx.runMutation(internal.deviceAccessInternal.revoke, { session, ...args });
    return { status: "revoked", clerkRevocation: "queued" };
  },
});

// Invoke after Clerk-owned recovery, before registering the recovered phone or opening financial UI.
export const revokeOtherSessions = action({
  args: {},
  returns: revocationQueued,
  handler: async (ctx): Promise<Infer<typeof revocationQueued>> => {
    const session = await verifyCurrentSession(ctx.auth);
    const others = await listActiveClerkSessions(session.userId);
    await ctx.runMutation(internal.deviceAccessInternal.revokeOthers, {
      session, sessionIds: others.map((s) => s.id),
    });
    return { status: "revoked", clerkRevocation: "queued" };
  },
});
