import { expect, test } from "vitest";
import { capitalFlow, compactHistoryAmount, historyAmount, historyDate, historyListRow } from "./listModel";
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

test.each([
  [0, "$0"], [100, "$1"], [99900, "$999"], [150000, "$1.5K"],
  [1000000, "$10K"], [110000000, "$1.1M"], [-1250000000, "−$13M"],
])("compact amount %i displays %s", (minorUnits, expected) => {
  expect(compactHistoryAmount(minorUnits, "COP")).toBe(expected);
});

test("full amounts hide whole cents and retain two decimals for COP and USD", () => {
  expect(historyAmount({ currency: "COP", minorUnits: -150000 }, true)).toBe("−$1.500");
  expect(historyAmount({ currency: "USD", minorUnits: 123450 }, true)).toBe("+$1.234,50");
  expect(historyAmount({ currency: "USD", minorUnits: 123401 })).toBe("$1.234,01");
  expect(capitalFlow([])).toEqual({ out: 0, inn: 0, net: 0 });
});


test("history labels and compact totals use the row currency precision", () => {
  expect(historyAmount({ currency: "JPY", minorUnits: 100 })).toBe("JPY 100");
  expect(historyAmount({ currency: "BHD", minorUnits: 1234 })).toBe("BHD 1,234");
  expect(compactHistoryAmount(100, "JPY")).toBe("JPY 100");
});
