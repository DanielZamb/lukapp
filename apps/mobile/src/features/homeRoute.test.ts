import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
vi.mock("../ui/Brand", () => ({ BrandLogo: "brand-logo", BrandMark: "brand-mark", BrandSplash: "brand-splash" }));
import Index from "../../app/index";
import type { BudgetJar } from "./budget/model";

type MockPlace = { minorUnits: number; nature?: "Asset" | "Liability" };
const state = vi.hoisted(() => ({
  accounts: [{ minorUnits: 8_500_000_00 }] as MockPlace[],
  currency: "COP",
  hasLimit: false,
  balancesLoading: false,
  budgetLoading: false,
  inboxCount: 0 as number | undefined,
  push: vi.fn(),
  present: vi.fn(),
  dismiss: vi.fn(),
  query: vi.fn(),
}));
let alertJars: BudgetJar[] = [];
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));
vi.mock("expo-router", () => ({ router: { push: state.push }, useLocalSearchParams: () => ({}) }));
vi.mock("convex/react", () => ({ useQuery: (...args: unknown[]) => {
  state.query(...args);
  return state.budgetLoading ? undefined : {
    currency: state.currency,
    jars: alertJars.length ? alertJars : state.hasLimit ? [{
      category: { id: "food", name: "Food", emoji: "🍋" },
      limitMinorUnits: 100_00, consumptionMinorUnits: 0,
    }] : [],
  };
} }));
vi.mock("./activity", () => ({
  usePersonalDefaults: () => ({
    workspace: { id: "workspace", functionalCurrency: state.currency, timeZone: "America/Bogota",
      currentAccountingPeriod: { year: 2026, month: 10, status: "open" } },
    financialAccountProfile: { id: "daily" },
  }),
  usePostedActivity: () => state.balancesLoading ? undefined : {
    accounts: state.accounts.map(({ minorUnits, nature = "Asset" }, index) => ({
      financialAccountProfileId: `place-${index}`,
      nature,
      balance: { currency: state.currency, minorUnits },
    })),
    monthSpendMinorUnits: 123_00,
  },
}));
vi.mock("./useWorkspaceCalendar", () => ({ useWorkspaceCalendar: () => ({
  month: "2026-10", date: "2026-10-31", now: new Date("2026-11-01T00:30:00Z"),
}) }));
vi.mock("./useInboxCount", () => ({ useInboxCount: () => state.inboxCount }));
vi.mock("./Setup", () => ({ Setup: "setup" }));
vi.mock("./HomePlaceSetup", () => ({ HomePlaceSetup: "place-setup" }));
vi.mock("@gorhom/bottom-sheet", async () => {
  const { createElement, useImperativeHandle } = await import("react");
  return {
    BottomSheetModal: ({ ref, children, ...props }: React.PropsWithChildren<{
      ref: React.Ref<unknown>;
    }>) => {
      useImperativeHandle(ref, () => ({ present: state.present, dismiss: state.dismiss }));
      return createElement("sheet", props, children);
    },
    BottomSheetView: "sheet-content", BottomSheetBackdrop: "backdrop",
  };
});
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  KeyboardAvoidingView: "keyboard-viewport",
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", TextInput: "input", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));

