import type { MutationCtx, QueryCtx } from "./_generated/server";
import { BudgetError } from "../src/budget/errors";
import { budgetPolicy } from "../src/budget/types";
import type { BudgetReads, BudgetStore } from "../src/budget/types";
import { planningDocuments, requirePlanningReadHeadroom } from "./planningReadCapacity";

export function budgetReads({ db, meta }: Pick<QueryCtx, "db" | "meta">): BudgetReads {
  return {
    async getBudget(id) {
      const normalized = db.normalizeId("budgets", id);
      await requirePlanningReadHeadroom(meta);
      const doc = normalized && await db.get(normalized);
      await requirePlanningReadHeadroom(meta);
      if (!doc) return undefined;
      const { _id, _creationTime, ...fields } = doc;
      return { id: _id, ...fields };
    },
    async getVersion(id, revision) {
      const normalized = db.normalizeId("budgets", id);
      if (!normalized) return undefined;
      await requirePlanningReadHeadroom(meta);
      const version = await db.query("budgetVersions").withIndex("by_budget_revision", q => q.eq("budgetId", normalized).eq("revision", revision)).unique();
      await requirePlanningReadHeadroom(meta);
      return version?.budget;
    },
    async listBudgets(workspaceId) {
      const docs = await planningDocuments(meta, db.query("budgets").withIndex("by_workspace", q => q.eq("workspaceId", workspaceId)), budgetPolicy.maxWorkspaceBudgets + 1);
      if (docs.length > budgetPolicy.maxWorkspaceBudgets) throw new BudgetError("budget_workspace_limit");
      return docs.map(({ _id, _creationTime, ...fields }) => ({ id: _id, ...fields })).sort((a, b) => a.id.localeCompare(b.id));
    },
    async getReceipt(workspaceId, key) {
      await requirePlanningReadHeadroom(meta);
      const doc = await db.query("budgetReceipts").withIndex("by_workspace_key", q => q.eq("workspaceId", workspaceId).eq("idempotencyKey", key)).unique();
      await requirePlanningReadHeadroom(meta);
      if (!doc) return undefined;
      const { _id, _creationTime, ...receipt } = doc;
      return receipt;
    },
  };
}
export function budgetStore(ctx: Pick<MutationCtx, "db" | "meta">): BudgetStore {
  const { db } = ctx;
  function idFor(id: string) {
    const normalized = db.normalizeId("budgets", id);
    if (!normalized) throw new BudgetError("budget_not_found");
    return normalized;
  }
  return {
    ...budgetReads(ctx),
    async insertBudget(fields) { const id = await db.insert("budgets", fields); return { id, ...fields }; },
    async saveBudget(budget) { const { id, ...fields } = budget; await db.replace(idFor(id), fields); },
    async appendVersion(budget) { await db.insert("budgetVersions", { budgetId: idFor(budget.id), revision: budget.revision, budget }); },
    async saveReceipt(receipt) { await db.insert("budgetReceipts", receipt); },
  };
}
