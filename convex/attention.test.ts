import { expect, test } from "vitest";
import { budgetAttention } from "../apps/mobile/src/features/attention/model";
import { accountingFixture, groceries } from "../src/accounting/convexHarness";
import { api } from "./_generated/api";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);

test("Alerts and Home follow posted Convex spending, category limits, reversals, and the selected month", async () => {
  const { t } = await accountingFixture(modules);
  const { workspace, financialAccountProfile } = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP", startingMinorUnits: 0, timeZone: "America/Bogota",
  });
  const workspaceId = workspace.id;
  const category = async (name: string, emoji: string) => {
    const result = await t.action(api.accounting.createUserCategory, {
      workspaceId, selection: { kind: "custom", name, answer: "spend", style: { emoji, tone: "primary" } },
    });
    if (result.kind !== "category") throw new Error("Expected category");
    return result.category.id;
  };
  const food = await category("Food", "🍋");
  const travel = await category("Travel", "🚕");
  const unlimited = await category("Unlimited", "🏷️");
  const read = async (month = "2026-09") => budgetAttention(await t.query(api.budget.evaluate, { workspaceId, month }));
  expect(await read()).toEqual({ rows: [], home: null, bellLabel: "Alerts, nothing needs attention" });
  for (const categoryId of [food, travel]) {
    await t.action(api.budget.setCategoryLimit, {
      workspaceId, categoryId, effectiveMonth: "2026-09", limit: { currency: "COP", minorUnits: 100_000 },
      expectedRevisionId: null, idempotencyKey: `limit-${categoryId}`,
    });
  }
  expect(await read()).toEqual({ rows: [], home: null, bellLabel: "Alerts, nothing needs attention" });
  const expense = { ...groceries(workspaceId, financialAccountProfile.id), userCategoryIds: [food] };
  const foodEntry = await t.action(api.accounting.recordCashExpense, expense);
  expect(await read()).toEqual({
    rows: [{ id: food, title: "🍋  Food is over", detail: "COP 1.500 of COP 1.000",
      destination: { pathname: "/category-look", params: { categoryId: food } } }],
    home: { title: "Food is over its limit", detail: "COP 500 over" },
    bellLabel: "Alerts, 1 over the limit",
  });
  const travelEntry = await t.action(api.accounting.recordCashExpense, {
    ...expense, userCategoryIds: [travel], amount: { currency: "COP", minorUnits: 250_000 }, idempotencyKey: "travel-expense",
  });
  await t.action(api.accounting.recordCashExpense, {
    ...expense, userCategoryIds: [unlimited], amount: { currency: "COP", minorUnits: 900_000 }, idempotencyKey: "unlimited-expense",
  });
  expect(await read()).toEqual({
    rows: [
      { id: travel, title: "🚕  Travel is over", detail: "COP 2.500 of COP 1.000",
        destination: { pathname: "/category-look", params: { categoryId: travel } } },
      { id: food, title: "🍋  Food is over", detail: "COP 1.500 of COP 1.000",
        destination: { pathname: "/category-look", params: { categoryId: food } } },
    ],
    home: { title: "2 categories are over their limits", detail: "COP 2.000 over in total" },
    bellLabel: "Alerts, 2 over the limit",
  });
  expect(await read("2026-10")).toEqual({ rows: [], home: null, bellLabel: "Alerts, nothing needs attention" });
  await t.action(api.accounting.reversePostedEntry, {
    workspaceId, journalEntryId: travelEntry.id, idempotencyKey: "reverse-travel",
  });
  expect(await read()).toMatchObject({ rows: [{ id: food }], home: { detail: "COP 500 over" }, bellLabel: "Alerts, 1 over the limit" });
  await t.action(api.accounting.reversePostedEntry, {
    workspaceId, journalEntryId: foodEntry.id, idempotencyKey: "reverse-food",
  });
  expect(await read()).toEqual({ rows: [], home: null, bellLabel: "Alerts, nothing needs attention" });
});
