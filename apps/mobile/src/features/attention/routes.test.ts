import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import HomeRoute from "../../../app/index";
import AlertsRoute from "../../../app/alerts";
import { AlertsScreen } from "./AlertsScreen";
import { attentionRows, type AttentionState } from "./model";
import { evaluateMonthClose } from "../monthClose/model";

const state = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  attention: { inboxCount: 7 as number | undefined, alerts: { kind: "loading" } as AttentionState },
  currency: "COP",
}));
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));
vi.mock("expo-router", () => ({
  router: { push: state.push, back: state.back },
  useLocalSearchParams: () => ({}),
  Redirect: "redirect",
}));
vi.mock("@gorhom/bottom-sheet", () => ({ BottomSheetModal: "sheet", BottomSheetView: "sheet-view" }));
vi.mock("../activity", () => ({
  usePersonalDefaults: () => ({ workspace: {
    id: "workspace", functionalCurrency: state.currency, timeZone: "America/Bogota",
    currentAccountingPeriod: { year: 2026, month: 10, status: "open" },
  } }),
  usePostedActivity: () => ({ monthSpendMinorUnits: 100_001 }),
}));
vi.mock("./useAttention", () => ({ useAttention: () => state.attention }));
vi.mock("../Setup", () => ({ Setup: "setup" }));
vi.mock("../useWorkspaceCalendar", () => ({
  useWorkspaceCalendar: () => ({ date: "2026-10-17", month: "2026-10", now: Date.UTC(2026, 9, 17, 12) }),
}));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("react-native", () => ({
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", TextInput: "input", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));

let root: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.currency = "COP";
  state.attention = { inboxCount: 7, alerts: { kind: "loading" } };
  state.push.mockClear();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.unstubAllGlobals();
});
function text() {
  return root.root.findAllByType("text").map((node) => node.children.join("")).join("\n");
}
function button(label: string) {
  const found = root.root.findAllByType("button").find((node) => node.props.accessibilityLabel === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}

test("Home pace reveals whole pesos in side by side columns, and hides them on a second tap", async () => {
  await act(async () => { root = create(createElement(HomeRoute)); });
  expect(text()).not.toContain("On pace for");
  await act(async () => button("Show month pace details").props.onPress());
  expect(text()).toContain("Day 17 of 31");
  expect(text()).toContain("On pace for\nCOP 1.824");
  expect(button("Show month pace details").props.accessibilityState).toEqual({ expanded: true });
  const day = root.root.findAllByType("text").find((node) => node.children.join("") === "Day 17 of 31");
  expect(day?.parent?.props.style.flexDirection).toBe("row");
  await act(async () => button("Show month pace details").props.onPress());
  expect(button("Show month pace details").props.accessibilityState).toEqual({ expanded: false });
  expect(text()).not.toContain("On pace for");
});

test("Home retains USD cents and opens the live Drafts and Alerts destinations", async () => {
  state.currency = "USD";
  await act(async () => { root = create(createElement(HomeRoute)); });
  await act(async () => button("Show month pace details").props.onPress());
  expect(text()).toContain("On pace for\nUSD 1.823,55");
  const badge = root.root.findAllByType("text").find((node) => node.children.join("") === "7");
  const badgeStyle = Object.assign({}, ...badge?.parent?.props.style);
  expect(badgeStyle).toMatchObject({ position: "absolute", top: 16, right: 16 });
  await act(async () => button("Drafts, 7, On this device").props.onPress());
  await act(async () => button("Alerts, Loading updates").props.onPress());
  expect(state.push.mock.calls).toEqual([["/drafts"], ["/alerts"]]);
});

test("Home announces the visible live Alerts detail and updates it when attention changes", async () => {
  const rows = attentionRows({
    draftCount: 2, draftSegment: "wait", candidateNowCount: 1, candidateWaitCount: 0,
    plans: [], currency: "COP",
    readiness: evaluateMonthClose({ period: { year: 2026, month: 10 }, periodStatus: "open", draftCount: 1, candidateCount: 1 }),
  });
  state.attention = { inboxCount: 3, alerts: { kind: "ready", rows } };
  await act(async () => { root = create(createElement(HomeRoute)); });
  expect(text()).toContain("3 updates");
  expect(button("Alerts, 3 updates").props.accessibilityRole).toBe("button");
  state.attention = { inboxCount: 0, alerts: { kind: "ready", rows: rows.slice(-1) } };
  await act(async () => { root.update(createElement(HomeRoute)); });
  expect(text()).toContain("1 update");
  await act(async () => button("Alerts, 1 update").props.onPress());
  expect(state.push.mock.calls).toEqual([["/alerts"]]);
});

test("Alerts routes every derived row to an existing workflow and uses the actual update total", async () => {
  const rows = attentionRows({
    draftCount: 2, draftSegment: "wait", candidateNowCount: 1, candidateWaitCount: 3,
    plans: [{ dueMinorUnits: 50_000 }], currency: "COP",
    readiness: evaluateMonthClose({ period: { year: 2026, month: 10 }, periodStatus: "open", draftCount: 1, candidateCount: 2 }),
  });
  state.attention = { inboxCount: 6, alerts: { kind: "ready", rows } };
  await act(async () => { root = create(createElement(AlertsRoute)); });
  expect(text()).toContain("5 UPDATES");
  for (const row of root.root.findAllByType("button").filter((node) => !node.props.accessibilityLabel))
    await act(async () => row.props.onPress());
  expect(state.push.mock.calls).toEqual([
    [{ pathname: "/drafts", params: { segment: "wait" } }],
    [{ pathname: "/drafts", params: { segment: "now" } }],
    [{ pathname: "/drafts", params: { segment: "wait" } }],
    [{ pathname: "/recovery" }],
    [{ pathname: "/month-close", params: { month: "2026-10" } }],
  ]);
});

test("Alerts distinguishes loading, errors with retry, and a confirmed empty result", async () => {
  const props = { onBack: vi.fn(), onOpen: vi.fn(), onRetry: vi.fn() };
  await act(async () => { root = create(createElement(AlertsScreen, { ...props, state: { kind: "loading" } })); });
  expect(root.root.find((node) => String(node.type) === "spinner").props.accessibilityLabel).toBe("Loading alerts");
  expect(text()).not.toContain("Nothing needs attention");
  await act(async () => { root.update(createElement(AlertsScreen, { ...props, state: { kind: "error", message: "Could not load Drafts on this device." } })); });
  expect(text()).toContain("Could not load Drafts on this device.");
  await act(async () => button("Try again").props.onPress());
  expect(props.onRetry.mock.calls).toEqual([[]]);
  await act(async () => { root.update(createElement(AlertsScreen, { ...props, state: { kind: "ready", rows: [] } })); });
  expect(text()).toContain("Nothing needs attention");
  expect(text()).toContain("ALL CAUGHT UP");
});
