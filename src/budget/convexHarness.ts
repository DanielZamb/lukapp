import { expect, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { convexAccounting, createDaily, groceries, owner, septNow } from "../accounting/convexHarness";
import type { AccountingTest } from "../accounting/convexHarness";
import type { CreateBudgetInput, UpdateBudgetInput, RetireBudgetInput } from "./types";

export async function ledgerBytes(t: AccountingTest) {
  return t.run(async ctx => JSON.stringify({
    workspaces: await ctx.db.query("workspaces").collect(),
    memberships: await ctx.db.query("workspaceMemberships").collect(),
    entries: await ctx.db.query("journalEntries").collect(),
    lines: await ctx.db.query("journalLines").collect(),
    effects: await ctx.db.query("journalSourceEffects").collect(),
    accounts: await ctx.db.query("ledgerAccounts").collect(),
    profiles: await ctx.db.query("financialAccountProfiles").collect(),
    openings: await ctx.db.query("openingPositions").collect(),
    periods: await ctx.db.query("accountingPeriods").collect(),
    decisions: await ctx.db.query("periodControlDecisions").collect(),
    categories: await ctx.db.query("userCategories").collect(),
    categoryReceipts: await ctx.db.query("categoryReceipts").collect(),
  }));
}
export async function planningOnly<T>(t: AccountingTest, run: () => Promise<T>): Promise<T> {
  const before = await ledgerBytes(t);
  try { return await run(); }
  finally { expect(await ledgerBytes(t)).toBe(before); }
}
export async function budgetFixture(modules: Record<string, () => Promise<unknown>>, household = false, template = "co-puc-personal@1") {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.UTC(2026, 9, 13, 12));
  const t = convexAccounting(modules);
  const common = { functionalCurrency: "COP", chartOfAccountsTemplate: template, now: septNow };
  const workspace = household
    ? await t.mutation(api.accounting.createHouseholdWorkspace, { ...common, idempotencyKey: "house" })
    : await t.mutation(api.accounting.createPersonalWorkspace, common);
  const profile = await createDaily(t, workspace.id);
  const created = await t.mutation(api.accounting.createUserCategory, { workspaceId: workspace.id,
    name: "Mercado", selection: { kind: "preset", concept: "groceries" }, idempotencyKey: "category" });
  if (created.kind !== "category") throw new Error("Category expected");
  const category = created.category;
  async function spend(amount: number, accountingDate: string, idempotencyKey: string, override?: string) {
    return t.mutation(api.accounting.recordCashExpense, {
      ...groceries(workspace.id, profile.id, { amount, accountingDate, idempotencyKey }), userCategoryId: category.id,
      ...(override ? { ledgerAccountCode: override } : {}),
    });
  }
  return { t, workspace, profile, category, spend };
}
export type BudgetFixture = Awaited<ReturnType<typeof budgetFixture>>;
export function createRule(f: BudgetFixture, overrides: Partial<Omit<CreateBudgetInput, "actor" | "workspaceId">> = {}) {
  return planningOnly(f.t, () => f.t.mutation(api.budget.createBudget, {
    workspaceId: f.workspace.id, name: "Monthly spending", startMonth: { year: 2026, month: 9 },
    target: { kind: "totalExpense" }, cardinality: "singleStanding", rollover: { kind: "none" },
    limit: { currency: "COP", minorUnits: 100 }, idempotencyKey: "budget", ...overrides,
  }));
}
export function updateRule(f: BudgetFixture, input: Omit<UpdateBudgetInput, "actor" | "workspaceId">) {
  return planningOnly(f.t, () => f.t.mutation(api.budget.updateBudget, { ...input, workspaceId: f.workspace.id }));
}
export function retireRule(f: BudgetFixture, input: Omit<RetireBudgetInput, "actor" | "workspaceId">) {
  return planningOnly(f.t, () => f.t.mutation(api.budget.retireBudget, { ...input, workspaceId: f.workspace.id }));
}
export async function evaluate(f: BudgetFixture, month: number, year = 2026, selection?: { kind: "revision"; budgetId: string; revision: number }) {
  return planningOnly(f.t, () => f.t.query(api.budget.evaluateBudgets, { workspaceId: f.workspace.id, month: { year, month }, ...(selection ? { selection } : {}) }));
}
export async function membership(f: BudgetFixture, role: "Owner" | "Accountant" | "Preparer" | "Viewer" | null) {
  await f.t.run(async ctx => {
    const workspaceId = ctx.db.normalizeId("workspaces", f.workspace.id);
    if (!workspaceId) throw new Error("Workspace expected");
    const current = await ctx.db.query("workspaceMemberships").withIndex("by_workspace_user", q =>
      q.eq("workspaceId", workspaceId).eq("userId", owner.userId)).unique();
    if (!current) throw new Error("Membership expected");
    if (role === null) await ctx.db.delete(current._id);
    else await ctx.db.patch(current._id, { role });
  });
}
