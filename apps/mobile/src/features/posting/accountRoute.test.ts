import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }));
vi.mock("expo-router", () => ({
  router,
  Redirect: "redirect",
  useLocalSearchParams: () => ({ profileId: "card-profile" }),
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));
vi.mock("react-native", () => ({
  Text: "text",
  View: "view",
  Pressable: "button",
  ScrollView: "scroll",
  ActivityIndicator: "spinner",
  StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 },
}));
vi.mock("../activity", () => ({
  usePersonalDefaults: () => ({
    workspace: { id: "ws", functionalCurrency: "COP" },
    financialAccountProfile: { id: "cash-default", name: "My money" },
  }),
  usePostedActivity: () => ({
    accounts: [
      {
        financialAccountProfileId: "card-profile",
        name: "Card",
        nature: "Liability",
        balance: { currency: "COP", minorUnits: 10000 },
      },
    ],
  }),
  useRecentActivity: () => ({ page: [] }),
}));

import AccountRoute from "../../../app/account";

let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  router.push.mockReset();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});

test("Post money from an account keeps that account selected", async () => {
  await act(async () => {
    root = create(createElement(AccountRoute));
  });
  const post = root?.root
    .findAllByType("button")
    .find((node) => node.props.accessibilityLabel === "Post money");
  await act(async () => post?.props.onPress());
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/post",
    params: { profileId: "card-profile" },
  });
});
