import type { MutationCtx, QueryCtx } from "./_generated/server";
import { BudgetError } from "../src/budget/errors";
import { budgetPolicy } from "../src/budget/types";
import type { BudgetReads, BudgetStore } from "../src/budget/types";

export function budgetReads(db: QueryCtx["db"]): BudgetReads {
  return {
    async getBudget(id) {
      const normalized = db.normalizeId("budgets", id);
      const doc = normalized && await db.get(normalized);
      if (!doc) return undefined;
      const { _id, _creationTime, ...fields } = doc;
      return { id: _id, ...fields };
    },
    async getVersion(id, revision) {
      const normalized = db.normalizeId("budgets", id);
      if (!normalized) return undefined;
      const version = await db.query("budgetVersions").withIndex("by_budget_revision", q => q.eq("budgetId", normalized).eq("revision", revision)).unique();
      return version?.budget;
    },
    async listBudgets(workspaceId) {
      const docs = await db.query("budgets").withIndex("by_workspace", q => q.eq("workspaceId", workspaceId)).take(budgetPolicy.maxWorkspaceBudgets + 1);
      if (docs.length > budgetPolicy.maxWorkspaceBudgets) throw new BudgetError("budget_workspace_limit");
      return docs.map(({ _id, _creationTime, ...fields }) => ({ id: _id, ...fields })).sort((a, b) => a.id.localeCompare(b.id));
    },
    async getReceipt(workspaceId, key) {
      const doc = await db.query("budgetReceipts").withIndex("by_workspace_key", q => q.eq("workspaceId", workspaceId).eq("idempotencyKey", key)).unique();
      if (!doc) return undefined;
      const { _id, _creationTime, ...receipt } = doc;
      return receipt;
    },
  };
}
export function budgetStore(db: MutationCtx["db"]): BudgetStore {
  function idFor(id: string) {
    const normalized = db.normalizeId("budgets", id);
    if (!normalized) throw new BudgetError("budget_not_found");
    return normalized;
  }
  return {
    ...budgetReads(db),
    async insertBudget(fields) { const id = await db.insert("budgets", fields); return { id, ...fields }; },
    async saveBudget(budget) { const { id, ...fields } = budget; await db.replace(idFor(id), fields); },
    async appendVersion(budget) { await db.insert("budgetVersions", { budgetId: idFor(budget.id), revision: budget.revision, budget }); },
    async saveReceipt(receipt) { await db.insert("budgetReceipts", receipt); },
  };
}
