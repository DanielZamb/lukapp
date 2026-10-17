import { ConvexError } from "convex/values";
import { createAccountingCore } from "../src/accounting";
import { requireFunctionalCurrencyCode } from "../src/accounting/money";
import { recordOpeningPosition } from "../src/accounting/commands/recordOpeningPosition";
import type { Actor } from "../src/accounting";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { convexReadStore, convexStore } from "./store";

export async function readPersonalDefaults(ctx: QueryCtx, actor: Actor) {
  const defaults = await ctx.db
    .query("personalDefaults")
    .withIndex("by_owner", (q) => q.eq("ownerSubject", actor.userId))
    .unique();
  if (!defaults) return null;
  const core = createAccountingCore(convexReadStore(ctx.db));
  const workspace = await core.openWorkspace({
    actor,
    workspaceId: defaults.workspaceId,
  });
  const profiles = await core.listFinancialAccountProfiles({
    actor,
    workspaceId: workspace.id,
  });
  const financialAccountProfile = profiles.find(
    (p) => p.id === defaults.financialAccountProfileId,
  );
  if (!financialAccountProfile)
    throw new ConvexError({ code: "defaults_unavailable" });
  return { workspace, financialAccountProfile };
}

export async function ensurePersonalDefaults(
  ctx: MutationCtx,
  actor: Actor,
  args: { functionalCurrency: string; startingMinorUnits: number },
) {
  requireFunctionalCurrencyCode(args.functionalCurrency);
  if (
    !Number.isSafeInteger(args.startingMinorUnits) ||
    args.startingMinorUnits < 0
  ) {
    throw new ConvexError({ code: "starting_amount_invalid" });
  }
  const existing = await readPersonalDefaults(ctx, actor);
  if (existing) {
    const defaults = await ctx.db
      .query("personalDefaults")
      .withIndex("by_owner", (q) => q.eq("ownerSubject", actor.userId))
      .unique();
    if (
      existing.workspace.functionalCurrency !== args.functionalCurrency ||
      defaults?.startingMinorUnits !== args.startingMinorUnits
    ) {
      throw new ConvexError({
        code: "setup_conflict",
        message: "First setup already completed with different answers",
      });
    }
    return existing;
  }
  const store = convexStore(ctx.db);
  const clock = { now: () => new Date() };
  const core = createAccountingCore(store, clock);
  const workspace = await core.createPersonalWorkspace({
    actor,
    functionalCurrency: args.functionalCurrency,
  });
  const financialAccountProfile = await core.createFinancialAccountProfile({
    actor,
    workspaceId: workspace.id,
    name: "My money",
    productKind: "cash",
  });
  if (args.startingMinorUnits > 0) {
    await recordOpeningPosition(store, clock, {
      actor,
      workspaceId: workspace.id,
      financialAccountProfileId: financialAccountProfile.id,
      amount: {
        currency: workspace.functionalCurrency,
        minorUnits: args.startingMinorUnits,
      },
      accountingDate: clock.now().toISOString().slice(0, 10),
      description: "Starting amount",
      idempotencyKey: "personal-defaults-opening@1",
    });
  }
  const workspaceId = ctx.db.normalizeId("workspaces", workspace.id);
  const profileId = ctx.db.normalizeId(
    "financialAccountProfiles",
    financialAccountProfile.id,
  );
  if (!workspaceId || !profileId) throw new Error("Core returned invalid IDs");
  await ctx.db.insert("personalDefaults", {
    ownerSubject: actor.userId,
    workspaceId,
    financialAccountProfileId: profileId,
    startingMinorUnits: args.startingMinorUnits,
  });
  return { workspace, financialAccountProfile };
}
