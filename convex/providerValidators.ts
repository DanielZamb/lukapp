import { v } from "convex/values";

export const providerError = v.union(
  v.literal("provider_configuration_required"), v.literal("provider_unavailable"),
  v.literal("provider_provenance_mismatch"), v.literal("provider_session_invalid"),
  v.literal("provider_session_terminal"), v.literal("recovery_fresh_sign_in_required"),
  v.literal("recovery_intent_expired"), v.literal("recovery_conflict"),
);
export const providerState = v.union(
  v.object({ kind: v.literal("pending"), nextAttemptAt: v.number(), error: v.optional(providerError) }),
  v.object({ kind: v.literal("succeeded"), at: v.number() }),
);
export const providerTarget = v.union(
  v.object({ kind: v.literal("revoke"), sid: v.string() }),
  v.object({ kind: v.literal("recovery"), sid: v.string(), createdAt: v.number(), scan: v.object({ offset: v.number(), hadLive: v.boolean() }), intentId: v.id("clerkRecoveryIntents") }),
);
export const providerActor = { tokenIdentifier: v.string(), issuer: v.string(), subject: v.string() };
export const workSummary = v.object({ workId: v.id("clerkProviderWork"), state: providerState });
