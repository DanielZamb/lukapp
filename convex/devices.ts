import { ConvexError, v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { ownerAdmission, requireOwner } from "./lib/owner";
import { accessOperation, devicePlatform, deviceProof, deviceSummary, deviceStatus, preparedChallenge } from "./deviceValidators";
import {
  bindingDenial, consumeChallenge, denyAccess, importDeviceKey, registrationAllowed,
  providerSessionDenied, requireEligibleSession, sessionBinding, sessionDenial, summarizeDevice, verifiedSessionId, verifyChallenge, verifyPayload,
} from "./lib/deviceAccess";
import { accessPolicy, bytesToHex, challengeMessage, directiveFor } from "../src/access/protocol";

export const status = query({
  args: { deviceId: v.optional(v.id("mobileDevices")) },
  returns: deviceStatus,
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const invalid = sessionDenial(owner.clerkIdentity);
    if (invalid) return { kind: "denied", code: invalid, directive: directiveFor(invalid) } as const;
    const sid = verifiedSessionId(owner.clerkIdentity);
    if (await providerSessionDenied(ctx, owner.identity.tokenIdentifier, sid)) return { kind: "denied", code: "session_revoked", directive: "wipe-local-input-and-sign-out" } as const;
    const device = await sessionBinding(ctx, owner.identity.tokenIdentifier, sid);
    if (device) {
      const denial = bindingDenial(device, Date.now());
      if (denial) return { kind: "denied", code: denial, directive: directiveFor(denial) } as const;
    }
    if (!(await registrationAllowed(ctx, owner.identity.tokenIdentifier, sid))) {
      return { kind: "denied", code: "recovery_registration_blocked", directive: "wipe-local-input-and-sign-out" } as const;
    }
    if (!device) {
      const code = args.deviceId ? "device_unknown" : "device_unregistered";
      return { kind: "denied", code, directive: directiveFor(code) } as const;
    }
    if (args.deviceId && args.deviceId !== device._id) {
      return { kind: "denied", code: "device_unknown", directive: "register-device" } as const;
    }
    return { kind: "registered", device: summarizeDevice(device), policy: accessPolicy } as const;
  },
});

export const list = query({
  args: {}, returns: v.array(deviceSummary),
  handler: async (ctx) => {
    const owner = await requireOwner(ctx);
    const sid = await requireEligibleSession(ctx, owner.clerkIdentity);
    const current = await sessionBinding(ctx, owner.identity.tokenIdentifier, sid);
    if (current) { const denial = bindingDenial(current, Date.now()); if (denial) denyAccess(denial); }
    if (!(await registrationAllowed(ctx, owner.identity.tokenIdentifier, sid))) denyAccess("recovery_registration_blocked");
    return (await ctx.db.query("mobileDevices").withIndex("by_identity", (q) => q.eq("tokenIdentifier", owner.identity.tokenIdentifier)).collect()).map(summarizeDevice);
  },
});

export const prepare = mutation({
  args: { operation: accessOperation, payloadHash: v.string(), deviceId: v.optional(v.id("mobileDevices")), publicKey: v.optional(v.string()) },
  returns: preparedChallenge,
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const sid = await requireEligibleSession(ctx, owner.clerkIdentity);
    if (!/^[0-9a-f]{64}$/.test(args.payloadHash)) denyAccess("device_request_mismatch");
    const device = await sessionBinding(ctx, owner.identity.tokenIdentifier, sid);
    if (device) {
      const denial = bindingDenial(device, Date.now()); if (denial) denyAccess(denial);
      const enrollmentRetry = args.operation === "devices.register" && args.deviceId === undefined && args.publicKey === device.publicKey;
      if (!enrollmentRetry && args.deviceId !== device._id) denyAccess("session_device_mismatch");
    } else {
      if (!(await registrationAllowed(ctx, owner.identity.tokenIdentifier, sid))) denyAccess("recovery_registration_blocked");
      if (args.deviceId) denyAccess("device_unknown");
      if (args.operation !== "devices.register" && args.operation !== "devices.revoke") denyAccess("device_unregistered");
    }
    const publicKey = device?.publicKey ?? args.publicKey;
    if (!publicKey) denyAccess("device_proof_required");
    await importDeviceKey(publicKey);
    for (const old of await ctx.db.query("deviceChallenges").withIndex("by_identity_sid", (q) => q.eq("tokenIdentifier", owner.identity.tokenIdentifier).eq("sid", sid)).collect()) {
      if (old.expiresAt <= Date.now()) await ctx.db.delete(old._id);
    }
    const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
    const expiresAt = Date.now() + accessPolicy.challengeLifetimeMs;
    const id = await ctx.db.insert("deviceChallenges", {
      tokenIdentifier: owner.identity.tokenIdentifier, sid, operation: args.operation, payloadHash: args.payloadHash,
      ...(device ? { deviceId: device._id } : {}), publicKey, nonce, expiresAt,
    });
    return { challengeId: id, expiresAt, message: challengeMessage({ challengeId: id, nonce, expiresAt,
      tokenIdentifier: owner.identity.tokenIdentifier, sid, operation: args.operation, payloadHash: args.payloadHash }) };
  },
});

