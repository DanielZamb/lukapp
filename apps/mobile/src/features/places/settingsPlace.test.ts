import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ profiles: [] as { id: string; name: string }[] }));
const router = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }));
vi.mock("expo-router", () => ({ router, Redirect: "redirect" }));
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
import { ThemeProvider } from "../../ui/themeContext";

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

test("a sole place stored with the Spanish setup name follows the app language in My finances", async () => {
  state.profiles = [{ id: "daily", name: "Mi plata" }];
  for (const [language, detail] of [["en", "Personal · COP · My money"], ["es", "Personal · COP · Mi plata"]] as const) {
    await act(async () => {
      root = create(createElement(LanguageProvider, { initialPreference: language }, createElement(SettingsRoute)));
    });
    expect(root?.root.find((node) => node.props.icon === "home-outline" && typeof node.props.onPress === "function").props.detail)
      .toBe(detail);
    await act(async () => root?.unmount());
  }
  root = undefined;
});

test.each([
  { reflow: false, direction: "row" },
  { reflow: true, direction: "column" },
])("Spanish Appearance and Language choices stack at the largest text size (reflow $reflow)", async ({ reflow, direction }) => {
  state.profiles = [{ id: "daily", name: "Mi plata" }];
  await act(async () => {
    root = create(createElement(ThemeProvider, { layout: { tier: reflow ? "reflow" as const : "default" as const, reflow, pagePadding: 16, touchTarget: 44 } },
      createElement(LanguageProvider, { initialPreference: "es" }, createElement(SettingsRoute))));
  });
  const radios = root!.root.findAll((node) => node.type === "button" && node.props.accessibilityRole === "radio");
  const labels = radios.map((radio) => radio.findAllByType("text" as never).map((text) => text.children.join("")).join(""));
  expect(labels).toEqual(["Claro", "Oscuro", "Del celular", "English", "Español"]);
  const groups = new Set(radios.map((radio) => radio.parent!));
  expect(groups.size).toBe(2);
  for (const group of groups) expect(flatten(group.props.style).flexDirection).toBe(direction);
  for (const radio of radios) {
    const style = flatten(radio.props.style);
    expect(style.flexBasis).toBe(reflow ? undefined : radio.props.accessibilityLabel ? "30%" : undefined);
    expect(style.flex).toBe(reflow ? undefined : 1);
  }
});

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return style && typeof style === "object" ? style as Record<string, unknown> : {};
}

test.each([
  { language: "en" as const, title: "Workspace", detail: "Default place, time zone and currency" },
  { language: "es" as const, title: "Espacio", detail: "Lugar por defecto, zona horaria y moneda" },
])("the $title row opens the workspace screen and nothing else each time", async ({ language, title, detail }) => {
  router.push.mockClear();
  state.profiles = [{ id: "daily", name: "Daily" }];
  await act(async () => {
    root = create(createElement(LanguageProvider, { initialPreference: language }, createElement(SettingsRoute)));
  });
  const row = root!.root.find((node) => node.props.title === title && typeof node.props.onPress === "function");
  expect(row.props.detail).toBe(detail);
  await act(async () => row.props.onPress());
  await act(async () => row.props.onPress());
  expect(router.push.mock.calls).toEqual([["/workspace"], ["/workspace"]]);
  expect(router.back).not.toHaveBeenCalled();
});
