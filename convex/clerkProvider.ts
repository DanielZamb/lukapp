import { v } from "convex/values";
import type { Infer } from "convex/values";
import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireOwner, ownerAdmission } from "./lib/owner";
import { verifiedSessionId } from "./lib/deviceAccess";
import { workSummary, providerError } from "./providerValidators";
import {
  activeSession, clerkTransport, getOwnedSession, ownedSession, providerFailure, sanitizedProviderError,
  sessionIsTerminal, verifyProviderInstance,
} from "./lib/clerk";
import type { ClerkTransport } from "./lib/clerk";

async function liveOwner(ctx: ActionCtx, clerk: ClerkTransport) {
  const owner = await requireOwner(ctx);
  const sid = verifiedSessionId(owner.clerkIdentity);
  if (owner.identity.tokenIdentifier !== `${owner.identity.issuer}|${owner.identity.subject}`) providerFailure("provider_provenance_mismatch");
  await verifyProviderInstance(clerk, owner.identity.issuer);
  const session = await getOwnedSession(clerk, owner.identity.subject, sid);
  if (!session || sessionIsTerminal(session)) {
    await ctx.runMutation(internal.devices.applyClerkSessionRevocation, { ...owner.identity, sid });
    providerFailure("provider_session_terminal");
  }
  if (await ctx.runQuery(internal.providerWork.locallyDenied, { tokenIdentifier: owner.identity.tokenIdentifier, sid })) providerFailure("provider_session_terminal");
  return { owner, sid, session: activeSession(session) };
}
export const checkSession = action({
  args: {},
  returns: v.union(v.object({ kind: v.literal("active"), providerCreatedAt: v.number(), providerExpiresAt: v.number() }),
    v.object({ kind: v.literal("denied"), code: providerError, directive: v.literal("wipe-local-input-and-sign-out") }),
    v.object({ kind: v.literal("unavailable"), code: providerError })),
  handler: async (ctx) => {
    await requireOwner(ctx);
    try {
      const { session } = await liveOwner(ctx, clerkTransport());
      return { kind: "active", providerCreatedAt: session.createdAt, providerExpiresAt: session.expireAt } as const;
    } catch (error) {
      const code = sanitizedProviderError(error);
      if (code === "provider_session_terminal" || code === "provider_session_invalid" || code === "provider_provenance_mismatch") {
        return { kind: "denied", code, directive: "wipe-local-input-and-sign-out" } as const;
      }
      return { kind: "unavailable", code } as const;
    }
  },
});
export const beginRecovery = action({
  args: {}, returns: v.object({ intentId: v.id("clerkRecoveryIntents"), expiresAt: v.number() }),
  handler: async (ctx): Promise<{ intentId: Id<"clerkRecoveryIntents">; expiresAt: number }> => {
    await requireOwner(ctx);
    try {
      const { owner, sid } = await liveOwner(ctx, clerkTransport());
      return await ctx.runMutation(internal.providerWork.beginIntent, { ...owner.identity, initiatingSid: sid });
    } catch (error) { providerFailure(sanitizedProviderError(error)); }
  },
});
export const completeRecovery = action({
  args: { intentId: v.id("clerkRecoveryIntents") }, returns: workSummary,
  handler: async (ctx, { intentId }): Promise<Infer<typeof workSummary>> => {
    const owner = await requireOwner(ctx);
    try {
      const { sid, session } = await liveOwner(ctx, clerkTransport());
      const work = await ctx.runMutation(internal.providerWork.claimRecovery, { ...owner.identity, intentId, sid, createdAt: session.createdAt });
      await processProviderWork(ctx, work.workId);
      const current = await ctx.runQuery(internal.providerWork.get, { workId: work.workId });
      if (!current) providerFailure("recovery_conflict");
      return { workId: current._id, state: current.state };
    } catch (error) { providerFailure(sanitizedProviderError(error)); }
  },
});

export async function processProviderWork(ctx: ActionCtx, workId: Id<"clerkProviderWork">, suppliedClerk?: ClerkTransport): Promise<void> {
  const work = await ctx.runMutation(internal.providerWork.claimAttempt, { workId });
  if (!work) return;
  try {
    if (ownerAdmission(work) || work.tokenIdentifier !== `${work.issuer}|${work.subject}`) providerFailure("provider_provenance_mismatch");
    const clerk = suppliedClerk ?? clerkTransport();
    await verifyProviderInstance(clerk, work.issuer);
    const actor = { tokenIdentifier: work.tokenIdentifier, issuer: work.issuer, subject: work.subject };
    const deny = (sid: string) => ctx.runMutation(internal.devices.applyClerkSessionRevocation, { ...actor, sid });
    const revoke = async (sid: string) => {
      await deny(sid);
      const session = await getOwnedSession(clerk, work.subject, sid);
      if (!session || sessionIsTerminal(session)) return;
      const revoked = ownedSession(await clerk.sessions.revokeSession(sid), work.subject, sid);
      if (!sessionIsTerminal(revoked)) providerFailure("provider_session_invalid");
    };
    const target = work.target;
    if (target.kind === "revoke") await revoke(target.sid);
    else {
      const eventId = `recovery:${target.intentId}`;
      const installed = await ctx.runQuery(internal.providerWork.recoveryInstalled, { tokenIdentifier: actor.tokenIdentifier, eventId });
      if (!installed) {
        const session = activeSession(ownedSession(await clerk.sessions.getSession(target.sid), work.subject, target.sid));
        if (session.createdAt !== target.createdAt) providerFailure("provider_provenance_mismatch");
        await ctx.runMutation(internal.devices.applyClerkRecovery, { ...actor, recoveredSid: target.sid, eventId });
      }
      let scan = target.scan;
      let finished = false;
      for (let pageNumber = 0; pageNumber < 20; pageNumber++) {
        const page = await clerk.sessions.getSessionList({ userId: work.subject, limit: 100, offset: scan.offset });
        if (!Number.isSafeInteger(page.totalCount) || page.totalCount < 0) providerFailure("provider_session_invalid");
        let hadLive = scan.hadLive;
        for (const item of page.data) {
          const session = ownedSession(item, work.subject, item.id);
          if (session.id !== target.sid && session.createdAt <= target.createdAt) {
            hadLive ||= !sessionIsTerminal(session);
            await revoke(session.id);
          }
        }
        const offset = scan.offset + page.data.length;
        if (offset < page.totalCount && page.data.length === 0) providerFailure("provider_unavailable");
        finished = offset >= page.totalCount && !hadLive;
        scan = offset >= page.totalCount ? { offset: 0, hadLive: false } : { offset, hadLive };
        await ctx.runMutation(internal.providerWork.checkpointRecovery, { workId, ...scan });
        if (finished) break;
      }
      if (!finished) {
        await ctx.runMutation(internal.providerWork.continueRecovery, { workId });
        return;
      }
    }
    await ctx.runMutation(internal.providerWork.recordAttempt, { workId });
  } catch (error) {
    await ctx.runMutation(internal.providerWork.recordAttempt, { workId, error: sanitizedProviderError(error) });
  }
}
export const process = internalAction({
  args: { workId: v.id("clerkProviderWork") }, returns: v.null(),
  handler: async (ctx, { workId }) => { await processProviderWork(ctx, workId); return null; },
});
