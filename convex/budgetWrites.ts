import { internalMutation } from "./_generated/server";
import { requireSubmission } from "./lib/deviceAuthorization";
import { liveSession } from "./lib/securityValues";
import { changeCategoryLimit, setCategoryLimit as setLimit } from "../src/budget/setCategoryLimit";
import { budgetWriteStore } from "./budgetStore";
import { runBudget } from "./budgetErrors";
import { limitTargetArgs, setLimitArgs, setLimitResult } from "./budgetValues";

export const setCategoryLimit = internalMutation({
  args: { ...setLimitArgs, session: liveSession }, returns: setLimitResult,
  handler: async (ctx, { session, ...args }) => {
    const actor = await requireSubmission(ctx, { session, workspaceId: args.workspaceId, permission: "workspace:admin" });
    return runBudget(() => setLimit(budgetWriteStore(ctx, args.workspaceId, actor), { ...args, actorId: actor.userId, now: Date.now() }));
  },
});

export const setCategorySpendNothing = internalMutation({
  args: { ...limitTargetArgs, session: liveSession }, returns: setLimitResult,
  handler: async (ctx, { session, ...args }) => {
    const actor = await requireSubmission(ctx, { session, workspaceId: args.workspaceId, permission: "workspace:admin" });
    return runBudget(() => changeCategoryLimit(budgetWriteStore(ctx, args.workspaceId, actor), {
      ...args, change: { kind: "spendNothing" }, actorId: actor.userId, now: Date.now(),
    }));
  },
});

export const removeCategoryLimit = internalMutation({
  args: { ...limitTargetArgs, session: liveSession }, returns: setLimitResult,
  handler: async (ctx, { session, ...args }) => {
    const actor = await requireSubmission(ctx, { session, workspaceId: args.workspaceId, permission: "workspace:admin" });
    return runBudget(() => changeCategoryLimit(budgetWriteStore(ctx, args.workspaceId, actor), {
      ...args, change: { kind: "remove" }, actorId: actor.userId, now: Date.now(),
    }));
  },
});
