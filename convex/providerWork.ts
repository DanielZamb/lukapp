import { v, ConvexError } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { providerActor, providerError, workSummary } from "./providerValidators";
import { enqueueProviderWork } from "./lib/providerWork";
import { ownerAdmission, requireOwner } from "./lib/owner";
import { providerFailure } from "./lib/clerk";
import { providerSessionDenied, verifiedSessionId } from "./lib/deviceAccess";

function admittedActor(actor: { tokenIdentifier: string; issuer: string; subject: string }) {
  const error = ownerAdmission(actor);
  if (error) throw new ConvexError({ code: error });
  if (actor.tokenIdentifier !== `${actor.issuer}|${actor.subject}`) providerFailure("provider_provenance_mismatch");
}
export const get = internalQuery({
  args: { workId: v.id("clerkProviderWork") },
  handler: (ctx, { workId }) => ctx.db.get(workId),
});
export const status = query({
  args: { workId: v.id("clerkProviderWork") }, returns: workSummary,
  handler: async (ctx, { workId }) => {
    const owner = await requireOwner(ctx);
    verifiedSessionId(owner.clerkIdentity);
    const work = await ctx.db.get(workId);
    if (!work || work.tokenIdentifier !== owner.identity.tokenIdentifier) providerFailure("provider_provenance_mismatch");
    return { workId, state: work.state };
  },
});
export const recordAttempt = internalMutation({
  args: { workId: v.id("clerkProviderWork"), error: v.optional(providerError) }, returns: v.null(),
  handler: async (ctx, { workId, error }) => {
    const work = await ctx.db.get(workId);
    if (!work || work.state.kind === "succeeded") return null;
    if (!error) await ctx.db.patch(workId, { state: { kind: "succeeded", at: Date.now() } });
    else {
      const delay = Math.min(60 * 60 * 1000, 1000 * 2 ** Math.min(work.attempts, 12));
      await ctx.db.patch(workId, { state: { kind: "pending", nextAttemptAt: Date.now() + delay, error } });
      await ctx.scheduler.runAfter(delay, internal.clerkProvider.process, { workId });
    }
    return null;
  },
});
export const beginIntent = internalMutation({
  args: { ...providerActor, initiatingSid: v.string() },
  returns: v.object({ intentId: v.id("clerkRecoveryIntents"), expiresAt: v.number() }),
  handler: async (ctx, actor) => {
    admittedActor(actor);
    if (await providerSessionDenied(ctx, actor.tokenIdentifier, actor.initiatingSid)) providerFailure("provider_session_terminal");
    const intents = await ctx.db.query("clerkRecoveryIntents").withIndex("by_identity", (q) => q.eq("tokenIdentifier", actor.tokenIdentifier)).collect();
    for (const intent of intents) {
      if (intent.workId) {
        const work = await ctx.db.get(intent.workId);
        if (work?.state.kind === "pending") providerFailure("recovery_conflict");
      } else if (intent.expiresAt > Date.now()) {
        if (intent.initiatingSid !== actor.initiatingSid) providerFailure("recovery_conflict");
        return { intentId: intent._id, expiresAt: intent.expiresAt };
      }
    }
    const expiresAt = Date.now() + 10 * 60 * 1000;
    const intentId = await ctx.db.insert("clerkRecoveryIntents", { ...actor, createdAt: Date.now(), expiresAt });
    return { intentId, expiresAt };
  },
});
export const intent = internalQuery({
  args: { intentId: v.id("clerkRecoveryIntents") }, handler: (ctx, { intentId }) => ctx.db.get(intentId),
});
export const claimRecovery = internalMutation({
  args: { ...providerActor, intentId: v.id("clerkRecoveryIntents"), sid: v.string(), createdAt: v.number() },
  returns: workSummary,
  handler: async (ctx, args) => {
    admittedActor(args);
    const intent = await ctx.db.get(args.intentId);
    if (!intent || intent.tokenIdentifier !== args.tokenIdentifier) providerFailure("provider_provenance_mismatch");
    if (intent.workId) {
      const work = await ctx.db.get(intent.workId);
      if (!work || work.target.sid !== args.sid || work.target.kind !== "recovery") providerFailure("recovery_conflict");
      return { workId: work._id, state: work.state };
    }
    if (intent.expiresAt <= Date.now()) providerFailure("recovery_intent_expired");
    if (args.sid === intent.initiatingSid || args.createdAt <= intent.createdAt || args.createdAt > Date.now()) providerFailure("recovery_fresh_sign_in_required");
    if (await providerSessionDenied(ctx, args.tokenIdentifier, args.sid)) providerFailure("provider_session_terminal");
    if (await ctx.db.query("mobileDevices").withIndex("by_identity_sid", (q) => q.eq("tokenIdentifier", args.tokenIdentifier).eq("sid", args.sid)).unique()) providerFailure("recovery_conflict");
    const work = await enqueueProviderWork(ctx, { tokenIdentifier: args.tokenIdentifier, issuer: args.issuer, subject: args.subject },
      { kind: "recovery", sid: args.sid, createdAt: args.createdAt, scan: { offset: 0, hadLive: false }, intentId: intent._id });
    await ctx.db.patch(intent._id, { workId: work._id });
    return { workId: work._id, state: work.state };
  },
});
export const webhookDelivery = internalQuery({
  args: { eventId: v.string() },
  handler: (ctx, { eventId }) => ctx.db.query("clerkWebhookDeliveries").withIndex("by_event", (q) => q.eq("eventId", eventId)).unique(),
});
export const recordWebhook = internalMutation({
  args: { ...providerActor, eventId: v.string(), sid: v.string(), eventType: v.string(), timestamp: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    admittedActor(args);
    const prior = await ctx.db.query("clerkWebhookDeliveries").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).unique();
    if (!prior) await ctx.db.insert("clerkWebhookDeliveries", args);
    else if (prior.sid !== args.sid || prior.tokenIdentifier !== args.tokenIdentifier || prior.eventType !== args.eventType) providerFailure("provider_provenance_mismatch");
    return null;
  },
});
export const locallyDenied = internalQuery({
  args: { tokenIdentifier: v.string(), sid: v.string() },
  handler: (ctx, args) => providerSessionDenied(ctx, args.tokenIdentifier, args.sid),
});
export const recoveryInstalled = internalQuery({
  args: { tokenIdentifier: v.string(), eventId: v.string() },
  handler: async (ctx, args) => (await ctx.db.query("deviceRecoveryEvents").withIndex("by_identity_event", (q) => q.eq("tokenIdentifier", args.tokenIdentifier).eq("eventId", args.eventId)).unique()) !== null,
});

