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
    const terminalSessionId = stored && stored.clerkSessionId !== session.clerkSessionId &&
      stored.clerkClientId !== session.clerkClientId
      ? await provenTerminalSession(stored.clerkSessionId, session.userId)
      : undefined;
    return ctx.runMutation(internal.deviceAccessInternal.register, { ...args, session, terminalSessionId });
  },
});

export const replace = action({
  args: {
    installId: v.string(), label: v.string(), platform: mobilePlatform, appVersion: v.string(),
    expectedOccupierId: v.id("mobileDevices"), expectedSessionId: v.string(),
  },
  returns: v.id("mobileDevices"),
  handler: async (ctx, args): Promise<Id<"mobileDevices">> => ctx.runMutation(
    internal.deviceAccessInternal.replace, { ...args, session: await verifyCurrentSession(ctx.auth) },
  ),
});

// A terminal proof names the exact stored SID. The mutation accepts it only while the slot
// still holds that SID, so a stale proof cannot move a slot another session already reclaimed.
// Lookup failures and responses for another session or owner give no proof, which refuses.
async function provenTerminalSession(sid: string, userId: string): Promise<string | undefined> {
  try {
    const stored = await getClerkSession(sid);
    if (stored === null) return sid;
    if (stored.id !== sid || stored.user_id !== userId) return undefined;
    return isTerminalClerkSession(stored) ? sid : undefined;
  } catch {
    return undefined;
  }
}

const deviceStatus = v.union(
  v.object({
    status: v.literal("unregistered"),
    wipeLocalInput: v.literal(false),
    existingLabel: v.optional(v.string()),
    occupier: v.optional(v.object({
      deviceId: v.id("mobileDevices"), sessionId: v.string(), label: v.string(), lastSeenAt: v.number(),
    })),
  }),
  v.object({ status: v.literal("revoked"), wipeLocalInput: v.literal(true), movedTo: v.optional(v.string()) }),
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
      return { status: "revoked", wipeLocalInput: true, ...(device?.replacedByLabel ? { movedTo: device.replacedByLabel } : {}) };
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
    const devices = args.platform ? await ctx.db.query("mobileDevices")
      .withIndex("by_user", (q) => q.eq("clerkUserId", actor.userId)).collect() : [];
    const occupier = devices.find((d) => d.platform === args.platform && d.revokedAt === undefined);
    return {
      status: "unregistered", wipeLocalInput: false,
      ...(occupier ? { occupier: {
        deviceId: occupier._id, sessionId: occupier.clerkSessionId,
        label: occupier.label, lastSeenAt: occupier.lastSeenAt,
      } } : {}),
    };
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
