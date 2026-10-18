import { expect, test } from "vitest";
import { postingBudgetImpact } from "./postingImpact";

test("each selected jar counts the full expense, but only new crossings warn", () => {
  const jars = [
    { id: "food", spent: 80000 },
    { id: "home", spent: 100000 },
    { id: "already-over", spent: 100001 },
    { id: "exactly", spent: 70000 },
    { id: "unselected", spent: 99000 },
  ].map(({ id, spent }) => ({
    category: { id, name: id, emoji: "" },
    limitMinorUnits: 100000,
    consumptionMinorUnits: spent,
  }));
  expect(postingBudgetImpact({
    jars, categoryIds: ["food", "home", "already-over", "exactly", "no-jar"], expenseMinorUnits: 30000,
  })).toEqual([
    { category: { id: "food", name: "food", emoji: "" }, overMinorUnits: 10000 },
    { category: { id: "home", name: "home", emoji: "" }, overMinorUnits: 30000 },
  ]);
  expect(postingBudgetImpact({ jars, categoryIds: ["food"], expenseMinorUnits: 20000 })).toEqual([]);
});

test("a net reversal leaves extra room before a crossing", () => {
  const jars = [{ category: { id: "food", name: "Food", emoji: "" }, limitMinorUnits: 100000, consumptionMinorUnits: -50000 }];
  expect(postingBudgetImpact({ jars, categoryIds: ["food"], expenseMinorUnits: 150000 })).toEqual([]);
  expect(postingBudgetImpact({ jars, categoryIds: ["food"], expenseMinorUnits: 150001 })).toEqual([
    { category: { id: "food", name: "Food", emoji: "" }, overMinorUnits: 1 },
  ]);
});

test("batch expenses accumulate per accounting month and warn once with the final overage", async () => {
  const { batchPostingBudgetImpact } = await import("./postingImpact");
  const expense = (month: string, amount: number, categoryIds = ["food"]) => ({
    kind: "expense" as const,
    payload: {
      workspaceId: "workspace", financialAccountProfileId: "cash",
      accountingDate: `${month}-17`, description: "Food", idempotencyKey: `${month}-${amount}`,
      amount: { currency: "COP" as const, minorUnits: amount }, userCategoryIds: categoryIds,
    },
  });
  const evaluated: string[] = [];
  const hits = await batchPostingBudgetImpact([
    expense("2026-10", 15000), expense("2026-11", 30000),
    expense("2026-10", 10000), expense("2026-10", 5000),
    { ...expense("2026-10", 999999), kind: "income" },
    expense("2026-12", 30000, ["already-over"]),
  ], async ({ month }) => {
    evaluated.push(month);
    return { jars: [
      { category: { id: "food", name: "Food", emoji: "" }, limitMinorUnits: 100000, consumptionMinorUnits: month === "2026-11" ? 70000 : 80000 },
      { category: { id: "already-over", name: "Over", emoji: "" }, limitMinorUnits: 100000, consumptionMinorUnits: 100001 },
    ] };
  });
  expect(evaluated.sort()).toEqual(["2026-10", "2026-11", "2026-12"]);
  expect(hits).toEqual([{ category: { id: "food", name: "Food", emoji: "" }, overMinorUnits: 10000 }]);
});
