import { expect, test } from "vitest";
import { capitalFlow, compactHistoryAmount, historyAmount, historyDate, historyListRow, searchHistory } from "./listModel";
import type { HistoryRow } from "./types";

const row = {
  id: "posted", title: "Weekly market", date: "2025-08-23", detail: "Food · Family",
  financialAccountProfileId: "cash", primaryUserCategoryId: "family", reversed: true,
  userCategories: [{ id: "food", name: "Food" }, { id: "family", name: "Family" }],
  amount: { currency: "COP", minorUnits: -126425 },
} satisfies HistoryRow;
const categories = [{ id: "family", name: "Family", style: { emoji: "🦋", tone: "positive" as const } }];
const places = [{ id: "cash", name: "Daily cash" }];

test("list uses the primary stored emoji, plain place, workspace year, and reversal suffix", () => {
  expect(historyListRow(row, categories, places, "2026-01-01")).toMatchObject({
    subtitle: "August 23, 2025 · 🦋 Family · Daily cash · Reversed", amountLabel: "−$1.264,25",
  });
  expect(historyDate("2025-08-23", "2025-12-31")).toBe("August 23");
  expect(historyListRow({ ...row, userCategories: [], primaryUserCategoryId: undefined, detail: "Income", reversed: false,
    amount: { currency: "USD", minorUnits: 150000 } }, [], places, "2025-12-31")).toMatchObject({
    subtitle: "August 23 · 💸 Income · Daily cash", amountLabel: "+$1.500",
  });
});

test.each(["weekly", "food", "family", " DAILY CASH ", "1264.25", "august 23, 2025", ""])("search matches %j", (query) => {
  const result = searchHistory([historyListRow(row, categories, places, "2026-01-01")], query);
  expect(result.map((item) => item.id)).toEqual(["posted"]);
});

test("search searches an older posting beyond the first 50 and totals only matched rows", () => {
  const rows = Array.from({ length: 101 }, (_, index) => historyListRow({
    ...row, id: String(index), title: index === 100 ? "Older receipt" : "Newer posting",
    amount: { currency: "COP", minorUnits: index === 100 ? -125050 : 10000 },
  }, categories, places, "2026-01-01"));
  const matched = searchHistory(rows, "older receipt");
  expect(matched.map((item) => item.id)).toEqual(["100"]);
  expect(capitalFlow(matched)).toEqual({ out: 125050, inn: 0, net: -125050 });
  expect(capitalFlow(rows)).toEqual({ out: 125050, inn: 1000000, net: 874950 });
  expect(searchHistory(rows, "absent")).toEqual([]);
});

test.each([
  [0, "$0"], [100, "$1"], [99900, "$999"], [150000, "$1.5K"],
  [1000000, "$10K"], [110000000, "$1.1M"], [-1250000000, "−$13M"],
])("compact amount %i displays %s", (minorUnits, expected) => {
  expect(compactHistoryAmount(minorUnits)).toBe(expected);
});

test("full amounts hide whole cents and retain two decimals for COP and USD", () => {
  expect(historyAmount({ currency: "COP", minorUnits: -150000 }, true)).toBe("−$1.500");
  expect(historyAmount({ currency: "USD", minorUnits: 123450 }, true)).toBe("+$1.234,50");
  expect(historyAmount({ currency: "USD", minorUnits: 123401 })).toBe("$1.234,01");
  expect(capitalFlow([])).toEqual({ out: 0, inn: 0, net: 0 });
});
