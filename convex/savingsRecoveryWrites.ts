import { internalMutation } from "./_generated/server";
import { requireSubmission } from "./lib/deviceAuthorization";
import { liveSession } from "./lib/securityValues";
import { createAccountingCore } from "../src/accounting/core";
import { activatePlan as runActivatePlan } from "../src/savingsRecovery/activatePlan";
import { recordRecoveryMove } from "../src/savingsRecovery/recordRecoveryMove";
import { recoveryWriteStore } from "./savingsRecoveryStore";
import { runRecovery } from "./savingsRecoveryErrors";
import { run } from "./accountingErrors";
import { convexStore } from "./store";
import { activateArgs, activateResult, contributeArgs, contributeResult } from "./savingsRecoveryValues";

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
