import * as React from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { createElement } from "react";
import { ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { getFunctionName, type FunctionReturnType } from "convex/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import AlertsRoute from "../../../app/alerts";
import type { api } from "../api";
import { theme } from "../../ui/core";

const state = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), query: vi.fn(),
  calendar: vi.fn(), month: "2026-10" }));
let evaluation: FunctionReturnType<typeof api.budget.evaluate> | undefined;
let defaults: "ready" | "loading" | "missing" = "ready";
vi.mock("convex/react", () => ({ useQuery: state.query }));
vi.mock("expo-router", () => ({ router: { push: state.push, back: state.back }, Redirect: "redirect" }));
vi.mock("../activity", () => ({ usePersonalDefaults: () => defaults === "loading" ? undefined : defaults === "missing" ? null : {
  workspace: { id: "workspace", timeZone: "America/Bogota" },
} }));
vi.mock("../useWorkspaceCalendar", () => ({ useWorkspaceCalendar: (timeZone: string) => {
  state.calendar(timeZone); return { month: state.month };
} }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("react-native", () => ({
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));

let root: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  defaults = "ready";
  state.month = "2026-10";
  evaluation = { currency: "COP", month: "2026-10", currentMonth: "2026-10", totalsOverlap: true,
    jars: [], availableCategories: [{ id: "unlimited", name: "Unlimited", emoji: "🏷️" }] };
  state.query.mockImplementation((reference) => {
    if (getFunctionName(reference) !== "budget:evaluate") throw new Error(`Unexpected query ${getFunctionName(reference)}`);
    return evaluation;
  });
});
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.unstubAllGlobals();
});
function texts() { return root.root.findAllByType("text").map((node) => node.children.join("")); }
async function render() { await act(async () => { root = create(createElement(AlertsRoute)); }); }
async function update() { await act(async () => root.update(createElement(AlertsRoute))); }

test("empty Alerts has the fixed header, positive check row, and only Back is a button", async () => {
  await render();
  expect(texts()).toEqual(["WHAT NEEDS ATTENTION", "Alerts", "Nothing crossed a line", "Limits are still holding"]);
  const buttons = root.root.findAllByType("button");
  expect(buttons).toHaveLength(1);
  expect(buttons[0].props.accessibilityLabel).toBe("Back");
  const check = root.root.findAllByType(Ionicons).find((node) => node.props.name === "checkmark-circle-outline");
  expect(check?.props.color).toBe(theme.positive);
  await act(async () => buttons[0].props.onPress());
  expect(state.back.mock.calls).toEqual([[]]);
  expect(state.push.mock.calls).toEqual([]);
});

test.each([1, 2])("%i category alerts use warning rows and open their own category looks", async (count) => {
  if (!evaluation) throw new Error("Expected evaluation");
  evaluation.jars = [{ category: { id: "food", name: "Food", emoji: "🍋" }, revisionId: "food-limit",
    consumptionMinorUnits: 150_00, limitMinorUnits: 100_00 }];
  if (count === 2) evaluation.jars.push({ category: { id: "travel", name: "Travel", emoji: "🚕" }, revisionId: "travel-limit",
    consumptionMinorUnits: 175_00, limitMinorUnits: 100_00 });
  await render();
  expect(texts()).toEqual([
    "WHAT NEEDS ATTENTION", "Alerts",
    ...(count === 2 ? ["🚕  Travel is over", "COP 175 of COP 100", "Now"] : []),
    "🍋  Food is over", "COP 150 of COP 100", "Now",
  ]);
  expect(root.root.findAllByType(Ionicons).filter((node) => node.props.name === "flag-outline").map((node) => node.props.color))
    .toEqual(Array(count).fill(theme.warning));
  for (const value of root.root.findAllByType("text").filter((node) => node.children.join("") === "Now"))
    expect(value.props.style).toContainEqual({ color: theme.warning });
  for (const row of root.root.findAllByType("button").filter((node) => node.props.accessibilityLabel !== "Back"))
    await act(async () => row.props.onPress());
  expect(state.push.mock.calls).toEqual([
    ...(count === 2 ? [[{ pathname: "/category-look", params: { categoryId: "travel" } }]] : []),
    [{ pathname: "/category-look", params: { categoryId: "food" } }],
  ]);
  evaluation.jars = [];
  await update();
  expect(texts()).toContain("Nothing crossed a line");
  expect(texts()).not.toContain("Now");
});

test("loading waits for Convex and queries the workspace's calendar month as it changes", async () => {
  const ready = evaluation;
  evaluation = undefined;
  await render();
  expect(root.root.findByType(ActivityIndicator).props.accessibilityLabel).toBe("Loading alerts");
  expect(texts()).toEqual(["WHAT NEEDS ATTENTION", "Alerts"]);
  evaluation = ready;
  state.month = "2026-11";
  await update();
  expect(texts()).toContain("Nothing crossed a line");
  expect(state.query.mock.calls.map(([reference, args]) => [getFunctionName(reference), args])).toEqual([
    ["budget:evaluate", { workspaceId: "workspace", month: "2026-10" }],
    ["budget:evaluate", { workspaceId: "workspace", month: "2026-11" }],
  ]);
  expect(state.calendar.mock.calls).toEqual([["America/Bogota"], ["America/Bogota"]]);
});

test("unknown defaults wait and absent defaults redirect home", async () => {
  defaults = "loading";
  await render();
  expect(root.root.findAllByType(ActivityIndicator)).toHaveLength(1);
  expect(state.query).not.toHaveBeenCalled();
  defaults = "missing";
  await update();
  expect(root.root.findByType(Redirect).props.href).toBe("/");
});
