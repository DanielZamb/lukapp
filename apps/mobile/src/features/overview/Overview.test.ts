import * as React from "react";
import { createElement } from "react";
import { ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { getFunctionName } from "convex/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import OverviewRoute from "../../../app/overview";

const provider = vi.hoisted(() => ({
  query: vi.fn(), calendar: vi.fn(), push: vi.fn(), back: vi.fn(), month: "2026-10",
}));
vi.mock("convex/react", () => ({ useQuery: provider.query }));
vi.mock("../useWorkspaceCalendar", () => ({
  useWorkspaceCalendar: (timeZone: string) => { provider.calendar(timeZone); return { month: provider.month }; },
}));
vi.mock("expo-router", () => ({ router: { push: provider.push, back: provider.back }, Redirect: "redirect" }));
vi.mock("react-native", () => ({
  ActivityIndicator: "spinner", Pressable: "button", Text: "text", View: "view", ScrollView: "scroll",
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "safe-area" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "icon" }));

let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  provider.month = "2026-10";
  provider.query.mockImplementation((reference) => {
    switch (getFunctionName(reference)) {
      case "accounting:personalDefaults": return { workspace: { id: "workspace", timeZone: "America/Bogota" } };
      case "accounting:listJournalEntries": return [{
        accountingDate: "2026-10-01", lines: [
          { nature: "Expense", debitMinorUnits: 150000, creditMinorUnits: 0, userCategories: [{ id: "food" }] },
          { nature: "Revenue", debitMinorUnits: 0, creditMinorUnits: 200000, userCategories: [] },
        ],
      }];
      case "accounting:listUserCategories": return [{ id: "food", name: "Food", nature: "Expense", style: { emoji: "🍋", tone: "positive" } }];
      case "budget:evaluate": return { currency: "COP", jars: [{ category: { id: "food" }, limitMinorUnits: 200000 }] };
      default: throw new Error(`Unexpected query ${getFunctionName(reference)}`);
    }
  });
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});
function texts() { return root?.root.findAllByType("text").map((node) => node.children.join("")) ?? []; }
async function press(label: string) {
  const button = root?.root.findAllByType("button").find((node) => node.props.accessibilityLabel === label);
  if (!button) throw new Error(`Missing button ${label}`);
  await act(async () => button.props.onPress());
}

test("the route reads Convex with the workspace month and navigates back, all-place history and the category look", async () => {
  await act(async () => { root = create(createElement(OverviewRoute)); });
  expect(provider.calendar).toHaveBeenCalledWith("America/Bogota");
  expect(provider.query.mock.calls.map(([reference, args]) => [getFunctionName(reference), args])).toEqual([
    ["accounting:personalDefaults", {}],
    ["accounting:listJournalEntries", { workspaceId: "workspace" }],
    ["accounting:listUserCategories", { workspaceId: "workspace" }],
    ["budget:evaluate", { workspaceId: "workspace", month: "2026-10" }],
  ]);
  expect(texts()).toEqual(expect.arrayContaining(["Net", "$500", "Out", "$1.5K", "In", "$2K", "Food", "$1.500", "500 left"]));
  await press("Back"); await press("Go to tx history"); await press("Food");
  expect(provider.back).toHaveBeenCalledOnce();
  expect(provider.push.mock.calls).toEqual([["/history"], [{ pathname: "/category-look", params: { categoryId: "food" } }]]);
  provider.month = "2026-11";
  await act(async () => root?.update(createElement(OverviewRoute)));
  expect(texts().filter((value) => value === "$0")).toHaveLength(4);
  expect(texts()).toContain("2K left");
  expect(provider.query.mock.calls.map(([reference, args]) => [getFunctionName(reference), args])).toContainEqual([
    "budget:evaluate", { workspaceId: "workspace", month: "2026-11" },
  ]);
});

test("the route waits for defaults and redirects when the workspace is absent", async () => {
  provider.query.mockReturnValue(undefined);
  await act(async () => { root = create(createElement(OverviewRoute)); });
  expect(root?.root.findAllByType(ActivityIndicator)).toHaveLength(1);
  provider.query.mockReturnValue(null);
  await act(async () => root?.update(createElement(OverviewRoute)));
  expect(root?.root.findByType(Redirect).props.href).toBe("/");
});
