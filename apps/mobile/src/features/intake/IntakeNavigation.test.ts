import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import IntakeRoute from "../../../app/intake";
import SettingsRoute from "../../../app/settings";
import { IntakeSetup } from "./IntakeSetup";

const route = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), state: "ready" }));
vi.mock("expo-router", () => ({ router: { push: route.push, back: route.back }, Redirect: "redirect" }));
vi.mock("./IntakeSetup", () => ({ IntakeSetup: "intake" }));
vi.mock("../activity", () => ({ usePersonalDefaults: () => route.state === "loading" ? undefined : route.state === "missing" ? null : {
  workspace: { id: "current-workspace", kind: "Personal", functionalCurrency: "COP" },
} }));
vi.mock("convex/react", () => ({ useQuery: () => [] }));
vi.mock("@clerk/expo", () => ({ useClerk: () => ({ signOut: vi.fn() }), useUser: () => ({ user: { firstName: "Owner" } }) }));
vi.mock("../../ui/Brand", () => ({ BrandLogo: "logo" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("react-native", () => ({
  Platform: { OS: "android" }, KeyboardAvoidingView: "keyboard-viewport",
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", TextInput: "input", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));
let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  route.push.mockClear(); route.back.mockClear(); route.state = "ready";
});
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });

test("Settings opens the canonical intake route", async () => {
  await act(async () => { root = create(createElement(SettingsRoute)); });
  const entry = root?.root.findAllByType("button").find((node) => node.findAllByType("text").some((text) => text.children.join("") === "Notification intake"));
  if (!entry) throw new Error("No Settings intake entry");
  await act(async () => entry.props.onPress());
  expect(route.push).toHaveBeenCalledExactlyOnceWith("/intake");
});

test("the intake route binds the current workspace and opens the existing inbox", async () => {
  await act(async () => { root = create(createElement(IntakeRoute)); });
  const setup = root?.root.findByType(IntakeSetup);
  expect(setup?.props.workspaceId).toBe("current-workspace");
  await act(async () => setup?.props.onInbox());
  await act(async () => setup?.props.onBack());
  expect(route.push).toHaveBeenCalledExactlyOnceWith("/drafts"); expect(route.back).toHaveBeenCalledOnce();
});

test("missing or loading defaults never invent a workspace", async () => {
  route.state = "loading";
  await act(async () => { root = create(createElement(IntakeRoute)); });
  expect(root?.root.findAllByType(IntakeSetup)).toHaveLength(0);
  route.state = "missing";
  await act(async () => root?.update(createElement(IntakeRoute)));
  expect(root?.root.find((node) => String(node.type) === "redirect").props.href).toBe("/");
});
