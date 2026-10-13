import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { OwnerContext } from "./owner";
import type { createAccountingCore } from "../../src/accounting/core";
import { convexReadStore } from "../store";
import { requireWorkspace } from "../../src/accounting/membership";
import { AccountingError } from "../../src/accounting/errors";

export function personalWorkspaceLink(
  ctx: Pick<QueryCtx, "db">,
  tokenIdentifier: string,
) {
  return ctx.db
    .query("personalWorkspaceOwners")
    .withIndex("by_identity", (q) => q.eq("tokenIdentifier", tokenIdentifier))
    .unique();
}

export async function requirePersonalWorkspaceOwner(
  ctx: Pick<QueryCtx, "db">,
  workspaceId: Id<"workspaces">,
  userId: string,
) {
  await requireWorkspace(
    convexReadStore(ctx.db),
    workspaceId,
    { userId },
    "administerMembership",
  );
}

export async function bootstrapPersonalWorkspace(
  ctx: MutationCtx & OwnerContext,
  args: {
    functionalCurrency: string;
    chartOfAccountsTemplate?: string;
    now: number;
  },
  core: ReturnType<typeof createAccountingCore>,
) {
  const linked = await personalWorkspaceLink(ctx, ctx.actor.userId);
  if (linked) {
    await requirePersonalWorkspaceOwner(
      ctx,
      linked.workspaceId,
      ctx.actor.userId,
    );
    const workspace = await core.openWorkspace({
      actor: ctx.actor,
      workspaceId: linked.workspaceId,
      now: args.now,
    });
    if (
      workspace.functionalCurrency !== args.functionalCurrency ||
      (args.chartOfAccountsTemplate &&
        workspace.chartOfAccountsTemplate !== args.chartOfAccountsTemplate)
    ) {
      throw new AccountingError("personal_workspace_configuration_conflict");
    }
    return workspace;
  }
  const created = await core.createPersonalWorkspace({
    actor: ctx.actor,
    functionalCurrency: args.functionalCurrency,
    ...(args.chartOfAccountsTemplate
      ? { chartOfAccountsTemplate: args.chartOfAccountsTemplate }
      : {}),
  });
  const workspaceId = ctx.db.normalizeId("workspaces", created.id);
  if (!workspaceId) throw new Error("Workspace store returned an invalid id");
  await ctx.db.insert("personalWorkspaceOwners", {
    ...ctx.identity,
    workspaceId,
  });
  return created;
}
