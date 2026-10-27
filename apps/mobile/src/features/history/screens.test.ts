import * as React from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import DateTimePicker from "@react-native-community/datetimepicker";
import { createElement, type ReactNode } from "react";
import { ActivityIndicator } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { EntryDetailScreen, entryPillContent } from "./EntryDetailScreen";
import { HistoryScreen } from "./HistoryScreen";
import type { EntryDetail, HistoryRow } from "./types";
import { ThemeProvider } from "../../ui/themeContext";
import { readableLayout } from "../../ui/layout";

vi.mock("../../ui/KeyboardFrame", () => ({ KeyboardFrame: ({ children }: { children: ReactNode }) => children }));

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("../../ui/ContextPill", () => ({ useContextPill: () => ({ summaryProps: {}, scrollProps: {} }) }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area", useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModal: "sheet", BottomSheetScrollView: "sheet-scroll", BottomSheetTextInput: "input", BottomSheetBackdrop: "backdrop",
}));
vi.mock("@react-native-community/datetimepicker", () => ({ default: "calendar" }));
vi.mock("react-native", () => ({
  KeyboardAvoidingView: "keyboard-viewport",
  Platform: { OS: "android" }, Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", TextInput: "input", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
  FlatList: (props: {
    data: HistoryRow[]; ListHeaderComponent: ReactNode; ListFooterComponent: ReactNode; ListEmptyComponent: ReactNode;
    renderItem: (input: { item: HistoryRow; index: number }) => ReactNode;
  }) => createElement("list", null, props.ListHeaderComponent,
    props.data.length ? props.data.map((item, index) => createElement("article", { key: item.id }, props.renderItem({ item, index }))) : props.ListEmptyComponent,
    props.ListFooterComponent),
}));
const detail = {
  entry: {
    id: "entry", policy: "cash-expense@1", description: "Groceries", accountingDate: "2026-10-17",
    accountingPeriod: { year: 2026, month: 10, status: "open" }, amount: { currency: "COP", minorUnits: 150000 },
    financialAccountProfileId: "cash", financialAccountProfileName: "Daily", postedBy: "owner", postedAt: 1, replay: false,
    lines: [{ ledgerAccountId: "internal-account", code: "53050501", name: "Internal expense account", nature: "Expense",
      debitMinorUnits: 150000, creditMinorUnits: 0, userCategories: [{ id: "food", name: "Food" }] }],
  },
  row: {
    id: "entry", title: "Groceries", date: "2026-10-17", detail: "Food · Family", reversed: false,
    userCategories: [{ id: "food", name: "Food" }, { id: "family", name: "Family" }], primaryUserCategoryId: "food",
    amount: { currency: "COP", minorUnits: -150000 },
  },
} satisfies EntryDetail;
let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});
function text() { return root?.root.findAllByType("text").map((node) => node.children.join("")).join("\n") ?? ""; }
function flatStyle(style: unknown): Record<string, unknown> {
  return Array.isArray(style) ? Object.assign({}, ...style.map(flatStyle)) : style && typeof style === "object" ? style : {};
}
function button(label: string) {
  const found = root?.root.findAllByType("button").find((node) => node.props.accessibilityLabel === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}
function entryProps() { return {
  detail, reversal: { kind: "idle" } as const,
  onBack: vi.fn(), onEntry: vi.fn(), onReverse: vi.fn(), onCancel: vi.fn(), onConfirm: vi.fn(),
}; }

test("entry pill uses the primary category limit and consumption, otherwise the signed movement", () => {
  const categories = [{ id: "food", name: "Food", style: { emoji: "🥑", tone: "primary" as const } }];
  expect(entryPillContent(detail, categories)).toEqual({ kind: "entry", name: "Groceries", emoji: "🥑", currency: "COP", amountMinor: -150000 });
  const budget = { month: "2026-10", currentMonth: "2026-10", currency: "COP", totalsOverlap: true as const,
    availableCategories: [], jars: [{ category: { id: "food", name: "Food", emoji: "🍲" }, revisionId: "limit",
      limitMinorUnits: 500000, consumptionMinorUnits: 150000 }] };
  expect(entryPillContent(detail, categories, budget)).toEqual({ kind: "budget", name: "Food", emoji: "🥑", currency: "COP",
    limitMinor: 500000, spentMinor: 150000 });
  expect(entryPillContent({ ...detail, row: { ...detail.row, primaryUserCategoryId: "family" } }, categories, budget))
    .toEqual({ kind: "entry", name: "Groceries", emoji: "🧾", currency: "COP", amountMinor: -150000 });
});

test("detail shows category/primary, signed amount, confirmation and links without accounting codes", async () => {
  const props = entryProps();
  await act(async () => { root = create(createElement(EntryDetailScreen, props)); });
  expect(text()).toContain("−COP 1.500,00");
  expect(text()).toContain("Food · Family");
  expect(text()).toContain("Primary category\nFood");
  expect(text()).not.toMatch(/53050501|Internal expense account|Debit|Credit/);
  await act(async () => button("Reverse entry").props.onPress());
  expect(props.onReverse).toHaveBeenCalledOnce();
  expect(props.onConfirm).not.toHaveBeenCalled();
  await act(async () => root?.update(createElement(EntryDetailScreen, { ...props, reversal: { kind: "confirming" } })));
  expect(text()).toContain("keeps the original");
  await act(async () => button("Keep entry").props.onPress());
  expect(props.onCancel).toHaveBeenCalledOnce();
  await act(async () => button("Confirm reversal").props.onPress());
  expect(props.onConfirm).toHaveBeenCalledOnce();
  await act(async () => root?.update(createElement(EntryDetailScreen, {
    ...props, detail: { ...detail, entry: { ...detail.entry, reversedByEntryId: "reversal" }, row: { ...detail.row, reversed: true } },
  })));
  expect(text()).toContain("Reversed");
  expect(text()).not.toContain("Reverse entry");
  await act(async () => button("View reversal").props.onPress());
  expect(props.onEntry).toHaveBeenLastCalledWith("reversal");
  await act(async () => root?.update(createElement(EntryDetailScreen, {
    ...props, detail: { ...detail, entry: { ...detail.entry, policy: "reversal@1", reversesEntryId: "original" }, row: { ...detail.row, reversesEntryId: "original", amount: { currency: "COP", minorUnits: 150000 } } },
  })));
  expect(text()).toContain("+COP 1.500,00");
  expect(text()).not.toContain("Reverse entry");
  await act(async () => button("View original entry").props.onPress());
  expect(props.onEntry).toHaveBeenLastCalledWith("original");
});

function historyProps() { return {
  rows: undefined, scopedRows: undefined, total: undefined,
  hasMore: false, loadingMore: false, onLoadMore: vi.fn(),
  categories: [{ id: "food", name: "Food", style: { emoji: "🥑", tone: "primary" } }],
  places: [{ id: "cash", name: "Daily" }], currentDate: "2026-10-18", currency: "COP",
  onEntry: vi.fn(), onBack: vi.fn(),
} satisfies Parameters<typeof HistoryScreen>[0]; }
function search(value: string) {
  const input = root?.root.findByType("input");
  if (!input) throw new Error("Missing search");
  input.props.onChangeText(value);
}

test("history distinguishes loading, empty workspace, and no matches", async () => {
  const props = historyProps();
  await act(async () => { root = create(createElement(HistoryScreen, props)); });
  expect(root?.root.findAllByType(ActivityIndicator)).toHaveLength(1);
  expect(text()).not.toContain("No posted activity");
  expect(text()).not.toContain("0 of");
  await act(async () => root?.update(createElement(HistoryScreen, { ...props, rows: [], total: 0 })));
  expect(text()).toContain("No posted activity yet.");
  await act(async () => search("missing"));
  expect(text()).toContain("No posted activity yet.");
  await act(async () => root?.update(createElement(HistoryScreen, { ...props, rows: [detail.row], total: 1 })));
  expect(text()).toContain("0 of 1");
  expect(text()).toContain("Nothing matches these filters. Clear them to see everything.");
  await act(async () => button("Clear filters").props.onPress());
  expect(text()).toContain("1 of 1");
  expect(root?.root.findByType("input").props.value).toBe("");
});

test("history matches the prototype row, uses primary for money in, and navigates to the entry", async () => {
  const cashRow = { ...detail.row, financialAccountProfileId: "cash", reversed: true };
  const props = { ...historyProps(), rows: [cashRow], scopedRows: [cashRow], total: 3, initialProfileId: "cash" };
  await act(async () => { root = create(createElement(HistoryScreen, props)); });
  expect(text()).toContain("ACROSS ALL PLACES\nTx history");
  expect(text()).toContain("1 of 3");
  expect(text()).toContain("October 17 · 🥑 Food · Daily · Reversed");
  expect(text()).toContain("−$1.500");
  await act(async () => button("Groceries, −$1.500").props.onPress());
  expect(props.onEntry).toHaveBeenCalledWith("entry");
  await act(async () => button("Go back").props.onPress());
  expect(props.onBack).toHaveBeenCalledOnce();
  const incomeRow = { ...detail.row, financialAccountProfileId: "cash", userCategories: [], primaryUserCategoryId: undefined, detail: "Income", amount: { currency: "USD", minorUnits: 150025 } };
  await act(async () => root?.update(createElement(HistoryScreen, { ...props, rows: [incomeRow], scopedRows: [incomeRow] })));
  expect(text()).toContain("💸 Income");
  expect(text()).toContain("+$1.500,25");
  const amount = root?.root.findAllByType("text").find((node) => node.children.join("") === "+$1.500,25");
  expect(flatStyle(amount?.props.style).color).toBe("#6d28d9");
});

test("search updates the count and capital flow, and figures toggle full precision", async () => {
  const rows = [detail.row, { ...detail.row, id: "income", title: "Salary", amount: { currency: "COP", minorUnits: 253450 } }];
  await act(async () => { root = create(createElement(HistoryScreen, { ...historyProps(), rows, total: 2 })); });
  expect(text()).toContain("2 of 2");
  expect(text()).toContain("$1.0K");
  expect(text()).toContain("$1.5K");
  expect(text()).toContain("$2.5K");
  await act(async () => button("In").props.onPress());
  expect(text()).toContain("$2.534,50");
  expect(text()).not.toContain("Net");
  expect(text()).not.toContain("Out");
  await act(async () => button("In").props.onPress());
  expect(text()).toContain("Net");
  await act(async () => search(" salary "));
  expect(text()).toContain("1 of 2");
  expect(text()).not.toContain("Groceries");
  expect(text()).toContain("Out\n$0");
  await act(async () => button("Net").props.onPress());
  expect(text()).toContain("$2.534,50");
  await act(async () => button("Clear filters").props.onPress());
  expect(text()).toContain("2 of 2");
  expect(text()).toContain("Groceries");
});

test("all-places history shows both transfer movements and nets to zero", async () => {
  const transfer = { ...detail.row, id: "move", title: "Savings contribution",
    userCategories: [], primaryUserCategoryId: undefined,
    detail: "My money → El guardado", financialAccountProfileId: "cash",
    financialAccountProfileIds: ["cash", "savings"],
    transfer: { from: { id: "cash", name: "My money" }, to: { id: "savings", name: "El guardado" } },
    amount: { currency: "COP", minorUnits: -6000000 },
  };
  const onEntry = vi.fn();
  await act(async () => { root = create(createElement(HistoryScreen, {
    ...historyProps(), rows: [transfer], total: 1, onEntry,
    places: [{ id: "cash", name: "My money" }, { id: "savings", name: "El guardado" }],
  })); });
  expect(text()).toContain("2 of 2");
  expect(text()).toContain("−$60.000");
  expect(text()).toContain("+$60.000");
  expect(text()).toContain("$0");
  await act(async () => button("Savings contribution, +$60.000").props.onPress());
  expect(onEntry).toHaveBeenCalledWith("move", "savings");
});

function choice(role: string, label: string) {
  const found = root?.root.findAllByType("button").find((node) => node.props.accessibilityRole === role && node.props.accessibilityLabel === label);
  if (!found) throw new Error(`Missing ${role} ${label}`);
  return found;
}
async function closeSheet() {
  await act(async () => root?.root.findByType(BottomSheetModal).props.onDismiss());
}
function visibleTitles() {
  return root?.root.findAllByType("article").map((node) => node.findAllByType("text")[0].children.join(""));
}
const filterRows: HistoryRow[] = [
  { ...detail.row, id: "older", title: "Older food", date: "2026-09-15", financialAccountProfileId: "cash" },
  { ...detail.row, id: "newer", title: "Newer food", date: "2026-10-17", financialAccountProfileId: "bank", amount: { currency: "COP", minorUnits: -50000 } },
  { ...detail.row, id: "income", title: "Payday", date: "2026-10-18", financialAccountProfileId: "bank",
    userCategories: [{ id: "salary", name: "Salary" }], primaryUserCategoryId: "salary", amount: { currency: "COP", minorUnits: 500000 } },
];
function filterProps() { return {
  ...historyProps(), rows: filterRows, total: 3,
  places: [{ id: "cash", name: "Daily" }, { id: "bank", name: "Bank" }],
  categories: [
    { id: "food", name: "Food", style: { emoji: "🥑", tone: "primary" as const } },
    { id: "family", name: "Family", style: { emoji: "🦋", tone: "positive" as const } },
    { id: "salary", name: "Salary", style: { emoji: "💸", tone: "warning" as const } },
  ],
}; }

test("chips wrap with chevrons; one dismissible sheet; sort flips active keys and defaults new keys", async () => {
  await act(async () => { root = create(createElement(HistoryScreen, filterProps())); });
  expect(visibleTitles()).toEqual(["Payday", "Newer food", "Older food"]);
  for (const label of ["Newest first", "All places", "All categories", "Dates"]) {
    expect(button(label).props.accessibilityState.selected).toBe(false);
    expect(button(label).findAllByType(Ionicons).at(-1)?.props.name).toBe("chevron-down");
  }
  expect(button("Newest first").findAllByType(Ionicons)[0].props.name).toBe("swap-vertical");
  await act(async () => button("Newest first").props.onPress());
  expect(root?.root.findAllByType(BottomSheetModal)).toHaveLength(1);
  const sheet = root?.root.findByType(BottomSheetModal);
  expect(sheet?.props.enablePanDownToClose).toBe(true);
  expect(sheet?.props.enableDynamicSizing).toBe(true);
  expect(sheet?.props.backdropComponent({}).props.pressBehavior).toBe("close");
  expect(text()).toContain("SORT BY");
  expect(text()).toContain("Tap the active one to flip the order.");
  await act(async () => choice("radio", "Date").props.onPress());
  expect(visibleTitles()).toEqual(["Older food", "Newer food", "Payday"]);
  expect(button("Oldest first").props.style).toContainEqual({ borderWidth: 2, borderColor: "#6d28d9" });
  await act(async () => choice("radio", "Amount").props.onPress());
  expect(visibleTitles()).toEqual(["Payday", "Older food", "Newer food"]);
  await act(async () => choice("radio", "Amount").props.onPress());
  expect(visibleTitles()).toEqual(["Newer food", "Older food", "Payday"]);
  await act(async () => choice("radio", "Place").props.onPress());
  expect(visibleTitles()).toEqual(["Payday", "Newer food", "Older food"]);
  expect(button("Place A to Z").props.accessibilityState.selected).toBe(true);
  await closeSheet();
  expect(root?.root.findAllByType(BottomSheetModal)).toHaveLength(0);
});

test("places multi-pick, empty means all, and clear removes the initial place and search", async () => {
  const cashOnly = filterRows.filter((row) => row.financialAccountProfileId === "cash");
  await act(async () => { root = create(createElement(HistoryScreen, {
    ...filterProps(), initialProfileId: "cash", scopedRows: cashOnly,
  })); });
  expect(text()).toContain("1 of 3");
  expect(text()).toContain("Out\n$1.5K");
  await act(async () => button("Daily").props.onPress());
  expect(root?.root.findByType(BottomSheetModal).props.enableDynamicSizing).toBe(true);
  expect(choice("checkbox", "Daily").props.accessibilityState.checked).toBe(true);
  await act(async () => choice("checkbox", "Bank").props.onPress());
  expect(text()).toContain("3 of 3");
  expect(button("2 places")).toBeDefined();
  await act(async () => choice("checkbox", "All places").props.onPress());
  expect(choice("checkbox", "All places").props.accessibilityState.checked).toBe(true);
  await act(async () => choice("checkbox", "Daily").props.onPress());
  await act(async () => choice("checkbox", "Daily").props.onPress());
  expect(text()).toContain("3 of 3");
  await closeSheet();
  await act(async () => search("older"));
  expect(text()).toContain("1 of 3");
  await act(async () => button("Clear filters").props.onPress());
  expect(text()).toContain("3 of 3");
  expect(root?.root.findByType("input").props.value).toBe("");
});

test("categories search stays sticky at 70%, matches secondary categories, and uses tone fills", async () => {
  await act(async () => { root = create(createElement(HistoryScreen, filterProps())); });
  await act(async () => button("All categories").props.onPress());
  expect(root?.root.findByType(BottomSheetModal).props.snapPoints).toEqual(["70%"]);
  expect(root?.root.findByType(BottomSheetModal).props.enableDynamicSizing).toBe(false);
  expect(root?.root.findByType(BottomSheetScrollView).props.stickyHeaderIndices).toEqual([0]);
  await act(async () => choice("checkbox", "Family").props.onPress());
  expect(text()).toContain("2 of 3");
  expect(button("🦋 Family")).toBeDefined();
  expect(choice("checkbox", "Family").props.style).toContainEqual({ borderColor: "#047857", borderWidth: 2, backgroundColor: "#0478573D" });
  await act(async () => choice("checkbox", "Food").props.onPress());
  expect(choice("checkbox", "Food").props.style).toContainEqual({ borderColor: "#6d28d9", borderWidth: 2, backgroundColor: "#6d28d93D" });
  await act(async () => choice("checkbox", "Salary").props.onPress());
  expect(choice("checkbox", "Salary").props.style).toContainEqual({ borderColor: "#9c5f06", borderWidth: 2, backgroundColor: "#9c5f063D" });
  expect(text()).toContain("3 of 3");
  expect(button("3 categories")).toBeDefined();
  await act(async () => root?.root.findAllByType("input").find((node) => node.props.accessibilityLabel === "Search categories")?.props.onChangeText(" salary "));
  expect(choice("checkbox", "Salary")).toBeDefined();
  expect(root?.root.findAllByType("button").some((node) => node.props.accessibilityLabel === "Food")).toBe(false);
  await act(async () => root?.root.findAllByType("input").find((node) => node.props.accessibilityLabel === "Search categories")?.props.onChangeText(" none "));
  expect(text()).toContain('No category matches "none".');
  await act(async () => choice("checkbox", "All categories").props.onPress());
  expect(text()).toContain("3 of 3");
  await closeSheet();
  await act(async () => button("All categories").props.onPress());
  expect(root?.root.findAllByType("input").find((node) => node.props.accessibilityLabel === "Search categories")?.props.value).toBe("");
});

test("date radios use workspace today, native custom dates override quick ranges, and quick clears custom", async () => {
  await act(async () => { root = create(createElement(HistoryScreen, filterProps())); });
  await act(async () => button("Dates").props.onPress());
  expect(root?.root.findByType(BottomSheetModal).props.enableDynamicSizing).toBe(true);
  expect(root?.root.findAllByType("button").filter((node) => node.props.accessibilityRole === "radio")
    .map((node) => node.props.accessibilityLabel)).toEqual(["All time", "Last 7 days", "October", "September", "August"]);
  await act(async () => choice("radio", "September").props.onPress());
  expect(visibleTitles()).toEqual(["Older food"]);
  await act(async () => button("Pick the to date").props.onPress());
  expect(root?.root.findByType(DateTimePicker).props.mode).toBe("date");
  await act(async () => root?.root.findByType(DateTimePicker).props.onChange({ type: "dismissed" }));
  expect(visibleTitles()).toEqual(["Older food"]);
  await act(async () => button("Pick the to date").props.onPress());
  await act(async () => root?.root.findByType(DateTimePicker).props.onChange({ type: "set" }, new Date(2026, 9, 17, 12)));
  expect(visibleTitles()).toEqual(["Newer food", "Older food"]);
  expect(button("Start – Oct 17")).toBeDefined();
  expect(choice("radio", "September").props.accessibilityState.selected).toBe(false);
  await act(async () => choice("radio", "August").props.onPress());
  await act(async () => button("Pick the from date").props.onPress());
  await act(async () => root?.root.findByType(DateTimePicker).props.onChange({ type: "set" }, new Date(2026, 9, 18, 12)));
  expect(visibleTitles()).toEqual(["Payday"]);
  expect(button("Oct 18 – today")).toBeDefined();
  await act(async () => choice("radio", "Last 7 days").props.onPress());
  expect(visibleTitles()).toEqual(["Payday", "Newer food"]);
  await act(async () => button("Pick the from date").props.onPress());
  expect(root?.root.findByType(DateTimePicker).props.value.getDate()).toBe(18);
  await act(async () => choice("radio", "All time").props.onPress());
  expect(text()).toContain("3 of 3");
  expect(button("Dates").props.accessibilityState.selected).toBe(false);
  expect(root?.root.findAllByType(DateTimePicker)).toHaveLength(0);
});

function largeScreen(node: React.ReactElement) {
  return createElement(ThemeProvider, { layout: readableLayout({ width: 320, fontScale: 1.5 }) }, node);
}

test("XXXL history groups shared and mixed dates, gives money its own line, and retains full descriptions", async () => {
  const props = filterProps();
  const rows = [
    { ...detail.row, id: "shared-a", title: "A full description that remains available to the screen reader even when the visible description wraps past two lines", date: "2026-10-18", financialAccountProfileId: "cash" },
    { ...detail.row, id: "shared-b", date: "2026-10-18", financialAccountProfileId: "cash" },
    { ...detail.row, id: "mixed-a", date: "2026-10-17", financialAccountProfileId: "cash" },
    { ...detail.row, id: "mixed-b", date: "2026-10-17", financialAccountProfileId: "bank", amount: { currency: "COP", minorUnits: 50000 } },
  ];
  await act(async () => { root = create(largeScreen(createElement(HistoryScreen, { ...props, rows, total: 4 }))); });
  expect(text()).toContain("4 of 4 loaded");
  expect(text()).not.toContain("Filters and totals cover");
  expect(text()).toContain("October 18");
  expect(text()).toContain("Daily · Groceries");
  expect(text()).toContain("Bank · Groceries");
  const movement = root?.root.findAllByType("button").find((node) => node.props.accessibilityLabel?.includes(rows[0].title));
  expect(movement?.props.accessibilityLabel).toContain("Food, −$1.500");
  const description = movement?.findAllByType("text").find((node) => node.children.join("") === rows[0].title);
  expect(description?.props.numberOfLines).toBe(2);
  await act(async () => movement?.props.onPress());
  expect(props.onEntry).toHaveBeenCalledWith("shared-a");
});

test("XXXL opens one filter sheet at a time and retains multi-pick semantics", async () => {
  await act(async () => { root = create(largeScreen(createElement(HistoryScreen, filterProps()))); });
  for (const label of ["Sort, Newest first", "Places, All 2 places", "Categories, All 3", "Dates, All time"]) {
    await act(async () => button(label).props.onPress());
    expect(root?.root.findAllByType(BottomSheetModal)).toHaveLength(1);
    expect(button("Show movements")).toBeDefined();
    await closeSheet();
    expect(root?.root.findAllByType(BottomSheetModal)).toHaveLength(0);
  }
  await act(async () => button("Places, All 2 places").props.onPress());
  await act(async () => choice("checkbox", "Daily").props.onPress());
  expect(choice("checkbox", "Daily").props.accessibilityState.checked).toBe(true);
  await act(async () => choice("checkbox", "Bank").props.onPress());
  expect(text()).toContain("3 of 3 loaded");
});

test("XXXL no matches pins Clear filters and keeps Load more inside the scroller", async () => {
  await act(async () => { root = create(largeScreen(createElement(HistoryScreen, { ...filterProps(), hasMore: true }))); });
  await act(async () => search("missing"));
  expect(text()).toContain("Nothing matches");
  expect(button("Load more")).toBeDefined();
  const scroller = root?.root.findByType("scroll");
  expect(scroller?.findAllByType("button").some((node) => node.props.accessibilityLabel === "Clear filters")).toBe(false);
  expect(scroller?.findAllByType("button").some((node) => node.props.accessibilityLabel === "Load more")).toBe(true);
  await act(async () => button("Clear filters").props.onPress());
  expect(text()).toContain("3 of 3 loaded");
});

test("XXXL details pins both actions and permits leaving a failed child confirmation", async () => {
  const props = entryProps();
  await act(async () => { root = create(largeScreen(createElement(EntryDetailScreen, props))); });
  expect(text()).toContain("About this entry");
  const scroller = root?.root.findByType("scroll");
  expect(scroller?.findAllByType("button").some((node) => node.props.accessibilityLabel === "Reverse entry")).toBe(false);
  expect(button("Close details")).toBeDefined();
  await act(async () => root?.update(largeScreen(createElement(EntryDetailScreen, { ...props, reversal: { kind: "failed", message: "Try the same correction again." } }))));
  expect(root?.root.findAllByType(BottomSheetModal)).toHaveLength(1);
  await act(async () => button("Keep entry").props.onPress());
  expect(props.onCancel).toHaveBeenCalledOnce();
  expect(root?.root.findAllByType(BottomSheetModal)).toHaveLength(0);
  await act(async () => button("Close details").props.onPress());
  expect(props.onBack).toHaveBeenCalledOnce();
});

function atScale(node: React.ReactElement, fontScale: number) {
  return createElement(ThemeProvider, { layout: readableLayout({ width: 320, fontScale }) }, node);
}

test("changing the font tier retains the open filter, its search, and the selected query", async () => {
  const props = filterProps();
  await act(async () => { root = create(atScale(createElement(HistoryScreen, props), 1)); });
  await act(async () => button("All categories").props.onPress());
  await act(async () => choice("checkbox", "Family").props.onPress());
  await act(async () => root?.root.findAllByType("input").find((node) => node.props.accessibilityLabel === "Search categories")?.props.onChangeText("Family"));
  const modalOwner = root?.root.findByType(BottomSheetModal);
  await act(async () => root?.update(atScale(createElement(HistoryScreen, props), 1.5)));
  expect(root?.root.findAllByType(BottomSheetModal)).toHaveLength(1);
  expect(root?.root.findByType(BottomSheetModal)).toBe(modalOwner);
  expect(root?.root.findAllByType("input").find((node) => node.props.accessibilityLabel === "Search categories")?.props.value).toBe("Family");
  expect(choice("checkbox", "Family").props.accessibilityState.checked).toBe(true);
  await act(async () => root?.update(atScale(createElement(HistoryScreen, props), 1)));
  expect(root?.root.findAllByType(BottomSheetModal)).toHaveLength(1);
  expect(root?.root.findByType(BottomSheetModal)).toBe(modalOwner);
  expect(root?.root.findAllByType("input").find((node) => node.props.accessibilityLabel === "Search categories")?.props.value).toBe("Family");
});

test("changing the font tier does not reopen a dismissed failed confirmation", async () => {
  const props = { ...entryProps(), reversal: { kind: "failed" as const, message: "Retry the same correction." } };
  await act(async () => { root = create(atScale(createElement(EntryDetailScreen, props), 1.5)); });
  await act(async () => button("Keep entry").props.onPress());
  expect(root?.root.findAllByType(BottomSheetModal)).toHaveLength(0);
  await act(async () => root?.update(atScale(createElement(EntryDetailScreen, props), 1)));
  expect(button("Retry reversal")).toBeDefined();
  await act(async () => root?.update(atScale(createElement(EntryDetailScreen, props), 1.5)));
  expect(root?.root.findAllByType(BottomSheetModal)).toHaveLength(0);
  expect(button("Close details")).toBeDefined();
});
