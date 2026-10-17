import { internalMutation } from "./_generated/server";
import { requireSubmission } from "./lib/deviceAuthorization";
import { liveSession } from "./lib/securityValues";
import { activatePlan as runActivatePlan } from "../src/savingsRecovery/activatePlan";
import { recordContribution as runRecordContribution } from "../src/savingsRecovery/recordContribution";
import { recoveryWriteStore } from "./savingsRecoveryStore";
import { runRecovery } from "./savingsRecoveryErrors";
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
    return runRecovery(() => runRecordContribution(recoveryWriteStore(ctx, args.workspaceId), {
      ...args, actorId: actor.userId, now: Date.now(),
    }));
  },
});
