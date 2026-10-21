import * as React from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { ActivityIndicator } from "react-native";
import { createElement, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getFunctionName, type FunctionReference } from "convex/server";
import type { EntryDetail, HistoryRow } from "./types";
import type { ReversalTransport } from "./useReversal";

const provider = vi.hoisted(() => ({
  params: {} as { profileId?: string; entryId?: string },
  all: { results: [] as HistoryRow[], status: "LoadingFirstPage" },
  place: { results: [] as HistoryRow[], status: "LoadingFirstPage" },
  loadAll: vi.fn(), loadPlace: vi.fn(), push: vi.fn(), back: vi.fn(),
  details: new Map<string, EntryDetail>(), post: vi.fn<ReversalTransport["post"]>(),
  detailQuery: vi.fn(), present: vi.fn(), dismiss: vi.fn(), hardwareBack: undefined as (() => boolean) | undefined,
}));
vi.mock("expo-router", () => ({
  router: { push: provider.push, back: provider.back }, Redirect: "redirect", useLocalSearchParams: () => provider.params,
}));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area", useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock("@gorhom/bottom-sheet", async () => {
  const { forwardRef, useImperativeHandle, createElement } = await import("react");
  return {
    BottomSheetModal: forwardRef(({ children, onDismiss, ...props }: { children?: ReactNode; onDismiss: () => void }, ref) => {
      useImperativeHandle(ref, () => ({ present: provider.present, dismiss: () => { provider.dismiss(); onDismiss(); } }), [onDismiss]);
      return createElement("sheet", { ...props, onDismiss }, children);
    }),
    BottomSheetScrollView: "sheet-scroll", BottomSheetTextInput: "input", BottomSheetBackdrop: "backdrop",
  };
});
vi.mock("@react-native-community/datetimepicker", () => ({ default: "calendar" }));
vi.mock("react-native", () => ({
  KeyboardAvoidingView: "keyboard-viewport",
  Platform: { OS: "android" }, Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", TextInput: "input", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
  BackHandler: { addEventListener: (_event: string, callback: () => boolean) => {
    provider.hardwareBack = callback;
    return { remove: () => { provider.hardwareBack = undefined; } };
  } },
  FlatList: (props: {
    data: HistoryRow[]; ListHeaderComponent: ReactNode; ListFooterComponent: ReactNode; ListEmptyComponent: ReactNode;
    renderItem: (input: { item: HistoryRow; index: number }) => ReactNode;
  }) => createElement("list", null, props.ListHeaderComponent,
    props.data.length ? props.data.map((item, index) => createElement("row", { key: item.id }, props.renderItem({ item, index }))) : props.ListEmptyComponent, props.ListFooterComponent),
}));
vi.mock("../activity", () => ({
  usePersonalDefaults: () => ({ workspace: { id: "ws", timeZone: "America/Bogota", functionalCurrency: "COP" } }),
  usePostedActivity: () => ({ accounts: [{
    financialAccountProfileId: "daily", name: "Daily", productKind: "cash", nature: "Asset",
    balance: { currency: "COP", minorUnits: 0 }, trackingFrom: "2026-10-01",
  }] }), useRecentActivity: () => ({ page: [] }),
}));
vi.mock("../useWorkspaceCalendar", () => ({ useWorkspaceCalendar: () => ({ date: "2026-10-18", month: "2026-10" }) }));
vi.mock("convex/react", () => ({
  usePaginatedQuery: (_query: unknown, args: "skip" | { financialAccountProfileId?: string }) => {
    if (args === "skip") return { results: [], status: "LoadingFirstPage", loadMore: provider.loadPlace };
    return args.financialAccountProfileId ? { ...provider.place, loadMore: provider.loadPlace } : { ...provider.all, loadMore: provider.loadAll };
  },
  useQuery: (query: FunctionReference<"query">, args: { journalEntryId?: string; financialAccountProfileId?: string }) => {
    if (getFunctionName(query) === "accounting:listJournalEntries") return [];
    if (getFunctionName(query) === "budget:evaluate") return {
      month: "2026-10", currentMonth: "2026-10", currency: "COP", jars: [], availableCategories: [], totalsOverlap: true,
    };
    if (args.journalEntryId) {
      provider.detailQuery(args);
      return provider.details.get(`${args.journalEntryId}:${args.financialAccountProfileId ?? "all"}`) ?? provider.details.get(args.journalEntryId);
    }
    return [
    { id: "daily", name: "Daily", style: { emoji: "🥑", tone: "primary" } },
    { id: "family", name: "Family", style: { emoji: "🦋", tone: "positive" } },
  ];
  },
  useAction: () => provider.post,
}));

