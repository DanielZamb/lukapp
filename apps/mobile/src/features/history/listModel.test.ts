import { expect, test } from "vitest";
import { createTranslator } from "../../../../../src/i18n";

const en = createTranslator("en");
import { capitalFlow, compactHistoryAmount, historyAmount, historyDate, historyDateSections, historyListRow, historyRowDescription } from "./listModel";
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
  expect(historyListRow(row, categories, places, "2026-01-01", en)).toMatchObject({
    subtitle: "August 23, 2025 · 🦋 Family · Daily cash · Reversed", amountLabel: "−$1.264,25",
  });
  expect(historyDate("2025-08-23", "2025-12-31", "en")).toBe("August 23");
  expect(historyListRow({ ...row, userCategories: [], primaryUserCategoryId: undefined, detail: "Income", reversed: false,
    amount: { currency: "USD", minorUnits: 150000 } }, [], places, "2025-12-31", en)).toMatchObject({
    subtitle: "August 23 · 💸 Income · Daily cash", amountLabel: "+$1,500",
  });
});

test.each([
  [0, "$0", "$0"], [100, "$1", "$1"], [99900, "$999", "$999"], [150000, "$1,5K", "$1.5K"],
  [1000000, "$10K", "$10K"], [110000000, "$1,1M", "$1.1M"], [-1250000000, "−$13M", "−$13M"],
])("compact amount %i displays %s in COP and %s in USD", (minorUnits, cop, usd) => {
  expect(compactHistoryAmount(minorUnits, "COP", "en")).toBe(cop);
  expect(compactHistoryAmount(minorUnits, "USD", "en")).toBe(usd);
});

test("full amounts hide whole cents and retain two decimals for COP and USD", () => {
  expect(historyAmount({ currency: "COP", minorUnits: -150000 }, true)).toBe("−$1.500");
  expect(historyAmount({ currency: "USD", minorUnits: 123450 }, true)).toBe("+$1,234.50");
  expect(historyAmount({ currency: "USD", minorUnits: 123401 })).toBe("$1,234.01");
  expect(capitalFlow([])).toEqual({ out: 0, inn: 0, net: 0 });
});


test("history labels and compact totals use the row currency precision", () => {
  expect(historyAmount({ currency: "JPY", minorUnits: 100 })).toBe("JPY 100");
  expect(historyAmount({ currency: "BHD", minorUnits: 1234 })).toBe("BHD 1,234");
  expect(compactHistoryAmount(100, "JPY", "en")).toBe("JPY 100");
});

test("date sections show a shared place only when every movement that day shares it", () => {
  const movements = [
    { ...row, id: "first", date: "2026-10-24", reversed: false },
    { ...row, id: "second", date: "2026-10-24", reversed: false, amount: { currency: "COP", minorUnits: 26425 } },
    { ...row, id: "third", date: "2026-10-23", reversed: false },
    { ...row, id: "fourth", date: "2026-10-23", financialAccountProfileId: "bank" },
  ].map((movement) => historyListRow(movement, categories, [...places, { id: "bank", name: "Bank" }], "2026-10-26", en));
  const sections = historyDateSections(movements);
  expect(sections.map(({ date, net, place, rows }) => ({ date, net, place, ids: rows.map((row) => row.id) }))).toEqual([
    { date: "2026-10-24", net: -100000, place: "Daily cash", ids: ["first", "second"] },
    { date: "2026-10-23", net: -252850, place: undefined, ids: ["third", "fourth"] },
  ]);
  expect(historyRowDescription(movements[0], en.t, sections[0].place)).toBe("Weekly market");
  expect(historyRowDescription(movements[3], en.t, sections[1].place)).toBe("Bank · Weekly market · Reversed");
});

test("date sections preserve non-date sort order and do not mistake missing places for shared places", () => {
  const movements = [
    { ...row, id: "a", date: "2026-10-24" },
    { ...row, id: "b", date: "2026-10-23" },
    { ...row, id: "c", date: "2026-10-24", financialAccountProfileId: undefined },
  ].map((movement) => historyListRow(movement, categories, places, "2026-10-26", en));
  expect(historyDateSections(movements).flatMap((section) => section.rows.map((row) => row.id))).toEqual(["a", "b", "c"]);
  expect(historyDateSections(movements).map((section) => section.place)).toEqual([undefined, "Daily cash", undefined]);
  expect(historyDateSections([])).toEqual([]);
});

test("transfer descriptions retain both account names and the clicked place", () => {
  const movement = historyListRow({ ...row, reversed: false,
    transfer: { from: { id: "cash", name: "Daily cash" }, to: { id: "bank", name: "Bank" } },
  }, categories, places, "2026-10-26", en);
  expect(historyRowDescription(movement, en.t)).toBe("Daily cash · Daily cash → Bank");
  expect(historyRowDescription(movement, en.t, "Daily cash")).toBe("Daily cash → Bank");
});

test("two places with the same display name are still a mixed day", () => {
  const movements = [row, { ...row, id: "bank-row", financialAccountProfileId: "bank" }]
    .map((movement) => historyListRow(movement, categories, [...places, { id: "bank", name: "Daily cash" }], "2026-10-26", en));
  expect(historyDateSections(movements)[0].place).toBeUndefined();
});
