import { v } from "convex/values";
import { accessDenials } from "../src/access/protocol";

export const providerError = v.union(
  v.literal("provider_configuration_required"), v.literal("provider_instance_mismatch"), v.literal("provider_unavailable"),
  v.literal("provider_provenance_mismatch"), v.literal("provider_session_invalid"),
  v.literal("provider_session_terminal"), v.literal("recovery_fresh_sign_in_required"),
  v.literal("recovery_intent_expired"), v.literal("recovery_conflict"),
);
export const providerState = v.union(
  v.object({ kind: v.literal("pending"), nextAttemptAt: v.number(), error: v.optional(providerError) }),
  v.object({ kind: v.literal("succeeded"), at: v.number() }),
);
export const recoveryScan = v.union(
  v.object({ kind: v.literal("start") }),
  v.object({ kind: v.literal("continue"), offset: v.number(), hadLive: v.boolean(), totalCount: v.number(), anchorSid: v.string() }),
);
export const providerTarget = v.union(
  v.object({ kind: v.literal("revoke"), sid: v.string() }),
  v.object({ kind: v.literal("recovery"), sid: v.string(), createdAt: v.number(), scan: recoveryScan, intentId: v.id("clerkRecoveryIntents") }),
);
export const providerActor = { tokenIdentifier: v.string(), issuer: v.string(), subject: v.string() };
export const workSummary = v.object({ workId: v.id("clerkProviderWork"), state: providerState });

export const providerSessionStatus = v.union(
  v.object({ kind: v.literal("active"), providerCreatedAt: v.number(), providerExpiresAt: v.number() }),
  v.object({ kind: v.literal("denied"), code: v.union(providerError, ...accessDenials.map((code) => v.literal(code))), directive: v.literal("wipe-local-input-and-sign-out") }),
  v.object({ kind: v.literal("unavailable"), code: providerError }),
);
