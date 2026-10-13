import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { convexAccounting, caught, septNow } from "../src/accounting/convexHarness";
import { categoryPresets } from "../src/accounting/categoryPolicy";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
afterEach(() => vi.unstubAllEnvs());
const request = {
  functionalCurrency: "COP", purchaseNotifications: false,
  categories: categoryPresets.filter(p => p.nature === "Expense").slice(0, 10).map(p => ({
    name: p.concept, selection: { kind: "preset" as const, concept: p.concept },
  })),
  startingAmountMinorUnits: 1000000, accountingDate: "2026-09-24", now: septNow,
};

test("four-answer setup atomically seeds real categories and opening, retries and first Expense read literal Posted balance", async () => {
  const t = convexAccounting(modules);
  expect(await t.query(api.accounting.firstRunStatus, { now: septNow })).toEqual({ kind: "required" });
  const first = await t.mutation(api.accounting.completeFirstRun, request);
  const again = await t.mutation(api.accounting.completeFirstRun, request);
  expect(first.replay).toBe(false);
  expect(again).toEqual({ ...first, replay: true });
  expect(first.categories).toHaveLength(10);
  expect(first.opening.profile.name).toBe("My money");
  expect(first.opening.journalEntry?.lines.map(l => [l.debitMinorUnits, l.creditMinorUnits])).toEqual([[1000000, 0], [0, 1000000]]);
  expect(await t.query(api.accounting.firstRunStatus, { now: septNow })).toMatchObject({
    kind: "complete", purchaseNotifications: false, profile: { id: first.opening.profile.id },
  });
  const expense = {
    workspaceId: first.workspace.id, financialAccountProfileId: first.opening.profile.id,
    amount: { currency: "COP", minorUnits: 125000 }, accountingDate: "2026-09-24",
    description: "Lunch", idempotencyKey: "local-expense-1",
  };
  const posted = await t.mutation(api.accounting.recordCashExpense, expense);
  expect((await t.mutation(api.accounting.recordCashExpense, expense)).id).toBe(posted.id);
  expect(await t.query(api.accounting.balances, { workspaceId: first.workspace.id })).toMatchObject([
    { financialAccountProfileId: first.opening.profile.id, balance: { currency: "COP", minorUnits: 875000 } },
  ]);
  expect(await t.query(api.accounting.listJournalEntries, { workspaceId: first.workspace.id })).toHaveLength(2);
  expect(await t.query(api.accounting.listUserCategories, { workspaceId: first.workspace.id })).toHaveLength(10);
  expect(await caught(t.mutation(api.accounting.completeFirstRun, { ...request, purchaseNotifications: true }))).toMatchObject({ data: { code: "idempotency_key_conflict" } });
});

test("zero opening posts nothing and custom answered spend uses canonical C02 policy", async () => {
  const t = convexAccounting(modules);
  const result = await t.mutation(api.accounting.completeFirstRun, {
    ...request, startingAmountMinorUnits: 0,
    categories: [...request.categories, { name: "My hobby", selection: { kind: "custom", answer: "Expense", confirmation: "answered" } }],
  });
  expect(result.opening.journalEntry).toBeNull();
  expect(result.categories.at(-1)).toMatchObject({ classification: { kind: "resolved", nature: "Expense", account: { kind: "fallback" } } });
  expect(await t.query(api.accounting.listJournalEntries, { workspaceId: result.workspace.id })).toEqual([]);
});

test("late opening failure rolls back Workspace, categories, completion and proof consumption", async () => {
  const t = convexAccounting(modules);
  expect(await caught(t.mutation(api.accounting.completeFirstRun, { ...request, startingAmountMinorUnits: -1 }))).toMatchObject({ data: { code: "opening_amount_invalid" } });
  expect(await t.run(async ctx => ({
    workspaces: await ctx.db.query("workspaces").collect(),
    categories: await ctx.db.query("userCategories").collect(),
    completions: await ctx.db.query("firstRunCompletions").collect(),
    entries: await ctx.db.query("journalEntries").collect(),
  }))).toEqual({ workspaces: [], categories: [], completions: [], entries: [] });
  expect((await t.mutation(api.accounting.completeFirstRun, request)).opening.journalEntry).not.toBeNull();
});
