import type { Infer } from "convex/values";
import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { OwnerContext } from "./owner";
import { firstRunArgs } from "../onboardingValidators";
import { createAccountingCore } from "../../src/accounting/core";
import { convexReadStore, convexStore } from "../store";
import { dateFromTimestamp } from "../../src/accounting/period";
import { bootstrapPersonalWorkspace, personalWorkspaceLink, requirePersonalWorkspaceOwner } from "./personalWorkspace";
import { canonicalJson } from "../../src/access/protocol";
import { normalizeCategoryName } from "../../src/accounting/categoryPolicy";
import { AccountingError } from "../../src/accounting/errors";
import { v } from "convex/values";

const argsValidator = v.object(firstRunArgs);
type FirstRunArgs = Infer<typeof argsValidator>;

export async function finishFirstRun(ctx: MutationCtx & OwnerContext, args: FirstRunArgs) {
  if (args.categories.length > 40 || new Set(args.categories.map(c => normalizeCategoryName(c.name))).size !== args.categories.length) {
    throw new ConvexError({ code: "first_run_categories_invalid" });
  }
  const core = createAccountingCore(convexStore(ctx.db), { now: () => dateFromTimestamp(args.now) });
  const workspace = await bootstrapPersonalWorkspace(ctx, args, core);
  const request = canonicalJson(args);
  const prior = await ctx.db.query("firstRunCompletions").withIndex("by_identity", q => q.eq("tokenIdentifier", ctx.actor.userId)).unique();
  if (prior) {
    if (prior.request !== request) throw new AccountingError("idempotency_key_conflict");
    return { ...prior.result, replay: true };
  }
  if ((await core.listFinancialAccountProfiles({ workspaceId: workspace.id, actor: ctx.actor })).length) {
    throw new ConvexError({ code: "first_run_already_completed" });
  }
  const categories = [];
  for (const [index, selected] of args.categories.entries()) {
    const created = await core.createUserCategory({
      ...selected, workspaceId: workspace.id, actor: ctx.actor, idempotencyKey: "first-run@1:category:" + index,
    });
    if (created.kind !== "category" || created.category.classification.kind !== "resolved" || created.category.classification.nature !== "Expense") {
      throw new ConvexError({ code: "first_run_spend_category_required" });
    }
    categories.push(created.category);
  }
  const opening = await core.setupFinancialAccount({
    workspaceId: workspace.id, actor: ctx.actor, name: "My money", productKind: "cash",
    amount: { currency: workspace.functionalCurrency, minorUnits: args.startingAmountMinorUnits },
    accountingDate: args.accountingDate, description: "Start tracking", idempotencyKey: "first-run@1:my-money",
  });
  const result = { workspace, categories, opening, purchaseNotifications: args.purchaseNotifications, replay: false };
  await ctx.db.insert("firstRunCompletions", { tokenIdentifier: ctx.actor.userId, request, result });
  return result;
}

export async function firstRunState(ctx: QueryCtx & OwnerContext, now: number) {
  const link = await personalWorkspaceLink(ctx, ctx.actor.userId);
  if (!link) return { kind: "required" } as const;
  await requirePersonalWorkspaceOwner(ctx, link.workspaceId, ctx.actor.userId);
  const core = createAccountingCore(convexReadStore(ctx.db));
  const workspace = await core.openWorkspace({ workspaceId: link.workspaceId, actor: ctx.actor, now });
  const receipt = await ctx.db.query("firstRunCompletions").withIndex("by_identity", q => q.eq("tokenIdentifier", ctx.actor.userId)).unique();
  if (receipt) return { kind: "complete", workspace, profile: receipt.result.opening.profile, purchaseNotifications: receipt.result.purchaseNotifications } as const;
  const profiles = await core.listFinancialAccountProfiles({ workspaceId: workspace.id, actor: ctx.actor });
  return profiles.length ? { kind: "existing", workspace } as const : { kind: "required" } as const;
}