export const claimAttempt = internalMutation({
  args: { workId: v.id("clerkProviderWork") },
  handler: async (ctx, { workId }) => {
    const work = await ctx.db.get(workId);
    if (!work || work.state.kind === "succeeded" || work.state.nextAttemptAt > Date.now()) return null;
    const state = { kind: "pending", nextAttemptAt: Date.now() + 60_000 } as const;
    await ctx.db.patch(workId, { state, attempts: work.attempts + 1 });
    await ctx.scheduler.runAfter(60_000, internal.clerkProvider.process, { workId });
    return { ...work, state, attempts: work.attempts + 1 };
  },
});

export const checkpointRecovery = internalMutation({
  args: { workId: v.id("clerkProviderWork"), offset: v.number(), hadLive: v.boolean() }, returns: v.null(),
  handler: async (ctx, { workId, offset, hadLive }) => {
    const work = await ctx.db.get(workId);
    if (!work || work.state.kind === "succeeded" || work.target.kind !== "recovery") return null;
    await ctx.db.patch(workId, { target: { ...work.target, scan: { offset, hadLive } } });
    return null;
  },
});
export const continueRecovery = internalMutation({
  args: { workId: v.id("clerkProviderWork") }, returns: v.null(),
  handler: async (ctx, { workId }) => {
    const work = await ctx.db.get(workId);
    if (!work || work.state.kind === "succeeded") return null;
    await ctx.db.patch(workId, { state: { kind: "pending", nextAttemptAt: Date.now() } });
    await ctx.scheduler.runAfter(0, internal.clerkProvider.process, { workId });
    return null;
  },
});
