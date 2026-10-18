import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { Place } from "./model";

const state = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), accounts: [] as Place[], hasLimit: false }));
vi.mock("expo-router", () => ({ router: { push: state.push, back: state.back }, Redirect: "redirect" }));
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));
vi.mock("convex/react", () => ({ useQuery: () => ({ jars: state.hasLimit ? [{}] : [] }) }));
vi.mock("../useWorkspaceCalendar", () => ({ useWorkspaceCalendar: () => ({ month: "2026-10" }) }));
vi.mock("../HomePlaceSetup", () => ({ HomePlaceSetup: "add-place" }));
vi.mock("../activity", () => ({
  usePersonalDefaults: () => ({ workspace: { id: "ws", functionalCurrency: "COP", timeZone: "America/Bogota" },
    financialAccountProfile: { id: "daily" } }),
  usePostedActivity: () => ({ accounts: state.accounts }),
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native", () => ({ Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 } }));
import PlacesRoute from "../../../app/places";
let root: ReactTestRenderer;
const daily: Place = { financialAccountProfileId: "daily", name: "Daily", nature: "Asset", productKind: "bankAccount",
  trackingFrom: "2026-09-24", balance: { currency: "COP", minorUnits: 10000 } };
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks(); state.accounts = [daily]; state.hasLimit = false;
});
afterEach(async () => { await act(async () => root?.unmount()); vi.unstubAllGlobals(); });
async function render() { await act(async () => { root = create(createElement(PlacesRoute)); }); }
function texts() { return root.root.findAllByType("text").map((node) => node.children.join("")); }
function button(label: string) {
  const found = root.root.findAllByType("button").find((node) => node.props.accessibilityLabel === label);
  if (!found) throw new Error(`Missing button ${label}`); return found;
}
test("one pool matches the prototype and row and receipt have separate destinations", async () => {
  await render();
  expect(texts()).toEqual(["ONE POOL", "My money", "What you have now", "COP 100",
    "Bank and pocket are still one pool. Add a place when money lives apart.", "💰", "Daily", "COP 100", "Add another place"]);
  await act(async () => button("Daily").props.onPress());
  await act(async () => button("Tx history for Daily").props.onPress());
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
  expect(texts()).toContain("My money"); expect(state.push).not.toHaveBeenCalled();
  await act(async () => sheet.props.onClose());
  expect(root.root.findAll((node) => String(node.type) === "add-place")).toHaveLength(0);
});
