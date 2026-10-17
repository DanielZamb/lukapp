import { v, type Infer } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { ownerQuery } from "./lib/functions";
import { requireWorkspacePermission } from "./lib/deviceAuthorization";
import { verifyCurrentSession } from "./lib/session";
import { evaluation, setLimitArgs, setLimitResult } from "./budgetValues";
import { budgetReadStore } from "./budgetStore";
import { runBudget } from "./budgetErrors";
import { evaluateMonth } from "../src/budget/evaluateMonth";
import { currentBudgetMonth } from "../src/budget/policy";

export const evaluate = ownerQuery({
  // A new read key also refreshes the clock-dependent currentMonth after a stale sheet closes.
  args: { workspaceId: v.string(), month: v.optional(v.string()), refreshKey: v.optional(v.string()) }, returns: evaluation,
  handler: async (ctx, args) => {
    const actor = await requireWorkspacePermission(ctx, { workspaceId: args.workspaceId, permission: "workspace:read" });
    const now = Date.now();
    const store = budgetReadStore(ctx, args.workspaceId, actor);
    const timeZone = await store.timeZone();
    return runBudget(() => evaluateMonth(store, { month: args.month ?? currentBudgetMonth(now, timeZone), now }));
  },
});

export const setCategoryLimit = action({
  args: setLimitArgs, returns: setLimitResult,
  handler: async (ctx, args): Promise<Infer<typeof setLimitResult>> => {
    const session = await verifyCurrentSession(ctx.auth);
    return ctx.runMutation(internal.budgetWrites.setCategoryLimit, { ...args, session });
  },
});