let root: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.accounts = [{ minorUnits: 8_500_000_00 }];
  state.currency = "COP";
  state.hasLimit = false;
  state.balancesLoading = false;
  state.budgetLoading = false;
  state.inboxCount = 0;
  alertJars = [];
  vi.clearAllMocks();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => { root = create(createElement(Index)); });
}
function texts() {
  return root.root.findAllByType("text").map((node) => node.children.join(""));
}
function button(label: string) {
  const found = root.root.findAllByType("button").find((node) => node.props.accessibilityLabel === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}

test.each([
  { accounts: [{ minorUnits: 100 }], hasLimit: false, level: 0 },
  { accounts: [{ minorUnits: 100 }, { minorUnits: 0 }], hasLimit: false, level: 1 },
  { accounts: [{ minorUnits: 100 }, { minorUnits: 0 }, { minorUnits: -100 }], hasLimit: false, level: 1 },
  { accounts: [{ minorUnits: 100 }], hasLimit: true, level: 1 },
  { accounts: [], hasLimit: false, level: 0 },
])("Home level $level with $accounts and category limit $hasLimit", async ({ accounts, hasLimit, level }) => {
  state.accounts = accounts;
  state.hasLimit = hasLimit;
  await render();
  const bells = root.root.findAll((node) => String(node.type) === "icon").filter((node) => node.props.name === "notifications-outline");
  expect(bells).toHaveLength(level);
  expect(texts().includes("Plans")).toBe(level === 1);
  expect(texts().includes("October budget and recovery")).toBe(level === 1);
});

test("level 0 renders balance and prototype copy, with only the user header action", async () => {
  await render();
  expect(texts()).toEqual([
    "THIS MONTH", "What you have now", "COP 8.500.000", "One pool · See this place",
    "Drafts", "Nothing waiting", "Overview", "This month, by category",
    "What do you want to do?", "Create a place", "Another pocket for money", "Create a tx", "Post money",
  ]);
  expect(root.root.findAll((node) => node.props.accessibilityRole === "progressbar")).toHaveLength(0);
  await act(async () => button("Open user and workspace").props.onPress());
  expect(state.push.mock.calls).toEqual([["/settings"]]);
});

test("balances net across places and captions, tiles, bell and Plans open their destinations", async () => {
  state.accounts = [{ minorUnits: 500_00 }, { minorUnits: 250_00 }, { minorUnits: -100_00 }];
  state.inboxCount = 3;
  await render();
  expect(texts()).toContain("COP 650");
  expect(texts()).toContain("Across 3 places");
  expect(texts()).toContain("3 to review");
  expect(texts().filter((value) => value === "3")).toHaveLength(1);
  const captions = root.root.findAllByType("button").filter((node) => node.props.accessibilityLabel === "See places");
  expect(captions).toHaveLength(2);
  for (const caption of captions) await act(async () => caption.props.onPress());
  for (const label of ["Drafts, 3 to review", "Overview, This month, by category", "Alerts, nothing needs attention", "Plans, October budget and recovery"])
    await act(async () => button(label).props.onPress());
  expect(state.push.mock.calls).toEqual([["/places"], ["/places"], ["/drafts"], ["/overview"], ["/alerts"], ["/plans"]]);
  expect(state.query.mock.calls[0]?.[1]).toEqual({ workspaceId: "workspace", month: "2026-10" });
});

test.each([0, undefined])("Drafts has no badge for count %s", async (count) => {
  state.inboxCount = count;
  await render();
  expect(texts()).toContain("Nothing waiting");
  expect(texts()).not.toContain("0");
});

test("amount opens a pan-to-close sheet, dismissal stays home, and choices open setup or Post", async () => {
  await render();
  await act(async () => button("What do you want to do?").props.onPress());
  expect(state.present).toHaveBeenCalledOnce();
  const sheet = root.root.find((node) => String(node.type) === "sheet");
  expect(sheet.props.enablePanDownToClose).toBe(true);
  const backdrop = sheet.props.backdropComponent({});
  expect(backdrop.props).toMatchObject({ appearsOnIndex: 0, disappearsOnIndex: -1 });
  expect(sheet.props.onDismiss).toBeUndefined();
  expect(state.push).not.toHaveBeenCalled();
  await act(async () => button("Create a place, Another pocket for money").props.onPress());
  expect(state.dismiss).toHaveBeenCalledOnce();
  expect(root.root.findAll((node) => String(node.type) === "place-setup")).toHaveLength(1);
  await act(async () => root.root.find((node) => String(node.type) === "place-setup").props.onClose());
  expect(root.root.findAll((node) => String(node.type) === "place-setup")).toHaveLength(0);
  expect(state.push).not.toHaveBeenCalled();
  await act(async () => button("Create a tx, Post money").props.onPress());
  expect(state.push.mock.calls).toEqual([["/post"]]);
});

test("balance loading does not show a fake zero, while two places unlock before limits load", async () => {
  state.balancesLoading = true;
  state.budgetLoading = true;
  await render();
  expect(texts()).not.toContain("COP 0");
  expect(root.root.findAll((node) => String(node.type) === "spinner")).toHaveLength(1);
  state.balancesLoading = false;
  state.accounts = [{ minorUnits: 100 }, { minorUnits: 200 }];
  await act(async () => root.update(createElement(Index)));
  expect(texts()).toContain("Plans");
});


test("Home retains USD cents in the real balance total", async () => {
  state.currency = "USD";
  state.accounts = [{ minorUnits: 100_25 }, { minorUnits: 20_10, nature: "Liability" }];
  await render();
  expect(texts()).toContain("USD 80,15");
});

test("a liability balance reduces what you have instead of increasing it", async () => {
  state.accounts = [
    { minorUnits: 500_00, nature: "Asset" },
    { minorUnits: 250_00, nature: "Liability" },
  ];
  await render();
  expect(texts()).toContain("COP 250");
  expect(texts()).not.toContain("COP 750");
});

test.each([
  { count: 1, title: "Food is over its limit", detail: "COP 50 over" },
  { count: 2, title: "2 categories are over their limits", detail: "COP 125 over in total" },
])("Home summarizes $count categories and the bell carries the same count", async ({ count, title, detail }) => {
  alertJars = [{ category: { id: "food", name: "Food", emoji: "🍋" },
    limitMinorUnits: 100_00, consumptionMinorUnits: 150_00 }];
  if (count === 2) alertJars.push({ category: { id: "travel", name: "Travel", emoji: "🚕" },
    limitMinorUnits: 100_00, consumptionMinorUnits: 175_00 });
  await render();
  expect(texts()).toContain(title);
  expect(texts()).toContain(detail);
  const bell = button(`Alerts, ${count} over the limit`);
  expect(bell.findAllByType("text").map((node) => node.children.join(""))).toEqual([String(count)]);
  const summary = button(`${title}, ${detail}`);
  expect(root.root.findAllByType("button").filter((node) => node.props.accessibilityLabel === `${title}, ${detail}`)).toHaveLength(1);
  await act(async () => bell.props.onPress());
  await act(async () => summary.props.onPress());
  expect(state.push.mock.calls).toEqual([["/alerts"], ["/alerts"]]);

  alertJars = alertJars.map((jar) => ({ ...jar, consumptionMinorUnits: jar.limitMinorUnits }));
  await act(async () => root.update(createElement(Index)));
  expect(texts()).not.toContain(title);
  expect(button("Alerts, nothing needs attention").findAllByType("text")).toHaveLength(0);
});
