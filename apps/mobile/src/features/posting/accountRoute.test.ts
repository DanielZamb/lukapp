import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), changeLook: vi.fn(), recent: vi.fn(), rows: [] as {
  id: string; title: string; date: string; reversed?: boolean; amount: { currency: string; minorUnits: number };
}[] }));
vi.mock("expo-router", () => ({
  router: { push: state.push, back: state.back }, Redirect: "redirect",
  useLocalSearchParams: () => ({ profileId: "card-profile" }),
}));
vi.mock("convex/react", () => ({ useAction: () => state.changeLook }));
vi.mock("../places/EmojiSheet", () => ({ EmojiSheet: "emoji-sheet" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  KeyboardAvoidingView: "keyboard-viewport",
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));
vi.mock("../activity", () => ({
  usePersonalDefaults: () => ({
    workspace: { id: "ws", functionalCurrency: "COP", timeZone: "America/Bogota" },
    financialAccountProfile: { id: "cash-default", name: "My money" },
  }),
  usePostedActivity: () => ({ accounts: [{
    financialAccountProfileId: "card-profile", name: "Card", nature: "Liability", productKind: "creditCard",
    emoji: "💳", trackingFrom: "2026-09-24", balance: { currency: "COP", minorUnits: 10000 },
  }] }),
  useRecentActivity: (...args: unknown[]) => { state.recent(...args); return { page: state.rows }; },
}));
import AccountRoute from "../../../app/account";
let root: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks(); state.rows = [];
});
afterEach(async () => { await act(async () => root?.unmount()); vi.unstubAllGlobals(); });
async function render() { await act(async () => { root = create(createElement(AccountRoute)); }); }
function texts() { return root.root.findAllByType("text").map((node) => node.children.join("")); }
function button(label: string) {
  const found = root.root.findAllByType("button").find((node) => node.props.accessibilityLabel === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}
test("account shows the real place metadata, empty activity and filtered history", async () => {
  await render();
  expect(texts()).toEqual(["PLACE", "Card", "💳", "Current balance", "COP 100", "See in tx history",
    "Type", "Credit card", "Currency", "COP", "Tracking from", "September 24, 2026",
    "Recent activity", "No activity yet", "New entries will appear here"]);
  expect(state.recent).toHaveBeenCalledWith("ws", 3, "card-profile");
  await act(async () => button("See in tx history").props.onPress());
  expect(state.push).toHaveBeenCalledWith({ pathname: "/history", params: { profileId: "card-profile" } });
  await act(async () => button("Back").props.onPress());
  expect(state.back).toHaveBeenCalledOnce();
});
test("recent activity shows at most three descriptions, dates and signed amounts", async () => {
  state.rows = Array.from({ length: 4 }, (_, i) => ({ id: String(i), title: `Entry ${i}`, date: "2026-10-01",
    amount: { currency: "COP", minorUnits: i === 0 ? 12000 : -2000 } }));
  await render();
  expect(texts()).toContain("+COP 120,00"); expect(texts()).toContain("−COP 20,00");
  expect(texts()).toContain("Entry 2"); expect(texts()).not.toContain("Entry 3");
});
test("Change look opens the emoji sheet and saves to the selected Convex profile", async () => {
  await render();
  await act(async () => button("Change look").props.onPress());
  let sheet = root.root.find((node) => String(node.type) === "emoji-sheet");
  expect(sheet.props.emoji).toBe("💳");
  await act(async () => sheet.props.onPick("🐷"));
  sheet = root.root.find((node) => String(node.type) === "emoji-sheet");
  await act(async () => sheet.props.onUse());
  expect(state.changeLook).toHaveBeenCalledWith({ workspaceId: "ws", financialAccountProfileId: "card-profile", emoji: "🐷" });
});

test.each([12000, -2000])("reversed activity is labeled instead of showing signed money (%i)", async (minorUnits) => {
  state.rows = [{ id: "reversed", title: "Old entry", date: "2026-10-01", reversed: true,
    amount: { currency: "COP", minorUnits } }];
  await render();
  expect(texts()).toContain("Old entry");
  expect(texts()).toContain("2026-10-01");
  expect(texts()).toContain("Reversed");
  expect(texts()).not.toContain("+COP 120,00");
  expect(texts()).not.toContain("−COP 20,00");
});
