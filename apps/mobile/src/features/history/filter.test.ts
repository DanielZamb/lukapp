import { expect, test } from "vitest";
import {
  dateRanges,
  filterHistory,
  historyDateLabel,
  sortHistory,
  type HistoryFilterContext,
  type HistoryQuery,
} from "./filter";
import type { HistoryRow } from "./types";

const today = "2026-08-23";
const context: HistoryFilterContext = {
  today,
  profileNames: { daily: "Daily", savings: "Savings" },
};

const row = (
  input: Partial<HistoryRow> & Pick<HistoryRow, "id" | "date" | "title">,
): HistoryRow => ({
  detail: "",
  userCategories: [],
  reversed: false,
  amount: { currency: "COP", minorUnits: -100_000 },
  ...input,
});

const corpus: HistoryRow[] = [
  row({
    id: "a",
    date: "2026-08-22",
    title: "Groceries",
    financialAccountProfileId: "daily",
    userCategories: [
      { id: "food", name: "Food" },
      { id: "family", name: "Family" },
    ],
    primaryUserCategoryId: "food",
    amount: { currency: "COP", minorUnits: -250_000 },
  }),
  row({
    id: "b",
    date: "2026-07-15",
    title: "Payday",
    financialAccountProfileId: "savings",
    userCategories: [{ id: "income", name: "Income" }],
    amount: { currency: "COP", minorUnits: 1_500_000 },
  }),
  row({
    id: "c",
    date: "2026-06-02",
    title: "Bus fare",
    financialAccountProfileId: "daily",
    userCategories: [{ id: "transport", name: "Transport" }],
    amount: { currency: "COP", minorUnits: -3_500 },
  }),
  row({
    id: "d",
    date: "2025-12-31",
    title: "Year-end gift",
    financialAccountProfileId: "daily",
    userCategories: [{ id: "family", name: "Family" }],
    amount: { currency: "COP", minorUnits: -500_000 },
  }),
];

const baseQuery = (): HistoryQuery => ({
  search: "",
  profileIds: [],
  categoryIds: [],
  range: "all",
  customFrom: null,
  customTo: null,
});

test("dateRanges follows the workspace today with all, seven days, and three months", () => {
  expect(dateRanges(today)).toEqual([
    { id: "all", label: "All time", from: null, to: null },
    { id: "7d", label: "Last 7 days", from: "2026-08-17", to: "2026-08-23" },
    { id: "2026-08", label: "August", from: "2026-08-01", to: "2026-08-23" },
    { id: "2026-07", label: "July", from: "2026-07-01", to: "2026-07-31" },
    { id: "2026-06", label: "June", from: "2026-06-01", to: "2026-06-30" },
  ]);
});

test("historyDateLabel adds the year outside the workspace year", () => {
  expect(historyDateLabel("2026-08-22", 2026)).toBe("August 22");
  expect(historyDateLabel("2025-12-31", 2026)).toBe("December 31, 2025");
});

test("filterHistory keeps every row when place and category filters are empty", () => {
  expect(filterHistory(corpus, baseQuery(), context).map((entry) => entry.id)).toEqual([
    "a",
    "b",
    "c",
    "d",
  ]);
});

test("filterHistory matches any selected category and respects inclusive date bounds", () => {
  const july = filterHistory(
    corpus,
    { ...baseQuery(), range: "2026-07" },
    context,
  );
  expect(july).toEqual([corpus[1]]);

  const family = filterHistory(
    corpus,
    { ...baseQuery(), categoryIds: ["family"] },
    context,
  );
  expect(family.map((entry) => entry.id)).toEqual(["a", "d"]);

  const dailyOnly = filterHistory(
    corpus,
    { ...baseQuery(), profileIds: ["daily"] },
    context,
  );
  expect(dailyOnly.map((entry) => entry.id)).toEqual(["a", "c", "d"]);
});