import HistoryRoute from "../../../app/history";
import OverviewRoute from "../../../app/overview";
import AccountRoute from "../../../app/account";
import EntryRoute from "../../../app/entry";

let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  provider.params = {};
  provider.all = { results: [], status: "LoadingFirstPage" };
  provider.place = { results: [], status: "LoadingFirstPage" };
  provider.details = new Map([["100", detail]]);
  provider.hardwareBack = undefined;
  vi.clearAllMocks();
  provider.post.mockReset().mockResolvedValue(receipt);
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
const detail = {
  entry: {
    id: "100", policy: "cash-expense@1", description: "Older receipt", accountingDate: "2026-10-17",
    accountingPeriod: { year: 2026, month: 10, status: "open" }, amount: { currency: "COP", minorUnits: 150000 },
    financialAccountProfileId: "daily", financialAccountProfileName: "Daily", postedBy: "owner", postedAt: 1, replay: false,
    lines: [],
  },
  row: { ...rows[100], userCategories: [{ id: "daily", name: "Food" }, { id: "family", name: "Family" }] },
} satisfies EntryDetail;
const receipt = {
  ...detail.entry, id: "reversal", policy: "reversal@1", description: "Reversal: Older receipt", reversesEntryId: "100",
} satisfies Awaited<ReturnType<ReversalTransport["post"]>>;
const reversed = {
  entry: { ...detail.entry, reversedByEntryId: "reversal" }, row: { ...detail.row, reversed: true },
} satisfies EntryDetail;
const linked = {
  entry: receipt, row: { ...detail.row, id: "reversal", title: receipt.description, reversesEntryId: "100",
    amount: { currency: "COP", minorUnits: 150000 } },
} satisfies EntryDetail;

test("history shows the first page immediately, loads more on request, and opens the 101st posting", async () => {
  await act(async () => { root = create(createElement(HistoryRoute)); });
  provider.all = { results: rows.slice(0, 50), status: "CanLoadMore" };
  await act(async () => root?.update(createElement(HistoryRoute)));
  expect(provider.loadAll).not.toHaveBeenCalled();
  expect(text()).toContain("50 of 50 loaded");
  expect(text()).not.toContain("Loading history…");
  await act(async () => root?.root.findByType("input").props.onChangeText("older receipt"));
  expect(text()).toContain("0 of 50 loaded");
  await act(async () => button("Load more transactions").props.onPress());
  expect(provider.loadAll).toHaveBeenLastCalledWith(50);
  provider.all = { results: rows.slice(0, 50), status: "LoadingMore" };
  await act(async () => root?.update(createElement(HistoryRoute)));
  expect(text()).toContain("0 of 50 loaded");
  expect(button("Load more transactions").props.disabled).toBe(true);
  provider.all = { results: rows.slice(0, 100), status: "CanLoadMore" };
  await act(async () => root?.update(createElement(HistoryRoute)));
  expect(provider.loadAll).toHaveBeenCalledTimes(1);
  await act(async () => button("Load more transactions").props.onPress());
  expect(provider.loadAll).toHaveBeenCalledTimes(2);
  provider.all = { results: rows, status: "Exhausted" };
  await act(async () => root?.update(createElement(HistoryRoute)));
  expect(text()).toContain("1 of 101");
  await act(async () => root?.root.findByType("input").props.onChangeText("older receipt"));
  expect(text()).toContain("1 of 101");
  expect(text()).toContain("Net\n−$1.5K");
  await act(async () => button("Older receipt, −$1.500").props.onPress());
  expect(provider.push).not.toHaveBeenCalled();
  expect(provider.present).toHaveBeenCalledOnce();
  expect(text()).toContain("MONEY OUT");
  expect(text()).toContain("🥑 Food · Primary\n🦋 Family");
  expect(text()).toContain("When\nOctober 17\nCategory");
  expect(text()).toContain("Place\nDaily");
  expect(text()).toContain("Posted entry · amounts in COP");
  expect(text()).not.toContain("prototype data");
  const sheet = root?.root.findByType(BottomSheetModal);
  expect(sheet?.props.enablePanDownToClose).toBe(true);
  expect(sheet?.props.backdropComponent({}).props.pressBehavior).toBe("close");
  await act(async () => sheet?.props.onDismiss());
  expect(root?.root.findAllByType(BottomSheetModal)).toHaveLength(0);
  expect(text()).toContain("1 of 101");
  expect(root?.root.findByType("input").props.value).toBe("older receipt");
  expect(provider.back).not.toHaveBeenCalled();
  expect(provider.hardwareBack).toBeUndefined();
  await act(async () => button("Go back").props.onPress());
  expect(provider.back).toHaveBeenCalledOnce();
});

