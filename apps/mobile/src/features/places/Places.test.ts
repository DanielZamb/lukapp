import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Place } from "./model";

const state = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), accounts: [] as Place[], hasLimit: false, defaultId: "daily" }));
vi.mock("expo-router", () => ({ router: { push: state.push, back: state.back }, Redirect: "redirect" }));
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));
vi.mock("convex/react", () => ({ useQuery: () => ({ jars: state.hasLimit ? [{}] : [], removedLimits: [] }) }));
vi.mock("../useWorkspaceCalendar", () => ({ useWorkspaceCalendar: () => ({ month: "2026-10" }) }));
vi.mock("../HomePlaceSetup", () => ({ HomePlaceSetup: "add-place" }));
vi.mock("../activity", () => ({
  usePersonalDefaults: () => ({ workspace: { id: "ws", functionalCurrency: "COP", timeZone: "America/Bogota" },
    financialAccountProfile: { id: state.defaultId } }),
  usePostedActivity: () => ({ accounts: state.accounts }),
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("expo-secure-store", () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  KeyboardAvoidingView: "keyboard-viewport", Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 } }));
import PlacesRoute from "../../../app/places";
import { LanguageProvider } from "../../i18n";
let root: ReactTestRenderer;
const daily: Place = { financialAccountProfileId: "daily", name: "Daily", nature: "Asset", productKind: "bankAccount",
  trackingFrom: "2026-09-24", balance: { currency: "COP", minorUnits: 10000 } };
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks(); state.accounts = [daily]; state.hasLimit = false; state.defaultId = "daily";
});
afterEach(async () => { await act(async () => root?.unmount()); vi.unstubAllGlobals(); });
async function render(language?: "es") {
  await act(async () => {
    root = create(language ? createElement(LanguageProvider, { initialPreference: language }, createElement(PlacesRoute))
      : createElement(PlacesRoute));
  });
}
function texts() { return root.root.findAllByType("text").map((node) => node.children.join("")); }
function button(label: string) {
  const found = root.root.findAllByType("button").find((node) => node.props.accessibilityLabel === label);
  if (!found) throw new Error(`Missing button ${label}`); return found;
}
test("one pool matches the prototype and row and receipt have separate destinations", async () => {
  state.accounts = [{ ...daily, name: "My money" }];
  await render();
  expect(texts()).toEqual(["ONE POOL", "My money", "What you have now", "COP 100",
    "Bank and pocket are still one pool. Add a place when money lives apart.", "💰", "My money", "COP 100", "Add another place"]);
  await act(async () => button("My money").props.onPress());
  await act(async () => button("History for My money").props.onPress());
  expect(state.push.mock.calls).toEqual([
    [{ pathname: "/account", params: { profileId: "daily" } }],
    [{ pathname: "/history", params: { profileId: "daily" } }],
  ]);
  await act(async () => button("Back").props.onPress()); expect(state.back).toHaveBeenCalledOnce();
});
test("several places net liabilities and show custom looks", async () => {
  state.accounts.push({ ...daily, financialAccountProfileId: "card", name: "Card", nature: "Liability", productKind: "creditCard",
    emoji: "✨", balance: { currency: "COP", minorUnits: 2500 } });
  await render();
  expect(texts().slice(0, 5)).toEqual(["YOUR PLACES", "Places", "What you have now", "COP 75", "Across 2 places"]);
  expect(texts()).toContain("✨");
});
test.each([false, true])("Add another place opens the sheet above places with limit %s", async (hasLimit) => {
  state.hasLimit = hasLimit;
  await render(); await act(async () => button("Add another place").props.onPress());
  const sheet = root.root.find((node) => String(node.type) === "add-place");
  expect(sheet.props.unlocking).toBe(!hasLimit);
  expect(texts()).toContain("ONE POOL"); expect(state.push).not.toHaveBeenCalled();
  await act(async () => sheet.props.onClose());
  expect(root.root.findAll((node) => String(node.type) === "add-place")).toHaveLength(0);
});
test.each([
  { language: undefined, name: "My money", title: "My money" },
  { language: "es" as const, name: "My money", title: "Mi plata" },
  { language: undefined, name: "Daily", title: "Daily" },
  { language: "es" as const, name: "Daily", title: "Daily" },
])("a sole place named $name is titled $title in $language", async ({ language, name, title }) => {
  state.accounts = [{ ...daily, name }];
  await render(language);
  expect(texts().slice(0, 2)).toEqual([language === "es" ? "TODO JUNTO" : "ONE POOL", title]);
  expect(button(title).findAllByType("text").map((node) => node.children.join(""))).toEqual(["💰", title, "COP 100"]);
});
test("with several places a place still named My money shows its stored name in Spanish", async () => {
  state.accounts = [{ ...daily, name: "My money" }, { ...daily, financialAccountProfileId: "savings", name: "Ahorros" }];
  await render("es");
  expect(texts().slice(0, 2)).toEqual(["TUS LUGARES", "Lugares"]);
  expect(texts()).toContain("My money");
  expect(texts()).not.toContain("Mi plata");
});
test.each([
  { language: undefined, places: 1, title: "My money" },
  { language: "es" as const, places: 1, title: "Mi plata" },
  { language: undefined, places: 2, title: "Mi plata" },
])("a place set up in Spanish as Mi plata follows the app language only while it is the sole place ($places, $language)",
  async ({ language, places, title }) => {
    state.accounts = [{ ...daily, name: "Mi plata" }, ...(places === 2 ? [{ ...daily, financialAccountProfileId: "savings", name: "Ahorros" }] : [])];
    await render(language);
    expect(button(places === 2 ? `${title}, default place` : title).findAllByType("text").map((node) => node.children.join(""))[1])
      .toBe(title);
  });
