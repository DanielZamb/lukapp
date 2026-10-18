import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import DraftsRoute from "../../../app/drafts";

const route = vi.hoisted((): {
  segment: string | string[] | undefined;
  push: ReturnType<typeof vi.fn>;
} => ({ segment: "wait", push: vi.fn() }));
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));
vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ segment: route.segment }),
  router: { push: route.push, back: vi.fn() }, Redirect: "redirect",
}));
vi.mock("convex/react", () => ({ useAction: () => vi.fn() }));
vi.mock("expo-secure-store", () => ({}));
vi.mock("../activity", () => ({ usePersonalDefaults: () => ({
  workspace: { id: "workspace", functionalCurrency: "COP", currentAccountingPeriod: { year: 2026, month: 10 } },
  financialAccountProfile: { id: "daily" },
}) }));
vi.mock("../useLocalEntryDrafts", () => ({ useLocalEntryDrafts: () => ({ items: [], count: 0, error: "" }) }));
vi.mock("../useIntakeCandidates", () => ({ useIntakeCandidates: () => ({
  now: [], wait: [], ready: [], count: 0, error: "", accept: vi.fn(),
}) }));
vi.mock("../../local-auth/accessFailure", () => ({ useDeviceAccessFailure: () => vi.fn() }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("react-native", () => ({
  Text: "text", View: "view", Pressable: "button", ScrollView: "scroll", TextInput: "input", ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));
let root: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("__DEV__", false);
  route.segment = "wait";
  route.push.mockClear();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.unstubAllGlobals();
});
function button(label: string) {
  const found = root.root.findAllByType("button").find((node) => node.props.accessibilityLabel === label);
  if (!found) throw new Error(`Missing ${label}`);
  return found;
}
test("Drafts can open Can wait, then Needs you now, while Month Close remains in the footer", async () => {
  route.segment = ["wait"];
  await act(async () => { root = create(createElement(DraftsRoute)); });
  expect(button("Can wait, 0").props.accessibilityState).toEqual({ selected: true });
  expect(button("Needs you now, 0").props.accessibilityState).toEqual({ selected: false });
  route.segment = "now";
  await act(async () => { root.update(createElement(DraftsRoute)); });
  expect(button("Needs you now, 0").props.accessibilityState).toEqual({ selected: true });
  await act(async () => button("Complete October").props.onPress());
  expect(route.push.mock.calls).toEqual([[{ pathname: "/month-close", params: { month: "2026-10" } }]]);
});