async function openDetail() {
  provider.all = { results: rows, status: "Exhausted" };
  await act(async () => { root = create(createElement(HistoryRoute)); });
  await act(async () => button("Older receipt, −$1.500").props.onPress());
}

test("sheet close button and Android back dismiss it, then rows can reopen it", async () => {
  await openDetail();
  await act(async () => button("Close details").props.onPress());
  expect(root?.root.findAllByType(BottomSheetModal)).toHaveLength(0);
  await act(async () => button("Older receipt, −$1.500").props.onPress());
  await act(async () => expect(provider.hardwareBack?.()).toBe(true));
  expect(root?.root.findAllByType(BottomSheetModal)).toHaveLength(0);
  expect(provider.back).not.toHaveBeenCalled();
  expect(provider.dismiss).toHaveBeenCalledTimes(2);
  expect(provider.present).toHaveBeenCalledTimes(2);
  expect(text()).toContain("101 of 101");
});

test("sheet loads detail and swaps original and reversal contents without pushing or presenting another modal", async () => {
  provider.details.clear();
  await openDetail();
  expect(root?.root.findAllByType(ActivityIndicator).map((node) => node.props.accessibilityLabel)).toContain("Loading entry");
  provider.details.set("100", reversed);
  provider.details.set("reversal", linked);
  await act(async () => root?.update(createElement(HistoryRoute)));
  expect(text()).toContain("Reversed");
  expect(text()).not.toContain("Reverse entry");
  await act(async () => button("View reversal").props.onPress());
  expect(text()).toContain("MONEY IN");
  expect(text()).toContain("Reversal: Older receipt\n+$1.500\nReversal");
  expect(root?.root.findAllByType("text").find((node) => node.children.join("") === "+$1.500")?.props.style)
    .toContainEqual({ color: "#6d28d9" });
  expect(text()).not.toContain("View reversal");
  await act(async () => button("View original entry").props.onPress());
  expect(text()).toContain("MONEY OUT");
  expect(text()).toContain("Reversed");
  expect(root?.root.findAllByType(BottomSheetModal)).toHaveLength(1);
  expect(provider.present).toHaveBeenCalledOnce();
  expect(provider.push).not.toHaveBeenCalled();
});

test("sheet keeps confirmation, cancel, submitting, retry, posted receipt, and linked navigation", async () => {
  let finish: ((receipt: typeof linked.entry) => void) | undefined;
  provider.post.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await openDetail();
  await act(async () => button("Reverse entry").props.onPress());
  expect(text()).toContain("Reverse this entry?");
  expect(provider.post).not.toHaveBeenCalled();
  await act(async () => button("Keep entry").props.onPress());
  expect(text()).not.toContain("Reverse this entry?");
  expect(button("Reverse entry")).toBeDefined();
  await act(async () => button("Reverse entry").props.onPress());
  await act(async () => button("Confirm reversal").props.onPress());
  expect(text()).toContain("Posting reversal…");
  expect(text()).not.toContain("Confirm reversal");
  await act(async () => finish?.(receipt));
  expect(text()).toContain("Reversal posted · 2026-10-17");
  expect(text()).toContain("Reversed");
  expect(text()).not.toContain("Reverse entry");
  provider.details.set("100", reversed);
  provider.details.set("reversal", linked);
  await act(async () => button("View reversal").props.onPress());
  expect(text()).toContain("Reversal: Older receipt");
  expect(text()).not.toContain("Reversal posted");
  await act(async () => button("View original entry").props.onPress());
  expect(text()).toContain("Reversed");
  expect(provider.post).toHaveBeenCalledExactlyOnceWith({
    workspaceId: "ws", journalEntryId: "100", idempotencyKey: "mobile-reversal@1:ws:100",
  });
  expect(provider.push).not.toHaveBeenCalled();
});