test("a custom end overrides the quick range while bounds stay inclusive", () => {
  const filtered = filterHistory(
    corpus,
    {
      ...baseQuery(),
      range: "2026-07",
      customFrom: null,
      customTo: "2026-08-22",
    },
    context,
  );
  expect(filtered.map((entry) => entry.id)).toEqual(["a", "b", "c", "d"]);

  const bounded = filterHistory(
    corpus,
    {
      ...baseQuery(),
      range: "all",
      customFrom: "2026-08-22",
      customTo: "2026-08-22",
    },
    context,
  );
  expect(bounded).toEqual([corpus[0]]);
});

test("search matches description, categories, place, date label, and major-unit digits", () => {
  expect(
    filterHistory(corpus, { ...baseQuery(), search: "groceries" }, context),
  ).toEqual([corpus[0]]);
  expect(
    filterHistory(corpus, { ...baseQuery(), search: "transport" }, context),
  ).toEqual([corpus[2]]);
  expect(
    filterHistory(corpus, { ...baseQuery(), search: "savings" }, context),
  ).toEqual([corpus[1]]);
  expect(
    filterHistory(corpus, { ...baseQuery(), search: "august 22" }, context),
  ).toEqual([corpus[0]]);
  expect(
    filterHistory(corpus, { ...baseQuery(), search: "2500" }, context),
  ).toEqual([corpus[0]]);
  expect(
    filterHistory(corpus, { ...baseQuery(), search: "2025" }, context),
  ).toEqual([corpus[3]]);
});

test("sortHistory orders by date, absolute amount, place, and primary category", () => {
  const dated = sortHistory(corpus, "date", "desc").map((entry) => entry.id);
  expect(dated).toEqual(["a", "b", "c", "d"]);

  const amounts = [
    row({ id: "low", date: "2026-01-01", title: "Low", amount: { currency: "COP", minorUnits: -100 } }),
    row({ id: "mid", date: "2026-01-02", title: "Mid", amount: { currency: "COP", minorUnits: 50_000 } }),
    row({ id: "high", date: "2026-01-03", title: "High", amount: { currency: "COP", minorUnits: 2_000_000 } }),
    row({ id: "rev", date: "2026-01-04", title: "Rev", amount: { currency: "COP", minorUnits: -2_000_000 } }),
  ];
  expect(sortHistory(amounts, "amount", "desc").map((entry) => entry.id)).toEqual([
    "high",
    "rev",
    "mid",
    "low",
  ]);
  expect(sortHistory(amounts, "amount", "asc").map((entry) => entry.id)).toEqual([
    "low",
    "mid",
    "high",
    "rev",
  ]);

  const places = [
    row({
      id: "older",
      date: "2026-05-01",
      title: "Older",
      financialAccountProfileId: "daily",
    }),
    row({
      id: "newer",
      date: "2026-08-01",
      title: "Newer",
      financialAccountProfileId: "daily",
    }),
    row({
      id: "savings",
      date: "2026-04-01",
      title: "Save",
      financialAccountProfileId: "savings",
    }),
  ];
  expect(
    sortHistory(places, "place", "asc", context.profileNames).map((entry) => entry.id),
  ).toEqual(["newer", "older", "savings"]);
  expect(
    sortHistory(places, "place", "desc", context.profileNames).map((entry) => entry.id),
  ).toEqual(["savings", "newer", "older"]);

  const categories = [
    row({
      id: "food-new",
      date: "2026-08-10",
      title: "Food new",
      userCategories: [{ id: "food", name: "Food" }],
      primaryUserCategoryId: "food",
    }),
    row({
      id: "food-old",
      date: "2026-07-10",
      title: "Food old",
      userCategories: [{ id: "food", name: "Food" }],
      primaryUserCategoryId: "food",
    }),
    row({
      id: "bills",
      date: "2026-06-10",
      title: "Bills",
      userCategories: [{ id: "bills", name: "Bills" }],
    }),
  ];
  expect(sortHistory(categories, "category", "asc").map((entry) => entry.id)).toEqual([
    "bills",
    "food-new",
    "food-old",
  ]);
  expect(sortHistory(categories, "category", "desc").map((entry) => entry.id)).toEqual([
    "food-new",
    "food-old",
    "bills",
  ]);
});
