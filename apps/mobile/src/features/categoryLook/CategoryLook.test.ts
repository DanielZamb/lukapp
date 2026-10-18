import Ionicons from "@expo/vector-icons/Ionicons";
import * as React from "react";
import { createElement } from "react";
import { ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { getFunctionName } from "convex/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import CategoryLookRoute from "../../../app/category-look";
import type { categoryLook } from "./model";

type Input = Parameters<typeof categoryLook>[0];
const provider = vi.hoisted(() => ({
  query: vi.fn(), calendar: vi.fn(), push: vi.fn(), back: vi.fn(),
  month: "2026-10", categoryId: "food",
}));
vi.mock("convex/react", () => ({ useQuery: provider.query }));
vi.mock("../useWorkspaceCalendar", () => ({
  useWorkspaceCalendar: (timeZone: string) => { provider.calendar(timeZone); return { month: provider.month }; },
}));
vi.mock("expo-router", () => ({
  router: { push: provider.push, back: provider.back }, Redirect: "redirect",
  useLocalSearchParams: () => ({ categoryId: provider.categoryId }),
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "spinner", Pressable: "button", Text: "text", View: "view", ScrollView: "scroll",
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));

const categories: Input["categories"] = [{
  id: "food", workspaceId: "workspace", name: "Food", normalizedName: "food", nature: "Expense", natureSource: "answered",
  classification: { kind: "fallback", version: "test" }, style: { emoji: "🍋", tone: "positive" },
}];
function entry(id: string, date: string, minorUnits: number, ids = ["food"]): Input["entries"][number] {
  return {
    id, policy: "cash-expense@1", description: id, accountingDate: date,
    accountingPeriod: { year: 2026, month: Number(date.slice(5, 7)), status: "open" },
    amount: { currency: "COP", minorUnits }, postedBy: "owner", postedAt: 1, replay: false,
    lines: [{ ledgerAccountId: "expense", code: "expense", name: "Expense", nature: "Expense",
      debitMinorUnits: Math.max(0, minorUnits), creditMinorUnits: Math.max(0, -minorUnits),
      userCategories: ids.map((id) => ({ id, name: id })) }],
  };
}
let entries: Input["entries"];
let budget: Input["budget"];
let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  provider.month = "2026-10";
  provider.categoryId = "food";
  entries = [entry("Groceries", "2026-10-02", 150000)];
  budget = {
    month: "2026-10", currentMonth: "2026-10", currency: "COP", totalsOverlap: true,
    jars: [{ category: { id: "food", name: "Food", emoji: "🍋" }, revisionId: "revision", limitMinorUnits: 200000, consumptionMinorUnits: 150000 }],
    availableCategories: [],
  };
  provider.query.mockImplementation((reference) => {
    switch (getFunctionName(reference)) {
      case "accounting:personalDefaults": return { workspace: { id: "workspace", timeZone: "America/Bogota" } };
      case "accounting:listJournalEntries": return entries;
      case "accounting:listUserCategories": return categories;
      case "budget:evaluate": return budget;
      default: throw new Error(`Unexpected query ${getFunctionName(reference)}`);
    }
  });
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});
function screen() { if (!root) throw new Error("Category look not mounted"); return root.root; }
function texts() { return screen().findAllByType("text").map((node) => node.children.join("")); }
function jars() { return screen().findAll((node) => node.type === "view" && node.props.accessibilityRole === "progressbar"); }
async function render() { await act(async () => { root = create(createElement(CategoryLookRoute)); }); }
async function update() { await act(async () => root?.update(createElement(CategoryLookRoute))); }
async function press(label: string) {
  const button = screen().findAllByType("button").find((node) => node.props.accessibilityLabel === label);
  if (!button) throw new Error(`Missing button ${label}`);
  await act(async () => button.props.onPress());
}

test.each([
  [150000, "COP 1.500", "COP 500 still in the jar", 25],
  [200000, "COP 2.000", "COP 0 still in the jar", 0],
  [250000, "COP 2.500", "Over the COP 2.000 line", 0],
])("spend %i renders the month hero and remaining jar copy", async (spend, hero, hint, fill) => {
  entries = [entry("Groceries", "2026-10-02", spend)];
  await render();
  expect(texts()).toEqual(expect.arrayContaining(["THIS MONTH", "Food", "🍋", "Out this month", hero, hint, "Groceries", "2026-10-02", `−${hero}`, "Change this limit"]));
  expect(jars()).toHaveLength(1);
  expect(jars()[0].props.accessibilityValue).toEqual({ min: 0, max: 100, now: fill });
  await press("Back");
  await press("Change this limit");
  expect(provider.back).toHaveBeenCalledOnce();
  expect(provider.push).toHaveBeenCalledExactlyOnceWith("/budget");
  expect(provider.calendar).toHaveBeenCalledWith("America/Bogota");
  expect(provider.query.mock.calls.map(([reference, args]) => [getFunctionName(reference), args])).toEqual([
    ["accounting:personalDefaults", {}],
    ["accounting:listJournalEntries", { workspaceId: "workspace" }],
    ["accounting:listUserCategories", { workspaceId: "workspace" }],
    ["budget:evaluate", { workspaceId: "workspace", month: "2026-10" }],
  ]);
});