test("sheet retries an uncertain reversal with the same correction identity", async () => {
  provider.post.mockRejectedValueOnce(new Error("Lost response"));
  await openDetail();
  await act(async () => button("Reverse entry").props.onPress());
  await act(async () => button("Confirm reversal").props.onPress());
  expect(text()).toContain("Could not confirm the reversal. Retry to check the same correction safely.");
  await act(async () => button("Retry reversal").props.onPress());
  expect(text()).toContain("Reversal posted · 2026-10-17");
  expect(provider.post.mock.calls.map(([payload]) => payload)).toEqual([
    { workspaceId: "ws", journalEntryId: "100", idempotencyKey: "mobile-reversal@1:ws:100" },
    { workspaceId: "ws", journalEntryId: "100", idempotencyKey: "mobile-reversal@1:ws:100" },
  ]);
});

test("closing during submission fences the late receipt and reopening starts with fresh controls", async () => {
  let finish: ((receipt: typeof linked.entry) => void) | undefined;
  provider.post.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await openDetail();
  await act(async () => button("Reverse entry").props.onPress());
  await act(async () => button("Confirm reversal").props.onPress());
  await act(async () => button("Close details").props.onPress());
  await act(async () => button("Older receipt, −$1.500").props.onPress());
  await act(async () => finish?.(receipt));
  expect(text()).not.toContain("Reversal posted");
  expect(text()).not.toContain("Posting reversal");
  expect(button("Reverse entry")).toBeDefined();
  expect(root?.root.findAllByType(BottomSheetModal)).toHaveLength(1);
  expect(provider.push).not.toHaveBeenCalled();
});

test("sheet keeps fractional amounts and the uncategorized money-in fallback", async () => {
  provider.details.set("100", {
    entry: { ...detail.entry, financialAccountProfileName: undefined },
    row: { ...detail.row, date: "2025-10-17", userCategories: [], primaryUserCategoryId: undefined,
      detail: "Income", amount: { currency: "USD", minorUnits: 150025 } },
  });
  await openDetail();
  expect(text()).toContain("MONEY IN");
  expect(text()).toContain("+$1.500,25");
  expect(text()).toContain("When\nOctober 17, 2025");
  expect(text()).toContain("Category\nNo category");
  expect(text()).toContain("Place\nNo place");
  expect(text()).toContain("Posted entry · amounts in USD");
});

test("standalone entry callers keep the detail screen, reversal confirmation, linked routes, and back", async () => {
  provider.params = { entryId: "100", profileId: "family" };
  await act(async () => { root = create(createElement(EntryRoute)); });
  expect(provider.detailQuery).toHaveBeenLastCalledWith({ workspaceId: "ws", journalEntryId: "100" });
  expect(text()).toContain("Posted entry");
  expect(text()).toContain("Older receipt");
  expect(root?.root.findAllByType(BottomSheetModal)).toHaveLength(0);
  await act(async () => button("Reverse entry").props.onPress());
  await act(async () => button("Confirm reversal").props.onPress());
  expect(text()).toContain("Reversal posted · 2026-10-17");
  await act(async () => button("View reversal").props.onPress());
  expect(provider.push).toHaveBeenCalledWith({ pathname: "/entry", params: { entryId: "reversal" } });
  await act(async () => button("Back").props.onPress());
  expect(provider.back).toHaveBeenCalledOnce();
});

