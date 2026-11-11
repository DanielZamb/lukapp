import { endingBlockers } from "./accountingEndingChecks";
import { AccountingError } from "../src/accounting/errors";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Actor } from "../src/accounting/types";
import { unfinishedDestinationPlans } from "../src/savingsRecovery/unfinishedDestinationPlans";
import { recoveryReadStore } from "./savingsRecoveryStore";
import { changeWorkspaceSetting } from "./personalDefaults";

export function placeClosureServices(ctx: QueryCtx, actor: Actor, workspaceId: string) {
  async function defaultPlace() {
    const id = ctx.db.normalizeId("workspaces", workspaceId);
    const workspace = id && await ctx.db.get(id);
    const defaults = await ctx.db.query("personalDefaults").withIndex("by_owner", q => q.eq("ownerSubject", actor.userId)).unique();
    return workspace?.defaultFinancialAccountProfileId
      ?? (defaults?.workspaceId === workspaceId ? defaults.financialAccountProfileId : undefined);
  }
  return {
    defaultPlace,
    endingBlockers: (profileId: string, today: string) => endingBlockers(ctx, workspaceId, profileId, today),
    unfinishedDestinationPlans: (profileId: string) => unfinishedDestinationPlans(recoveryReadStore(ctx, workspaceId, true), profileId),
  };
}

export function placeClosingServices(ctx: MutationCtx, actor: Actor, workspaceId: string) {
  const services = placeClosureServices(ctx, actor, workspaceId);
  return { ...services, replaceDefault: async (profileId: string, key: string) => {
    const workspace = ctx.db.normalizeId("workspaces", workspaceId);
    if (!workspace) throw new AccountingError("workspace_membership_required");
    const prior = await ctx.db.query("workspaceSettingChanges").withIndex("by_workspace_request", q => q.eq("workspaceId", workspace).eq("idempotencyKey", key)).unique();
    if (prior) throw new AccountingError("idempotency_key_conflict");
    const current = await services.defaultPlace();
    if (!current) throw new Error("Default Place missing");
    await changeWorkspaceSetting(ctx, actor, { workspaceId, setting: "defaultPlace", value: profileId,
      expectedValue: current, idempotencyKey: key });
  } };
}