export const register = mutation({
  args: { name: v.string(), platform: devicePlatform, publicKey: v.string(), access: v.optional(deviceProof) },
  returns: deviceSummary,
  handler: async (ctx, { access, ...args }) => {
    const owner = await requireOwner(ctx);
    const sid = await requireEligibleSession(ctx, owner.clerkIdentity);
    const verified = await verifyChallenge(ctx, owner.clerkIdentity, access, "devices.register", false);
    await verifyPayload(verified.challenge, args);
    if (args.publicKey !== verified.challenge.publicKey) denyAccess("device_proof_invalid");
    if (!args.name.trim() || args.name.length > 80) denyAccess("device_registration_conflict");
    const existing = await sessionBinding(ctx, owner.identity.tokenIdentifier, sid);
    if (existing) {
      if (existing.publicKey !== args.publicKey || existing.platform !== args.platform || existing.name !== args.name) denyAccess("device_registration_conflict");
      await consumeChallenge(ctx, verified.challenge, existing);
      return summarizeDevice({ ...existing, lastSeenAt: Date.now() });
    }
    const keyUsed = await ctx.db.query("mobileDevices").withIndex("by_identity_key", (q) => q.eq("tokenIdentifier", owner.identity.tokenIdentifier).eq("publicKey", args.publicKey)).first();
    if (keyUsed) denyAccess("device_registration_conflict");
    const slot = await ctx.db.query("mobileDevices").withIndex("by_identity_platform", (q) => q.eq("tokenIdentifier", owner.identity.tokenIdentifier).eq("platform", args.platform)).collect();
    if (slot.some((device) => device.state.kind === "active")) denyAccess("device_slot_occupied");
    const facts = { tokenIdentifier: owner.identity.tokenIdentifier, sid, ...args, createdAt: Date.now(), lastSeenAt: Date.now(), state: { kind: "active" } as const };
    const id = await ctx.db.insert("mobileDevices", facts);
    await consumeChallenge(ctx, verified.challenge, null);
    return { id, name: facts.name, platform: facts.platform, createdAt: facts.createdAt, lastSeenAt: facts.lastSeenAt, state: facts.state };
  },
});

export const heartbeat = mutation({
  args: { access: v.optional(deviceProof) }, returns: deviceSummary,
  handler: async (ctx, { access }) => {
    const owner = await requireOwner(ctx);
    const verified = await verifyChallenge(ctx, owner.clerkIdentity, access, "devices.heartbeat", true);
    await verifyPayload(verified.challenge, {});
    if (!verified.device) denyAccess("device_unregistered");
    await consumeChallenge(ctx, verified.challenge, verified.device);
    return summarizeDevice({ ...verified.device, lastSeenAt: Date.now() });
  },
});

export const revoke = mutation({
  args: { deviceId: v.id("mobileDevices"), access: v.optional(deviceProof) },
  returns: v.object({ kind: v.literal("revoked"), providerRevocation: v.literal("pending-integration") }),
  handler: async (ctx, { access, ...args }) => {
    const owner = await requireOwner(ctx);
    const verified = await verifyChallenge(ctx, owner.clerkIdentity, access, "devices.revoke", false);
    await verifyPayload(verified.challenge, args);
    const device = await ctx.db.get(args.deviceId);
    if (!device || device.tokenIdentifier !== owner.identity.tokenIdentifier) denyAccess("device_unknown");
    if (device.state.kind === "active") await ctx.db.patch(device._id, { state: { kind: "revoked", at: Date.now(), reason: "owner" } });
    await consumeChallenge(ctx, verified.challenge, null);
    return { kind: "revoked", providerRevocation: "pending-integration" } as const;
  },
});

