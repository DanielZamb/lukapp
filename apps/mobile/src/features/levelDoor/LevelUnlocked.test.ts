import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import LevelUnlockedRoute from "../../../app/level-unlocked";
import { experienceLevel } from "./model";
import { LanguageProvider } from "../../i18n";

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
  Platform: { OS: "ios" },
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
    `${name} is ready. You can now move money between places and set a limit on any category.`,
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

test.each([
  { lang: "en" as const, category: "Delivery", texts: ["Limit is on", "🛵", "Delivery · Spend nothing",
    "Alerts will watch this line. You can add another place whenever money lives in more than one.", "Back to the month"] },
  { lang: "es" as const, category: "Domicilios", texts: ["Tope activado", "🛵", "Domicilios · Sin gastos",
    "Las alertas van a vigilar este tope. Puedes agregar otro lugar cuando tengas plata en más de uno.", "Volver al mes"] },
])("a spend-nothing first limit unlocks with its own wording in $lang", async ({ lang, category, texts: expected }) => {
  state.params = { door: "budget", category, emoji: "🛵", color: "#047857", currency: "COP", limitMinorUnits: "0" };
  await act(async () => {
    root = create(createElement(LanguageProvider, { initialPreference: lang }, createElement(LevelUnlockedRoute)));
  });
  expect(texts()).toEqual(expected);
});

test.each([{}, { door: "ask" }, { door: "budget", limitMinorUnits: "no" },
  { door: "budget", category: "Food", emoji: "🍋", color: "#047857", currency: "COP", limitMinorUnits: "-1" },
])("an incomplete unlock link returns home (%j)", async (params) => {
  await render(params);
  expect(root.root.find((node) => String(node.type) === "redirect").props.href).toBe("/");
});

test.each([
  { accounts: 1, limits: 0, removed: 0, level: 0 },
  { accounts: 2, limits: 0, removed: 0, level: 1 },
  { accounts: 3, limits: 0, removed: 0, level: 1 },
  { accounts: 1, limits: 1, removed: 0, level: 1 },
  { accounts: 1, limits: 2, removed: 0, level: 1 },
  { accounts: 2, limits: 1, removed: 0, level: 1 },
  { accounts: 1, limits: 0, removed: 1, level: 1 },
])("level derives from $accounts accounts, $limits limits and $removed removed limits", ({ accounts, limits, removed, level }) => {
  const budget = { jars: Array.from({ length: limits }, () => ({})), removedLimits: Array.from({ length: removed }, () => ({})) };
  expect(experienceLevel(accounts, budget)).toBe(level);
  expect(experienceLevel(accounts, undefined)).toBe(accounts >= 2 ? 1 : 0);
});

test.each([
  { params: { door: "account", accountName: "Ahorros Bancolombia" }, expected: [
    "Un segundo lugar",
    "Ya tienes Ahorros Bancolombia. Ahora puedes pasar plata entre lugares y ponerle tope a cualquier categoría.",
    "Volver al mes",
  ] },
  { params: { door: "account" }, expected: [
    "Un segundo lugar",
    "Ya tienes El lugar nuevo. Ahora puedes pasar plata entre lugares y ponerle tope a cualquier categoría.",
    "Volver al mes",
  ] },
  { params: { door: "budget", category: "Mercado", emoji: "🍋", color: "#047857", currency: "COP", limitMinorUnits: "150000000" }, expected: [
    "Tope activado", "🍋", "Mercado · COP 1.500.000",
    "Las alertas van a vigilar este tope. Puedes agregar otro lugar cuando tengas plata en más de uno.", "Volver al mes",
  ] },
])("the $params.door door reads in Spanish and keeps the stored name", async ({ params, expected }) => {
  state.params = params;
  await act(async () => {
    root = create(createElement(LanguageProvider, { initialPreference: "es" }, createElement(LevelUnlockedRoute)));
  });
  expect(texts()).toEqual(expected);
  expect(root.root.findAllByType("button").map((node) => node.props.accessibilityLabel)).toEqual(["Volver al mes"]);
});
