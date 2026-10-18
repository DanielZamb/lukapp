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
