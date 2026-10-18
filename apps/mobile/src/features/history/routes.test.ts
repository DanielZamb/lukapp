import * as React from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { createElement, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { HistoryRow } from "./types";

const provider = vi.hoisted(() => ({
  params: {} as { profileId?: string },
  all: { results: [] as HistoryRow[], status: "LoadingFirstPage" },
  place: { results: [] as HistoryRow[], status: "LoadingFirstPage" },
  loadAll: vi.fn(), loadPlace: vi.fn(), push: vi.fn(), back: vi.fn(),
}));
vi.mock("expo-router", () => ({
  router: { push: provider.push, back: provider.back }, Redirect: "redirect", useLocalSearchParams: () => provider.params,
}));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("react-native", () => ({
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", TextInput: "input", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
  FlatList: (props: {
    data: HistoryRow[]; ListHeaderComponent: ReactNode; ListEmptyComponent: ReactNode;
    renderItem: (input: { item: HistoryRow; index: number }) => ReactNode;
  }) => createElement("list", null, props.ListHeaderComponent,
    props.data.length ? props.data.map((item, index) => createElement("row", { key: item.id }, props.renderItem({ item, index }))) : props.ListEmptyComponent),
}));
vi.mock("../activity", () => ({
  usePersonalDefaults: () => ({ workspace: { id: "ws", timeZone: "America/Bogota", functionalCurrency: "COP" } }),
  usePostedActivity: () => ({ accounts: [] }), useRecentActivity: () => ({ page: [] }),
}));
vi.mock("../useWorkspaceCalendar", () => ({ useWorkspaceCalendar: () => ({ date: "2026-10-18" }) }));
vi.mock("convex/react", () => ({
  usePaginatedQuery: (_query: unknown, args: "skip" | { financialAccountProfileId?: string }) => {
    if (args === "skip") return { results: [], status: "LoadingFirstPage", loadMore: provider.loadPlace };
    return args.financialAccountProfileId ? { ...provider.place, loadMore: provider.loadPlace } : { ...provider.all, loadMore: provider.loadAll };
  },
  useQuery: () => [{ id: "daily", name: "Daily", style: { emoji: "🥑", tone: "primary" } }],
}));

import HistoryRoute from "../../../app/history";
import OverviewRoute from "../../../app/overview";
import AccountRoute from "../../../app/account";

let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  provider.params = {};
  provider.all = { results: [], status: "LoadingFirstPage" };
  provider.place = { results: [], status: "LoadingFirstPage" };
  vi.clearAllMocks();
});
afterEach(async () => {
  await act(async () => root?.unmount()); root = undefined;
  vi.unstubAllGlobals();
});
function text() { return root?.root.findAllByType("text").map((node) => node.children.join("")).join("\n") ?? ""; }
function button(label: string) {
  const found = root?.root.findAllByType("button").find((node) => node.props.accessibilityLabel === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}
const rows: HistoryRow[] = Array.from({ length: 101 }, (_, index) => ({
  id: String(index), title: index === 100 ? "Older receipt" : "Newer posting", date: "2026-10-17",
  detail: "Food", userCategories: [{ id: "daily", name: "Food" }], primaryUserCategoryId: "daily",
  financialAccountProfileId: "daily", reversed: false, amount: { currency: "COP", minorUnits: -150000 },
}));

test("history loads all pages before reporting counts, and searches and opens the 101st posting", async () => {
  await act(async () => { root = create(createElement(HistoryRoute)); });
  provider.all = { results: rows.slice(0, 50), status: "CanLoadMore" };
  await act(async () => root?.update(createElement(HistoryRoute)));
  expect(provider.loadAll).toHaveBeenLastCalledWith(50);
  expect(text()).toContain("Loading history…");
  expect(text()).not.toContain("50 of");
  provider.all = { results: rows.slice(0, 50), status: "LoadingMore" };
  await act(async () => root?.update(createElement(HistoryRoute)));
  provider.all = { results: rows.slice(0, 100), status: "CanLoadMore" };
  await act(async () => root?.update(createElement(HistoryRoute)));
  expect(provider.loadAll).toHaveBeenCalledTimes(2);
  provider.all = { results: rows, status: "Exhausted" };
  await act(async () => root?.update(createElement(HistoryRoute)));
  expect(text()).toContain("101 of 101");
  await act(async () => root?.root.findByType("input").props.onChangeText("older receipt"));
  expect(text()).toContain("1 of 101");
  expect(text()).toContain("Net\n−$1.5K");
  await act(async () => button("Older receipt, −$1.500").props.onPress());
  expect(provider.push).toHaveBeenCalledWith({ pathname: "/entry", params: { entryId: "100" } });
});

test("place history counts against the full corpus, and clear removes both place and search", async () => {
  provider.params = { profileId: "daily" };
  provider.all = { results: rows, status: "Exhausted" };
  provider.place = { results: [rows[100]], status: "Exhausted" };
  await act(async () => { root = create(createElement(HistoryRoute)); });
  expect(text()).toContain("ACROSS ALL PLACES\nTx history");
  expect(text()).toContain("1 of 101");
  expect(text()).not.toContain("Newer posting");
  await act(async () => root?.root.findByType("input").props.onChangeText("missing"));
  expect(text()).toContain("0 of 101");
  expect(text()).toContain("Nothing matches these filters. Clear them to see everything.");
  await act(async () => button("Clear filters").props.onPress());
  expect(text()).toContain("101 of 101");
  expect(text()).toContain("Newer posting");
  expect(root?.root.findByType("input").props.value).toBe("");
  await act(async () => button("Go back").props.onPress());
  expect(provider.back).toHaveBeenCalledOnce();
});

test("overview and account use primary receipt buttons and pass the account selection", async () => {
  await act(async () => { root = create(createElement(OverviewRoute)); });
  const overview = button("Go to tx history");
  expect(overview.findByType(Ionicons).props.name).toBe("receipt-outline");
  expect(overview.props.style({ pressed: false })[0].backgroundColor).toBe("#6d28d9");
  await act(async () => overview.props.onPress());
  expect(provider.push).toHaveBeenLastCalledWith("/history");
  provider.params = { profileId: "daily" };
  await act(async () => root?.update(createElement(AccountRoute)));
  const account = button("See in tx history");
  expect(account.findByType(Ionicons).props.name).toBe("receipt-outline");
  expect(account.props.style({ pressed: false })[0].backgroundColor).toBe("#6d28d9");
  await act(async () => account.props.onPress());
  expect(provider.push).toHaveBeenLastCalledWith({ pathname: "/history", params: { profileId: "daily" } });
});