test("place history counts the loaded scope, and clear removes both place and search", async () => {
  provider.params = { profileId: "daily" };
  const corpus = rows.map((row, index) => ({ ...row, financialAccountProfileId: index === 100 ? "daily" : "other" }));
  provider.all = { results: corpus, status: "Exhausted" };
  provider.place = { results: [corpus[100]], status: "Exhausted" };
  await act(async () => { root = create(createElement(HistoryRoute)); });
  await act(async () => root?.update(createElement(HistoryRoute)));
  expect(text()).toContain("ACROSS ALL PLACES\nTx history");
  expect(text()).toContain("1 of 1");
  expect(text()).not.toContain("Newer posting");
  await act(async () => root?.root.findByType("input").props.onChangeText("missing"));
  expect(text()).toContain("0 of 1");
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


test.each([
  { selection: "all", profileId: undefined, amount: -2500 },
  { selection: "source", profileId: "daily", amount: -2500 },
  { selection: "destination", profileId: "family", amount: 2500 },
  { selection: "multiple", profileId: undefined, amount: -2500 },
])("$selection place transfer keeps row direction in detail and linked reversals", async ({ selection, profileId, amount }) => {
  const original: EntryDetail = {
    entry: { ...detail.entry, policy: "account-transfer@1", description: "Transfer", reversedByEntryId: "reversal" },
    row: { ...detail.row, title: "Transfer", userCategories: [], detail: "Daily → Family",
      transfer: { from: { id: "daily", name: "Daily" }, to: { id: "family", name: "Family" } },
      amount: { currency: "COP", minorUnits: -2500 }, reversed: true },
  };
  const reversal: EntryDetail = {
    entry: { ...receipt, description: "Reversal: Transfer" },
    row: { ...linked.row, title: "Reversal: Transfer",
      transfer: { from: { id: "family", name: "Family" }, to: { id: "daily", name: "Daily" } },
      amount: { currency: "COP", minorUnits: 2500 } },
  };
  provider.details.set("100", original);
  provider.details.set("reversal", reversal);
  provider.details.set("100:family", { ...original, row: { ...original.row, amount: { currency: "COP", minorUnits: 2500 } } });
  provider.details.set("reversal:family", { ...reversal, row: { ...reversal.row, amount: { currency: "COP", minorUnits: -2500 } } });
  provider.params = { profileId: selection === "multiple" ? "daily" : profileId };
  provider.all = { results: [original.row], status: "Exhausted" };
  provider.place = { results: [{ ...original.row, amount: { currency: "COP", minorUnits: amount } }], status: "Exhausted" };
  await act(async () => { root = create(createElement(HistoryRoute)); });
  if (selection === "multiple") {
    await act(async () => button("Daily").props.onPress());
    const destination = root?.root.findAllByType("button").find((node) =>
      node.props.accessibilityRole === "checkbox" && node.props.accessibilityLabel === "Family");
    if (!destination) throw new Error("Missing destination place");
    await act(async () => destination.props.onPress());
    await act(async () => root?.root.findByType(BottomSheetModal).props.onDismiss());
  }
  const label = amount > 0 ? "+$25" : "−$25";
  await act(async () => button(`Transfer, ${label}`).props.onPress());
  function expectDirection(minorUnits: number) {
    const positive = minorUnits > 0;
    expect(text()).toContain(positive ? "MONEY IN" : "MONEY OUT");
    const hero = root?.root.findByType(BottomSheetModal).findAllByType("text")
      .find((node) => node.children.join("") === (positive ? "+$25" : "−$25"));
    expect(hero?.children.join("")).toBe(positive ? "+$25" : "−$25");
    if (positive) expect(hero?.props.style).toContainEqual({ color: "#6d28d9" });
    else expect(hero?.props.style).not.toContainEqual({ color: "#6d28d9" });
    expect(provider.detailQuery).toHaveBeenLastCalledWith({
      workspaceId: "ws", journalEntryId: minorUnits === amount ? "100" : "reversal",
      financialAccountProfileId: profileId ?? "daily",
    });
  }
  expectDirection(amount);
  await act(async () => button("View reversal").props.onPress());
  expectDirection(-amount);
  await act(async () => button("View original entry").props.onPress());
  expectDirection(amount);
  expect(provider.push).not.toHaveBeenCalled();
});

test("a recovery transfer shows its places as From and To, never as a category", async () => {
  const transfer: EntryDetail = {
    entry: { ...detail.entry, policy: "account-transfer@1", description: "Recovery: Repair" },
    row: { ...detail.row, title: "Recovery: Repair", userCategories: [],
      primaryUserCategoryId: undefined, detail: "My money → El guardado",
      transfer: { from: { id: "daily", name: "My money" }, to: { id: "savings", name: "El guardado" } },
      amount: { currency: "COP", minorUnits: -2500 } },
  };
  provider.details.set("100", transfer);
  provider.all = { results: [transfer.row], status: "Exhausted" };
  await act(async () => { root = create(createElement(HistoryRoute)); });
  await act(async () => button("Recovery: Repair, −$25").props.onPress());
  const sheet = root!.root.findByType(BottomSheetModal);
  const labels = sheet.findAllByType("text").map((node) => node.children.join(""));
  expect(labels).toContain("From");
  expect(labels).toContain("To");
  expect(labels).not.toContain("My money → El guardado");
  expect(labels).not.toContain("Category");
  expect(provider.post).not.toHaveBeenCalled();
});
