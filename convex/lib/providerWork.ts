import type { MutationCtx } from "../_generated/server";
import type { Infer } from "convex/values";
import { internal } from "../_generated/api";
import { providerTarget } from "../providerValidators";

export async function enqueueProviderWork(ctx: MutationCtx, actor: { tokenIdentifier: string; issuer: string; subject: string }, target: Infer<typeof providerTarget>) {
  const existing = await ctx.db.query("clerkProviderWork").withIndex("by_identity", (q) => q.eq("tokenIdentifier", actor.tokenIdentifier)).collect();
  const prior = existing.find((work) => work.target.kind === target.kind && work.target.sid === target.sid);
  if (prior) return prior;
  const state = { kind: "pending", nextAttemptAt: Date.now() } as const;
  const workId = await ctx.db.insert("clerkProviderWork", { ...actor, target, state, attempts: 0 });
  await ctx.scheduler.runAfter(0, internal.providerWork.dispatch, { workId });
  return { _id: workId, state };
}