test("the Places page reads in Spanish around the stored place names", async () => {
  state.accounts.push({ ...daily, financialAccountProfileId: "card", name: "Visa", nature: "Liability", productKind: "creditCard",
    balance: { currency: "COP", minorUnits: 2500 } });
  await render("es");
  expect(texts()).toEqual(["TUS LUGARES", "Lugares", "Lo que tienes hoy", "COP 75", "En 2 lugares",
    "💰", "Daily", "Por defecto", "COP 100", "💳", "Visa", "COP 25", "Agregar otro lugar"]);
  expect(button("Historial de Visa")).toBeDefined();
  state.accounts = [{ ...daily, name: "My money" }];
  await act(async () => root.unmount());
  await render("es");
  expect(texts()).toContain("Lo del banco y el efectivo todavía van juntos. Agrega un lugar cuando tengas plata aparte.");
  const visible = texts().join("\n");
  for (const english of ["What you have now", "Add another place", "ONE POOL", "Bank and pocket", "My money"]) {
    expect(visible).not.toContain(english);
  }
});
test.each([
  { language: undefined, badge: "Default", a11y: "Card, default place" },
  { language: "es" as const, badge: "Por defecto", a11y: "Card, lugar por defecto" },
])("with several places only the current default place carries a quiet label ($badge) and no way to change it", async ({ language, badge, a11y }) => {
  state.accounts.push({ ...daily, financialAccountProfileId: "card", name: "Card" });
  state.defaultId = "card";
  await render(language);
  expect(button(a11y).findAllByType("text").map((node) => node.children.join(""))).toEqual(["💰", "Card", badge, "COP 100"]);
  expect(button("Daily").findAllByType("text").map((node) => node.children.join(""))).toEqual(["💰", "Daily", "COP 100"]);
  expect(texts().filter((text) => text === badge)).toEqual([badge]);
  await act(async () => button(a11y).props.onPress());
  expect(state.push.mock.calls).toEqual([[{ pathname: "/account", params: { profileId: "card" } }]]);
});
test("a sole place carries no default label", async () => {
  await render();
  expect(button("Daily").findAllByType("text").map((node) => node.children.join(""))).toEqual(["💰", "Daily", "COP 100"]);
  expect(texts()).not.toContain("Default");
});
