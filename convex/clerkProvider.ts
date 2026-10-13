import { v } from "convex/values";
import type { Infer } from "convex/values";
import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import { requireOwner, ownerAdmission } from "./lib/owner";
import { sessionDenial, verifiedSessionId } from "./lib/deviceAccess";
import { workSummary, providerSessionStatus } from "./providerValidators";
import {
  activeSession, clerkTransport, getOwnedSession, ownedSession, providerFailure, sanitizedProviderError,
  sessionIsTerminal, verifyProviderInstance,
} from "./lib/clerk";

async function liveOwner(ctx: ActionCtx, retrievingIntent = false) {
  const owner = await requireOwner(ctx);
  const sid = verifiedSessionId(owner.clerkIdentity);
  if (owner.identity.tokenIdentifier !== `${owner.identity.issuer}|${owner.identity.subject}`) providerFailure("provider_provenance_mismatch");
  if (!retrievingIntent && await ctx.runQuery(internal.providerWork.locallyDenied, { tokenIdentifier: owner.identity.tokenIdentifier, sid })) providerFailure("provider_session_terminal");
  const clerk = clerkTransport();
  await verifyProviderInstance(clerk, owner.identity.issuer);
  const session = await getOwnedSession(clerk, owner.identity.subject, sid);
  if (!session || sessionIsTerminal(session)) {
    await ctx.runMutation(internal.devices.applyClerkSessionRevocation, { ...owner.identity, sid });
    providerFailure("provider_session_terminal");
  }
  return { owner, sid, session: activeSession(session) };
}
export const checkSession = action({
  args: {},
  returns: providerSessionStatus,
  handler: async (ctx): Promise<Infer<typeof providerSessionStatus>> => {
    const owner = await requireOwner(ctx);
    const denial = sessionDenial(owner.clerkIdentity);
    if (denial) return { kind: "denied", code: denial, directive: "wipe-local-input-and-sign-out" } as const;
    const local = await ctx.runQuery(api.devices.status, {});
    if (local.kind === "denied" && local.directive === "wipe-local-input-and-sign-out") return { kind: "denied", code: local.code, directive: local.directive };
    try {
      const { session } = await liveOwner(ctx);
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
      const { owner, sid } = await liveOwner(ctx, true);
      return await ctx.runMutation(internal.providerWork.beginIntent, { ...owner.identity, initiatingSid: sid });
    } catch (error) { providerFailure(sanitizedProviderError(error)); }
  },
});
export const completeRecovery = action({
  args: { intentId: v.id("clerkRecoveryIntents") }, returns: workSummary,
  handler: async (ctx, { intentId }): Promise<Infer<typeof workSummary>> => {
    const owner = await requireOwner(ctx);
    try {
      const { sid, session } = await liveOwner(ctx);
      const work = await ctx.runMutation(internal.providerWork.claimRecovery, { ...owner.identity, intentId, sid, createdAt: session.createdAt });
      await processProviderWork(ctx, work.workId);
      const current = await ctx.runQuery(internal.providerWork.get, { workId: work.workId });
      if (!current) providerFailure("recovery_conflict");
      return { workId: current._id, state: current.state };
    } catch (error) { providerFailure(sanitizedProviderError(error)); }
  },
});

export async function processProviderWork(ctx: ActionCtx, workId: Id<"clerkProviderWork">): Promise<void> {
  const work = await ctx.runMutation(internal.providerWork.claimAttempt, { workId });
  if (!work) return;
  try {
    if (ownerAdmission(work) || work.tokenIdentifier !== `${work.issuer}|${work.subject}`) providerFailure("provider_provenance_mismatch");
    const clerk = clerkTransport();
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
      let scan = target.scan;
      let finished = false;
      for (let pageNumber = 0; pageNumber < 20; pageNumber++) {
        const current = scan;
        const continuing = current.kind === "continue";
        const page = await clerk.sessions.getSessionList({ userId: work.subject, limit: continuing ? 101 : 100, offset: continuing ? current.offset - 1 : 0 });
        if (!Number.isSafeInteger(page.totalCount) || page.totalCount < 0) providerFailure("provider_session_invalid");
        const sessions = page.data.map((item) => ownedSession(item, work.subject, item.id));
        if (continuing && (page.totalCount !== current.totalCount || sessions[0]?.id !== current.anchorSid)) {
          scan = { kind: "start" };
          if (!await ctx.runMutation(internal.providerWork.checkpointRecovery, { workId, attempt: work.attempts, scan })) return;
          continue;
        }
        const items = continuing ? sessions.slice(1) : sessions;
        let hadLive = continuing && current.hadLive;
        for (const session of items) {
          if (session.id !== target.sid && session.createdAt <= target.createdAt) {
            hadLive ||= !sessionIsTerminal(session);
            await revoke(session.id);
          }
        }
        const offset = (continuing ? current.offset : 0) + items.length;
        if (offset < page.totalCount && items.length === 0) providerFailure("provider_unavailable");
        finished = offset >= page.totalCount && !hadLive;
        const last = items.at(-1);
        if (offset >= page.totalCount) scan = { kind: "start" };
        else {
          if (!last) providerFailure("provider_session_invalid");
          scan = { kind: "continue", offset, hadLive, totalCount: page.totalCount, anchorSid: last.id };
        }
        if (!await ctx.runMutation(internal.providerWork.checkpointRecovery, { workId, attempt: work.attempts, scan })) return;
        if (finished) break;
      }
      if (!finished) {
        await ctx.runMutation(internal.providerWork.continueRecovery, { workId, attempt: work.attempts });
        return;
      }
    }
    await ctx.runMutation(internal.providerWork.recordAttempt, { workId, attempt: work.attempts });
  } catch (error) {
    await ctx.runMutation(internal.providerWork.recordAttempt, { workId, attempt: work.attempts, error: sanitizedProviderError(error) });
  }
}
export const process = internalAction({
  args: { workId: v.id("clerkProviderWork") }, returns: v.null(),
  handler: async (ctx, { workId }) => { await processProviderWork(ctx, workId); return null; },
});
