import type { UserIdentity } from "convex/server";
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  accessPolicy, bindingExpiry, challengeMessage, directiveFor, hexToBytes, requestHash,
} from "../../src/access/protocol";
import type { AccessDenial, AccessOperation } from "../../src/access/protocol";

export function denyAccess(code: AccessDenial): never {
  throw new ConvexError({ code, directive: directiveFor(code) });
}
export function sessionDenial(identity: UserIdentity): AccessDenial | null {
  if (identity.sid === undefined) return "session_id_required";
  if (typeof identity.sid !== "string" || !/^sess_[a-zA-Z0-9]{1,120}$/.test(identity.sid)) return "session_id_invalid";
  if (identity.sts === undefined) return "session_state_unverified";
  if (identity.sts !== "active") return "session_not_active";
  return null;
}
export function verifiedSessionId(identity: UserIdentity): string {
  const denial = sessionDenial(identity);
  if (denial) denyAccess(denial);
  if (typeof identity.sid !== "string") denyAccess("session_id_invalid");
  return identity.sid;
}
export async function providerSessionDenied(ctx: Pick<QueryCtx, "db">, tokenIdentifier: string, sid: string) {
  return (await ctx.db.query("deviceSessionDenials").withIndex("by_identity_sid", (q) => q.eq("tokenIdentifier", tokenIdentifier).eq("sid", sid)).unique()) !== null;
}
export async function requireEligibleSession(ctx: Pick<QueryCtx, "db">, identity: UserIdentity) {
  const sid = verifiedSessionId(identity);
  if (await providerSessionDenied(ctx, identity.tokenIdentifier, sid)) denyAccess("session_revoked");
  return sid;
}
export function sessionBinding(ctx: Pick<QueryCtx, "db">, tokenIdentifier: string, sid: string) {
  return ctx.db.query("mobileDevices").withIndex("by_identity_sid", (q) => q.eq("tokenIdentifier", tokenIdentifier).eq("sid", sid)).unique();
}
export async function registrationAllowed(ctx: Pick<QueryCtx, "db">, tokenIdentifier: string, sid: string) {
  const barrier = await ctx.db.query("deviceRecoveryBarriers").withIndex("by_identity", (q) => q.eq("tokenIdentifier", tokenIdentifier)).unique();
  if (!barrier) return true;
  const approved = await ctx.db.query("deviceRegistrationApprovals").withIndex("by_identity_sid", (q) => q.eq("tokenIdentifier", tokenIdentifier).eq("sid", sid)).unique();
  return approved !== null;
}
export function bindingDenial(binding: Doc<"mobileDevices"> | null, now: number): AccessDenial | null {
  if (!binding) return "device_unregistered";
  if (binding.state.kind === "revoked") return "device_revoked";
  return bindingExpiry(binding, now);
}
export async function requireBinding(ctx: Pick<QueryCtx, "db">, tokenIdentifier: string, sid: string, deviceId?: Id<"mobileDevices">) {
  const binding = await sessionBinding(ctx, tokenIdentifier, sid);
  const denial = bindingDenial(binding, Date.now());
  if (denial) denyAccess(denial);
  if (!binding) denyAccess("device_unregistered");
  if (deviceId !== binding._id) denyAccess("session_device_mismatch");
  return binding;
}
export async function importDeviceKey(publicKey: string) {
  try {
    if (!/^04[0-9a-f]{128}$/.test(publicKey)) denyAccess("device_key_invalid");
    return await crypto.subtle.importKey("raw", hexToBytes(publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  } catch {
    denyAccess("device_key_invalid");
  }
}

export async function verifyChallenge(
  ctx: Pick<QueryCtx, "db">,
  identity: UserIdentity,
  proof: { challengeId: Id<"deviceChallenges">; signature: string } | undefined,
  operation: AccessOperation,
  requireRegistered: boolean,
) {
  const sid = await requireEligibleSession(ctx, identity);
  const current = await sessionBinding(ctx, identity.tokenIdentifier, sid);
  if (current) {
    const denial = bindingDenial(current, Date.now());
    if (denial) denyAccess(denial);
  } else if (!(await registrationAllowed(ctx, identity.tokenIdentifier, sid))) {
    denyAccess("recovery_registration_blocked");
  }
  if (!proof) denyAccess("device_proof_required");
  const challenge = await ctx.db.get(proof.challengeId);
  if (!challenge || challenge.tokenIdentifier !== identity.tokenIdentifier || challenge.sid !== sid || challenge.operation !== operation)
    denyAccess("device_proof_invalid");
  if (challenge.consumedAt !== undefined) denyAccess("device_challenge_replayed");
  if (Date.now() >= challenge.expiresAt) denyAccess("device_challenge_expired");
  let device: Doc<"mobileDevices"> | null = null;
  if (requireRegistered) device = await requireBinding(ctx, identity.tokenIdentifier, sid, challenge.deviceId);
  else if (current) {
    const enrollmentRetry = operation === "devices.register" && challenge.deviceId === undefined && challenge.publicKey === current.publicKey;
    if (!enrollmentRetry && (challenge.deviceId !== current._id || challenge.publicKey !== current.publicKey)) denyAccess("session_device_mismatch");
  }
  const key = await importDeviceKey(challenge.publicKey);
  let verified = false;
  try {
    if (/^[0-9a-f]{128}$/.test(proof.signature)) {
      verified = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, hexToBytes(proof.signature),
        new TextEncoder().encode(challengeMessage({
          challengeId: challenge._id, nonce: challenge.nonce, tokenIdentifier: challenge.tokenIdentifier,
          sid, operation, payloadHash: challenge.payloadHash, expiresAt: challenge.expiresAt,
        })));
    }
  } catch {
    verified = false;
  }
  if (!verified) denyAccess("device_proof_invalid");
  return { challenge, device };
}

export async function verifyPayload(challenge: Doc<"deviceChallenges">, args: unknown) {
  if (await requestHash(args) !== challenge.payloadHash) denyAccess("device_request_mismatch");
}
export async function consumeChallenge(ctx: Pick<MutationCtx, "db">, challenge: Doc<"deviceChallenges">, device: Doc<"mobileDevices"> | null) {
  await ctx.db.patch(challenge._id, { consumedAt: Date.now() });
  if (device) await ctx.db.patch(device._id, { lastSeenAt: Date.now() });
}
export function summarizeDevice(device: Doc<"mobileDevices">) {
  return { id: device._id, name: device.name, platform: device.platform, createdAt: device.createdAt, lastSeenAt: device.lastSeenAt, state: device.state };
}
