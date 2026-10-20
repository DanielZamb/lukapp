import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import LevelUnlockedRoute from "../../../app/level-unlocked";
import { experienceLevel } from "./model";

const state = vi.hoisted(() => {
  const params: Record<string, unknown> = {};
  return { params, reset: vi.fn() };
});
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => state.params, useNavigation: () => ({ dispatch: state.reset }), Redirect: "redirect",
}));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("react-native", () => ({
  KeyboardAvoidingView: "keyboard-viewport",
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));

let root: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
});
afterEach(async () => { await act(async () => root?.unmount()); vi.unstubAllGlobals(); });
async function render(params: Record<string, unknown>) {
  state.params = params;
  await act(async () => { root = create(createElement(LevelUnlockedRoute)); });
}
function texts() { return root.root.findAllByType("text").map((node) => node.children.join("")); }

test.each([
  { accountName: "Travel", name: "Travel" },
  { accountName: undefined, name: "The new place" },
  { accountName: "  ", name: "The new place" },
])("the account door uses the saved name $name with one way home", async ({ accountName, name }) => {
  await render({ door: "account", accountName });
  expect(texts()).toEqual([
    "A second place",
    `${name} is live. Moving money between places is now a thing, and any category can take a limit.`,
    "Back to the month",
  ]);
  expect(root.root.findAll((node) => String(node.type) === "icon").map((node) => node.props.name)).toEqual(["checkmark", "home-outline"]);
  const title = root.root.findByProps({ accessibilityRole: "header" });
  expect(title.parent?.children.slice(0, 2).map((node) => typeof node === "string" ? node : String(node.type))).toEqual(["view", "text"]);
  const buttons = root.root.findAllByType("button");
  expect(buttons).toHaveLength(1);
  expect(buttons[0].props.accessibilityLabel).toBe("Back to the month");
  await act(async () => buttons[0].props.onPress());
  expect(state.reset.mock.calls).toEqual([[{ type: "RESET", payload: { index: 0, routes: [{ name: "index" }] } }]]);
});

test("the limit door shows its saved look, currency-code amount and alerts copy", async () => {
  await render({ door: "budget", category: "Food", emoji: "🍋", color: "#047857", currency: "COP", limitMinorUnits: "150000000" });
  expect(texts()).toEqual([
    "Limit is on", "🍋", "Food · COP 1.500.000",
    "Alerts will watch this line. You can add another place whenever money lives in more than one.", "Back to the month",
  ]);
  const chip = root.root.findAllByType("view").find((node) => Array.isArray(node.props.style) && node.props.style[1]?.borderColor === "#047857");
  expect(chip?.props.style[1]).toEqual({ backgroundColor: "#04785724", borderColor: "#047857" });
  expect(root.root.findAllByType("button")).toHaveLength(1);
});

test.each([{}, { door: "ask" }, { door: "budget", limitMinorUnits: "no" }])("an incomplete unlock link returns home (%j)", async (params) => {
  await render(params);
  expect(root.root.find((node) => String(node.type) === "redirect").props.href).toBe("/");
});

test.each([
  { accounts: 1, limits: 0, level: 0 },
  { accounts: 2, limits: 0, level: 1 },
  { accounts: 3, limits: 0, level: 1 },
  { accounts: 1, limits: 1, level: 1 },
  { accounts: 1, limits: 2, level: 1 },
  { accounts: 2, limits: 1, level: 1 },
])("level derives from $accounts accounts and $limits limits", ({ accounts, limits, level }) => {
  expect(experienceLevel(accounts, limits)).toBe(level);
});
