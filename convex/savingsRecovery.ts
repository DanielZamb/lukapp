import { v, type Infer } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { ownerQuery } from "./lib/functions";
import { requireWorkspacePermission } from "./lib/deviceAuthorization";
import { verifyCurrentSession } from "./lib/session";
import {
  evaluation, activateArgs, activateResult, contributeArgs, contributeResult,
} from "./savingsRecoveryValues";
import { recoveryReadStore } from "./savingsRecoveryStore";
import { runRecovery } from "./savingsRecoveryErrors";
import { evaluateWorkspace } from "../src/savingsRecovery/evaluate";
import { currentRecoveryMonth } from "../src/savingsRecovery/policy";

export const evaluate = ownerQuery({
  args: { workspaceId: v.string(), month: v.optional(v.string()), refreshKey: v.optional(v.string()) },
  returns: evaluation,
  handler: async (ctx, args) => {
    await requireWorkspacePermission(ctx, { workspaceId: args.workspaceId, permission: "workspace:read" });
    const now = Date.now();
    return runRecovery(() => evaluateWorkspace(recoveryReadStore(ctx, args.workspaceId), {
      now, month: args.month ?? currentRecoveryMonth(now),
    }));
  },
});

export const activatePlan = action({
  args: activateArgs, returns: activateResult,
  handler: async (ctx, args): Promise<Infer<typeof activateResult>> => {
    const session = await verifyCurrentSession(ctx.auth);
    return ctx.runMutation(internal.savingsRecoveryWrites.activatePlan, { ...args, session });
  },
});

export const recordContribution = action({
  args: contributeArgs, returns: contributeResult,
  handler: async (ctx, args): Promise<Infer<typeof contributeResult>> => {
    const session = await verifyCurrentSession(ctx.auth);
    return ctx.runMutation(internal.savingsRecoveryWrites.recordContribution, { ...args, session });
  },
});