test("an empty category without a limit has no jar and opens the existing budget screen", async () => {
  entries = [];
  budget.jars = [];
  await render();
  expect(texts()).toContain("Nothing in this category yet");
  expect(texts()).toContain("COP 0");
  expect(jars()).toHaveLength(0);
  expect(texts().some((text) => text.includes("still in the jar") || text.startsWith("Over the"))).toBe(false);
  expect(screen().findAllByType(Ionicons).some((node) => node.props.name === "flag-outline")).toBe(true);
  await press("Keep this under a limit");
  expect(provider.push).toHaveBeenCalledExactlyOnceWith("/budget");
});

test("month spend nets reversals and all matching expense lines while recent keeps only three newest active category expenses", async () => {
  const split = entry("Split groceries", "2026-10-03", 50000);
  split.lines.push({ ...split.lines[0], debitMinorUnits: 25000 });
  const income = entry("Salary", "2026-10-08", 900000);
  income.lines = [{ ...income.lines[0], nature: "Revenue" }];
  const transfer = entry("Transfer", "2026-10-09", 900000);
  transfer.lines = [{ ...transfer.lines[0], nature: "Asset" }];
  entries = [
    entry("Old groceries", "2026-09-30", 800000),
    entry("Lunch", "2026-10-02", 100000), split,
    { ...entry("Reversed", "2026-10-06", 300000), reversedByEntryId: "reversal" },
    { ...entry("Reversal", "2026-10-07", -300000), policy: "reversal@1", reversesEntryId: "Reversed" },
    entry("Taxi", "2026-10-05", 700000, ["transport"]), income, transfer,
    entry("Dinner", "2026-10-04", 50000, ["family", "food"]),
    entry("Later lunch", "2026-10-02", 10000),
  ];
  entries[entries.length - 1].postedAt = 2;
  await render();
  expect(texts()).toContain("COP 2.350");
  expect(texts()).toContain("Over the COP 2.000 line");
  expect(texts().filter((text) => text.startsWith("−COP"))).toEqual(["−COP 500", "−COP 750", "−COP 100"]);
  expect(texts()).toEqual(expect.arrayContaining(["Dinner", "Split groceries", "Later lunch"]));
  for (const excluded of ["Old groceries", "Lunch", "Reversed", "Reversal", "Taxi", "Salary", "Transfer"]) {
    expect(texts()).not.toContain(excluded);
  }
  provider.month = "2026-11";
  await update();
  expect(texts()).toContain("COP 0");
  expect(texts()).toContain("COP 2.000 still in the jar");
  expect(provider.query.mock.calls.map(([reference, args]) => [getFunctionName(reference), args])).toContainEqual([
    "budget:evaluate", { workspaceId: "workspace", month: "2026-11" },
  ]);
});

test("loading, missing defaults, absent route parameter and unknown category are distinct from an empty category", async () => {
  provider.query.mockReturnValue(undefined);
  await render();
  expect(screen().findAllByType(ActivityIndicator)).toHaveLength(1);
  provider.query.mockReturnValue(null);
  await update();
  expect(screen().findByType(Redirect).props.href).toBe("/");
  provider.query.mockReturnValue({ workspace: { id: "workspace", timeZone: "America/Bogota" } });
  provider.categoryId = "";
  await update();
  expect(screen().findByType(Redirect).props.href).toBe("/overview");
});

test("the category content waits for Convex and handles a removed category", async () => {
  const read = provider.query.getMockImplementation();
  provider.query.mockImplementation((reference, args) => getFunctionName(reference) === "budget:evaluate" ? undefined : read?.(reference, args));
  await render();
  expect(screen().findAllByType(ActivityIndicator)).toHaveLength(1);
  expect(texts()).not.toContain("Nothing in this category yet");
  if (!read) throw new Error("Query reader missing");
  provider.query.mockImplementation(read);
  provider.categoryId = "removed";
  await update();
  expect(texts()).toContain("This category is no longer available.");
  expect(texts()).not.toContain("Nothing in this category yet");
});
