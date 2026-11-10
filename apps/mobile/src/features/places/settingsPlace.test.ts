import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ profiles: [] as { id: string; name: string }[] }));
vi.mock("expo-router", () => ({ router: { push: vi.fn(), back: vi.fn() }, Redirect: "redirect" }));
vi.mock("../activity", () => ({
  usePersonalDefaults: () => ({ workspace: { id: "ws", kind: "Personal", functionalCurrency: "COP", timeZone: "America/Bogota" } }),
}));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return { useQuery: (ref: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(ref) === "accounting:listFinancialAccountProfiles" ? state.profiles : [] };
});
vi.mock("@clerk/expo", () => ({ useClerk: () => ({ signOut: vi.fn() }), useUser: () => ({ user: { firstName: "Owner" } }) }));
vi.mock("../../ui/Brand", () => ({ BrandLogo: "logo" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("expo-secure-store", () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" }, KeyboardAvoidingView: "keyboard-viewport",
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));
import SettingsRoute from "../../../app/settings";
import { LanguageProvider } from "../../i18n";

let root: ReactTestRenderer | undefined;
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });

test.each([
  { language: "en" as const, profiles: [{ id: "daily", name: "My money" }], detail: "Personal · COP · My money" },
  { language: "es" as const, profiles: [{ id: "daily", name: "My money" }], detail: "Personal · COP · Mi plata" },
  { language: "es" as const, profiles: [{ id: "daily", name: "Everyday" }], detail: "Personal · COP · Everyday" },
  { language: "en" as const, profiles: [{ id: "daily", name: "My money" }, { id: "savings", name: "Savings" }], detail: "Personal · COP · 2 places" },
])("My finances reads $detail in $language", async ({ language, profiles, detail }) => {
  state.profiles = profiles;
  await act(async () => {
    root = create(createElement(LanguageProvider, { initialPreference: language }, createElement(SettingsRoute)));
  });
  const row = root?.root.find((node) => node.props.icon === "home-outline" && typeof node.props.onPress === "function");
  expect(row?.props.detail).toBe(detail);
});
