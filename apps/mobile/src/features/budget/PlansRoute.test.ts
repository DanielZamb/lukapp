import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import PlansRoute from "../../../app/plans";

const state = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), timeZone: "America/Bogota" }));
vi.mock("expo-router", () => ({ router: { push: state.push, back: state.back }, Redirect: "Redirect" }));
vi.mock("../activity", () => ({ usePersonalDefaults: () => ({ workspace: { timeZone: state.timeZone } }) }));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", Pressable: "Pressable", Text: "Text", View: "View", ScrollView: "ScrollView",
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "Icon" }));

let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T02:00:00Z"));
  state.timeZone = "America/Bogota";
  state.push.mockClear();
  state.back.mockClear();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("Plans matches the settled landing using the workspace month with separate budget and recovery routes", async () => {
  await act(async () => { root = create(createElement(PlansRoute)); });
  if (!root) throw new Error("Plans not mounted");
  const screen = root.root;
  expect(screen.findAll((node) => String(node.type) === "Text").map((node) => node.children.join(""))).toEqual([
    "LOOKING AHEAD", "Plans", "October budget", "This month's limits", "Savings recovery", "Emergency repair",
    "Budget is the October plan. Recovery is a sibling destination. It is not a budget row.",
  ]);
  expect(screen.findAll((node) => String(node.type) === "Icon").map((node) => node.props.name)).toEqual([
    "chevron-back", "flag-outline", "chevron-forward", "trending-up-outline", "chevron-forward",
  ]);
  await act(async () => {
    screen.findByProps({ accessibilityLabel: "October budget, This month's limits" }).props.onPress();
    screen.findByProps({ accessibilityLabel: "Savings recovery, Emergency repair" }).props.onPress();
    screen.findByProps({ accessibilityLabel: "Back" }).props.onPress();
  });
  expect(state.push.mock.calls).toEqual([["/budget"], ["/recovery"]]);
  expect(state.back).toHaveBeenCalledOnce();
  await act(async () => { vi.advanceTimersByTime(3 * 60 * 60 * 1000 + 1); });
  expect(screen.findAll((node) => String(node.type) === "Text").map((node) => node.children.join(""))).toContain("November budget");
});
