import * as React from "react";
import { createElement, type ReactNode } from "react";
import { ActivityIndicator } from "react-native";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { EntryDetailScreen } from "./EntryDetailScreen";
import { HistoryScreen } from "./HistoryScreen";
import type { EntryDetail, HistoryRow } from "./types";

vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("react-native", () => ({
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
  FlatList: (props: {
    data: HistoryRow[]; ListHeaderComponent: ReactNode; ListFooterComponent: ReactNode; ListEmptyComponent: ReactNode;
    renderItem: (input: { item: HistoryRow }) => ReactNode;
  }) => createElement("list", null, props.ListHeaderComponent,
    props.data.length ? props.data.map((item) => createElement("row", { key: item.id }, props.renderItem({ item }))) : props.ListEmptyComponent,
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
function button(label: string) {
  const found = root?.root.findAllByType("button").find((node) => node.props.accessibilityLabel === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}
function entryProps() { return {
  detail, reversal: { kind: "idle" } as const,
  onBack: vi.fn(), onEntry: vi.fn(), onReverse: vi.fn(), onCancel: vi.fn(), onConfirm: vi.fn(),
}; }

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

test("history renders empty/loading/end states, row navigation and the next 50 request", async () => {
  const props = { rows: [], status: "LoadingFirstPage", onMore: vi.fn(), onEntry: vi.fn(), onBack: vi.fn() } satisfies Parameters<typeof HistoryScreen>[0];
  await act(async () => { root = create(createElement(HistoryScreen, props)); });
  expect(root?.root.findAllByType(ActivityIndicator)).toHaveLength(1);
  expect(text()).not.toContain("No posted activity");
  await act(async () => root?.update(createElement(HistoryScreen, { ...props, status: "Exhausted" })));
  expect(text()).toContain("No posted activity yet.");
  await act(async () => root?.update(createElement(HistoryScreen, { ...props, rows: [detail.row], status: "CanLoadMore" })));
  expect(text()).toContain("2026-10-17 · Food · Family");
  await act(async () => button("Load 50 more").props.onPress());
  expect(props.onMore).toHaveBeenCalledOnce();
  const row = root?.root.findAllByType("button").find((node) => !node.props.accessibilityLabel);
  await act(async () => row?.props.onPress());
  expect(props.onEntry).toHaveBeenCalledWith("entry");
  await act(async () => root?.update(createElement(HistoryScreen, { ...props, rows: [detail.row], status: "LoadingMore" })));
  expect(root?.root.findAllByType(ActivityIndicator)).toHaveLength(1);
  expect(text()).not.toContain("Load 50 more");
  await act(async () => root?.update(createElement(HistoryScreen, { ...props, rows: [detail.row], status: "Exhausted" })));
  expect(text()).toContain("You have reached the beginning.");
});
