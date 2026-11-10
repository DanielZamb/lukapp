import { cancelPlan as runCancelPlan } from "../src/savingsRecovery/cancelPlan";
import { correctContribution as runCorrectContribution } from "../src/savingsRecovery/correctContribution";
import { internalMutation } from "./_generated/server";
import { requireSubmission } from "./lib/deviceAuthorization";
import { liveSession } from "./lib/securityValues";
import { createAccountingCore } from "../src/accounting/core";
import { activatePlan as runActivatePlan } from "../src/savingsRecovery/activatePlan";
import { recordRecoveryMove } from "../src/savingsRecovery/recordRecoveryMove";
import { recoveryEventDateResolver, recoveryWriteStore } from "./savingsRecoveryStore";
import { v } from "convex/values";
import { runRecovery } from "./savingsRecoveryErrors";
import { run } from "./accountingErrors";
import { convexStore } from "./store";
import { activateArgs, activateResult, contributeArgs, contributeResult, cancelArgs, cancelResult, correctArgs, correctResult } from "./savingsRecoveryValues";

export const backfillEventCalendarDates = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    table: v.union(v.literal("plans"), v.literal("cancellations")),
    cursor: v.union(v.string(), v.null()),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({ cursor: v.string(), done: v.boolean(), scanned: v.number(), updated: v.number() }),
  handler: async (ctx, { workspaceId, table, cursor, batchSize = 100 }) => {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 250)
      throw new Error("batchSize must be an integer between 1 and 250");
    if (!await ctx.db.get(workspaceId)) throw new Error("workspace_not_found");
    const eventDate = recoveryEventDateResolver(ctx, workspaceId);
    let updated = 0;
    if (table === "plans") {
      const page = await ctx.db.query("savingsRecoveryPlans")
        .withIndex("by_workspace", q => q.eq("workspaceId", workspaceId))
        .paginate({ cursor, numItems: batchSize });
      for (const plan of page.page) {
        if (plan.activationDate !== undefined) continue;
        await ctx.db.patch(plan._id, { activationDate: await eventDate(plan.createdAt) });
        updated++;
      }
      return { cursor: page.continueCursor, done: page.isDone, scanned: page.page.length, updated };
    }
    const page = await ctx.db.query("savingsRecoveryCancellations")
      .withIndex("by_workspace", q => q.eq("workspaceId", workspaceId))
      .paginate({ cursor, numItems: batchSize });
    for (const cancellation of page.page) {
      if (cancellation.cancellationDate !== undefined) continue;
      await ctx.db.patch(cancellation._id, { cancellationDate: await eventDate(cancellation.eventTime) });
      updated++;
    }
    return { cursor: page.continueCursor, done: page.isDone, scanned: page.page.length, updated };
  },
});

export const activatePlan = internalMutation({
  args: { ...activateArgs, session: liveSession }, returns: activateResult,
  handler: async (ctx, { session, ...args }) => {
    const actor = await requireSubmission(ctx, { session, workspaceId: args.workspaceId, permission: "workspace:admin" });
    return runRecovery(() => runActivatePlan(recoveryWriteStore(ctx, args.workspaceId), {
      ...args, actorId: actor.userId, now: Date.now(),
    }));
  },
});

export const recordContribution = internalMutation({
  args: { ...contributeArgs, session: liveSession }, returns: contributeResult,
  handler: async (ctx, { session, ...args }) => {
    const actor = await requireSubmission(ctx, { session, workspaceId: args.workspaceId, permission: "workspace:admin" });
    await requireSubmission(ctx, { session, workspaceId: args.workspaceId, permission: "accounting:post" });
    const accounting = createAccountingCore(convexStore(ctx.db));
    return run(() => runRecovery(async () => {
      const result = await recordRecoveryMove(
        recoveryWriteStore(ctx, args.workspaceId),
        async (transfer) => {
          const posted = await accounting.recordAccountTransfer({ ...transfer, actor });
          return {
            id: posted.id,
            amountMinorUnits: posted.amount.minorUnits,
            accountingDate: posted.accountingDate,
          };
        },
        { ...args, actorId: actor.userId, now: Date.now() },
      );
      return {
        replay: result.replay,
        transfer: {
          id: result.transfer.id,
          amount: { currency: args.amount.currency, minorUnits: result.transfer.amountMinorUnits },
        },
        contribution: result.contribution,
      };
    }));
  },
});

export const cancelPlan = internalMutation({
  args: { ...cancelArgs, session: liveSession }, returns: cancelResult,
  handler: async (ctx, { session, ...args }) => {
    const actor = await requireSubmission(ctx, { session, workspaceId: args.workspaceId, permission: "workspace:admin" });
    return runRecovery(() => runCancelPlan(recoveryWriteStore(ctx, args.workspaceId), {
      ...args, actorId: actor.userId, now: Date.now(),
    }));
  },
});

export const correctContribution = internalMutation({
  args: { ...correctArgs, session: liveSession }, returns: correctResult,
  handler: async (ctx, { session, ...args }) => {
    const actor = await requireSubmission(ctx, { session, workspaceId: args.workspaceId, permission: "workspace:admin" });
    return runRecovery(() => runCorrectContribution(recoveryWriteStore(ctx, args.workspaceId), {
      ...args, actorId: actor.userId, now: Date.now(),
    }));
  },
});