export const approveRegistration = mutation({
  args: { sid: v.string(), access: v.optional(deviceProof) }, returns: v.null(),
  handler: async (ctx, { access, ...args }) => {
    const owner = await requireOwner(ctx);
    const verified = await verifyChallenge(ctx, owner.clerkIdentity, access, "devices.approveRegistration", true);
    await verifyPayload(verified.challenge, args);
    if (!/^sess_[a-zA-Z0-9]{1,120}$/.test(args.sid)) denyAccess("session_id_invalid");
    if (await providerSessionDenied(ctx, owner.identity.tokenIdentifier, args.sid)) denyAccess("session_revoked");
    const old = await sessionBinding(ctx, owner.identity.tokenIdentifier, args.sid);
    if (old) denyAccess("device_registration_conflict");
    const approval = await ctx.db.query("deviceRegistrationApprovals").withIndex("by_identity_sid", (q) => q.eq("tokenIdentifier", owner.identity.tokenIdentifier).eq("sid", args.sid)).unique();
    if (!approval) await ctx.db.insert("deviceRegistrationApprovals", { tokenIdentifier: owner.identity.tokenIdentifier, sid: args.sid });
    await consumeChallenge(ctx, verified.challenge, verified.device);
    return null;
  },
});

export const applyClerkRecovery = internalMutation({
  args: { tokenIdentifier: v.string(), issuer: v.string(), subject: v.string(), recoveredSid: v.string(), eventId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const error = ownerAdmission({ tokenIdentifier: args.tokenIdentifier, issuer: args.issuer, subject: args.subject });
    if (error) throw new ConvexError({ code: error });
    if (args.tokenIdentifier !== `${args.issuer}|${args.subject}` || !/^sess_[a-zA-Z0-9]{1,120}$/.test(args.recoveredSid) || !args.eventId) denyAccess("device_registration_conflict");
    const prior = await ctx.db.query("deviceRecoveryEvents").withIndex("by_identity_event", (q) => q.eq("tokenIdentifier", args.tokenIdentifier).eq("eventId", args.eventId)).unique();
    if (prior) {
      if (prior.recoveredSid !== args.recoveredSid) denyAccess("device_registration_conflict");
      return null;
    }
    if (await providerSessionDenied(ctx, args.tokenIdentifier, args.recoveredSid)) denyAccess("session_revoked");
    const devices = await ctx.db.query("mobileDevices").withIndex("by_identity", (q) => q.eq("tokenIdentifier", args.tokenIdentifier)).collect();
    if (devices.some((device) => device.sid === args.recoveredSid)) denyAccess("device_registration_conflict");
    for (const device of devices) {
      if (device.state.kind === "active") await ctx.db.patch(device._id, { state: { kind: "revoked", at: Date.now(), reason: "recovery" } });
    }
    const barrier = await ctx.db.query("deviceRecoveryBarriers").withIndex("by_identity", (q) => q.eq("tokenIdentifier", args.tokenIdentifier)).unique();
    if (!barrier) await ctx.db.insert("deviceRecoveryBarriers", { tokenIdentifier: args.tokenIdentifier });
    for (const approval of await ctx.db.query("deviceRegistrationApprovals").filter((q) => q.eq(q.field("tokenIdentifier"), args.tokenIdentifier)).collect()) await ctx.db.delete(approval._id);
    await ctx.db.insert("deviceRegistrationApprovals", { tokenIdentifier: args.tokenIdentifier, sid: args.recoveredSid });
    await ctx.db.insert("deviceRecoveryEvents", { tokenIdentifier: args.tokenIdentifier, eventId: args.eventId, recoveredSid: args.recoveredSid });
    return null;
  },
});

export const applyClerkSessionRevocation = internalMutation({
  args: { tokenIdentifier: v.string(), issuer: v.string(), subject: v.string(), sid: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const error = ownerAdmission({ tokenIdentifier: args.tokenIdentifier, issuer: args.issuer, subject: args.subject });
    if (error) throw new ConvexError({ code: error });
    if (args.tokenIdentifier !== `${args.issuer}|${args.subject}` || !/^sess_[a-zA-Z0-9]{1,120}$/.test(args.sid)) denyAccess("session_id_invalid");
    if (!(await providerSessionDenied(ctx, args.tokenIdentifier, args.sid))) await ctx.db.insert("deviceSessionDenials", { tokenIdentifier: args.tokenIdentifier, sid: args.sid, at: Date.now() });
    const device = await sessionBinding(ctx, args.tokenIdentifier, args.sid);
    if (device?.state.kind === "active") await ctx.db.patch(device._id, { state: { kind: "revoked", at: Date.now(), reason: "provider" } });
    return null;
  },
});
