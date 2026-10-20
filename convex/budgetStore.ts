import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { Actor } from "../src/accounting/types";
import type { BudgetReadStore, BudgetRevision, BudgetWriteStore } from "../src/budget/types";
import { BudgetError } from "../src/budget/policy";
import { workspaceTimeZone } from "../src/accounting/timeZone";
import { categoryTotals } from "../src/accounting/queries/categoryTotals";
import { convexReadStore } from "./store";

function revisionView({ _id, _creationTime, ...revision }: Doc<"budgetLimitRevisions">): BudgetRevision {
  return { id: _id, ...revision };
}

export function budgetReadStore(ctx: Pick<QueryCtx, "db">, workspaceId: string, actor: Actor): BudgetReadStore {
  const id = ctx.db.normalizeId("workspaces", workspaceId);
  if (!id) throw new BudgetError("workspace_not_found");
  const accounting = convexReadStore(ctx.db);
  return {
    functionalCurrency: async () => {
      const workspace = await ctx.db.get(id);
      if (!workspace) throw new BudgetError("workspace_not_found");
      return workspace.functionalCurrency;
    },
    timeZone: async () => {
      const workspace = await ctx.db.get(id);
      if (!workspace) throw new BudgetError("workspace_not_found");
      return workspaceTimeZone(workspace);
    },
    listRevisions: async () => (await ctx.db.query("budgetLimitRevisions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", id)).collect()).map(revisionView),
    listCategories: async () => (await accounting.listCategories(workspaceId))
      .filter((category) => category.deletedAt === undefined)
      .map((category) => ({ id: category.id, name: category.name, emoji: category.style.emoji, nature: category.nature })),
    categoryConsumption: (month) => categoryTotals(accounting, { actor, workspaceId, month }),
  };
}

export function budgetWriteStore(ctx: Pick<MutationCtx, "db">, workspaceId: string, actor: Actor): BudgetWriteStore {
  const read = budgetReadStore(ctx, workspaceId, actor);
  const id = ctx.db.normalizeId("workspaces", workspaceId);
  if (!id) throw new BudgetError("workspace_not_found");
  return {
    ...read,
    findRequest: async (key) => {
      const revision = await ctx.db.query("budgetLimitRevisions")
        .withIndex("by_workspace_request", (q) => q.eq("workspaceId", id).eq("idempotencyKey", key)).unique();
      return revision ? revisionView(revision) : null;
    },
    insertRevision: async (revision) => {
      const categoryId = ctx.db.normalizeId("userCategories", revision.categoryId);
      if (!categoryId) throw new BudgetError("category_not_found");
      const revisionId = await ctx.db.insert("budgetLimitRevisions", { ...revision, workspaceId: id, categoryId });
      return { ...revision, id: revisionId };
    },
  };
}
