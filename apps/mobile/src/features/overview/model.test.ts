import { expect, test } from "vitest";
import { monthOverview, type OverviewCategory } from "./model";

type Input = Parameters<typeof monthOverview>[0];
function category(id: string, nature: "Expense" | "Income" = "Expense"): Input["categories"][number] {
  return {
    id, workspaceId: "workspace", name: id, normalizedName: id, nature, natureSource: "answered",
    classification: { kind: "fallback", version: "test" }, style: { emoji: "🍋", tone: "positive" },
  };
}
function entry(date: string, lines: Input["entries"][number]["lines"]): Input["entries"][number] {
  return {
    id: date, policy: "cash-expense@1", description: "Month activity", accountingDate: date,
    accountingPeriod: { year: 2026, month: Number(date.slice(5, 7)), status: "open" },
    amount: { currency: "COP", minorUnits: 0 }, postedBy: "owner", postedAt: 1, replay: false, lines,
  };
}
function line(nature: Input["entries"][number]["lines"][number]["nature"], debitMinorUnits: number, creditMinorUnits: number,
  ids: string[] = []): Input["entries"][number]["lines"][number] {
  return {
    nature, debitMinorUnits, creditMinorUnits, ledgerAccountId: nature, code: "code", name: nature,
    userCategories: ids.map((id) => ({ id, name: id })),
  };
}
const budget: Input["budget"] = {
  month: "2026-10", currentMonth: "2026-10", currency: "COP", totalsOverlap: true,
  jars: [{ category: { id: "food", name: "food", emoji: "🍋" }, revisionId: "revision", limitMinorUnits: 400000, consumptionMinorUnits: 500000 }],
  availableCategories: [],
};

test("month flow counts each posted line once, keeps reversals, and excludes transfers, openings and other months", () => {
  const entries = [
    entry("2026-10-01", [line("Expense", 700000, 0, ["food", "family"]), line("Asset", 0, 700000)]),
    { ...entry("2026-10-02", [line("Expense", 0, 200000, ["food", "family"]), line("Asset", 200000, 0)]), policy: "reversal@1", reversesEntryId: "original" },
    entry("2026-10-03", [line("Revenue", 0, 1000000, ["salary"]), line("Asset", 1000000, 0)]),
    entry("2026-10-04", [line("Revenue", 50000, 0, ["salary"]), line("Asset", 0, 50000)]),
    entry("2026-10-05", [line("Asset", 9000000, 0), line("Asset", 0, 9000000)]),
    entry("2026-10-06", [line("Asset", 8000000, 0), line("Equity", 0, 8000000)]),
    entry("2026-09-30", [line("Expense", 5000000, 0, ["food"]), line("Revenue", 0, 5000000)]),
    entry("2026-11-01", [line("Expense", 6000000, 0, ["food"])]),
  ] satisfies Input["entries"];
  const result = monthOverview({ month: "2026-10", entries, categories: [category("unused"), category("salary", "Income"), category("food"), category("family")], budget });
  expect(result).toEqual({
    currency: "COP", outMinorUnits: 500000, inMinorUnits: 950000,
    categories: [
      { id: "family", name: "family", style: { emoji: "🍋", tone: "positive" }, spendMinorUnits: 500000, limitMinorUnits: null },
      { id: "food", name: "food", style: { emoji: "🍋", tone: "positive" }, spendMinorUnits: 500000, limitMinorUnits: 400000 },
      { id: "unused", name: "unused", style: { emoji: "🍋", tone: "positive" }, spendMinorUnits: 0, limitMinorUnits: null },
    ] satisfies OverviewCategory[],
  });
});

test("an empty month keeps unused categories and limits at zero spend", () => {
  expect(monthOverview({ month: "2026-11", entries: [], categories: [category("food")], budget })).toEqual({
    currency: "COP", outMinorUnits: 0, inMinorUnits: 0,
    categories: [{ id: "food", name: "food", style: { emoji: "🍋", tone: "positive" }, spendMinorUnits: 0, limitMinorUnits: 400000 }],
  });
});
