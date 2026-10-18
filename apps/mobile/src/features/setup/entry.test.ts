import { themes } from "../../ui/tokens";
import * as React from "react";
import { createElement, type ComponentProps } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, test, vi } from "vitest";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../api";
import Index from "../../../app/index";
import { Setup } from "../Setup";
import { SetupCompletion } from "./Completion";
import type { SetupSummary } from "./model";

const state = vi.hoisted(() => ({
  defaults: null as FunctionReturnType<typeof api.accounting.personalDefaults>,
  push: vi.fn(),
}));
vi.mock("@clerk/expo", () => ({ useAuth: () => ({ userId: "owner" }) }));
vi.mock("expo-router", () => ({
  router: { push: state.push },
  useLocalSearchParams: () => ({}),
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "spinner",
  Pressable: "pressable",
  Text: "text",
  View: "view",
}));
vi.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetModal: "modal",
  BottomSheetView: "view",
}));
vi.mock("../../ui/core", () => ({
  Screen: "screen",
  Header: "header",
  PrimaryButton: "button",
  SecondaryButton: "button",
  ActionTile: "tile",
  ProgressBar: "progress",
  useUi: () => ({}),
  useTheme: () => themes.light,
}));
vi.mock("../activity", () => ({
  usePersonalDefaults: () => state.defaults,
  usePostedActivity: () => ({ monthSpendMinorUnits: 0 }),
}));
vi.mock("../useWorkspaceCalendar", () => ({
  useWorkspaceCalendar: () => ({
    date: "2026-10-18",
    now: new Date("2026-10-18T12:00:00Z"),
  }),
}));
vi.mock("../attention/useAttention", () => ({
  useAttention: () => ({ inboxCount: 0, alerts: { kind: "ready", rows: [] } }),
}));
vi.mock("../Setup", () => ({ Setup: "setup" }));
vi.mock("./Completion", () => ({ SetupCompletion: "complete" }));
let root: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  state.defaults = null;
  state.push.mockReset();
  vi.unstubAllGlobals();
});
const summary: SetupSummary = {
  categories: [
    {
      name: "Food",
      style: { emoji: "🛒", tone: "primary", color: "h150" },
      source: "starter",
    },
  ],
  currency: "COP",
  startingMinorUnits: 0,
  purchaseAlertsConsent: false,
  wantsBudgets: true,
  firstCategoryId: "first-food",
};
async function open() {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(async () => {
    root = create(createElement(Index));
  });
}
function setup(): ComponentProps<typeof Setup> {
  if (!root) throw new Error("Entry is not mounted");
  const props = root.root.findByType(Setup).props;
  return { onComplete: props.onComplete, onCancel: props.onCancel };
}
function completion(): ComponentProps<typeof SetupCompletion> {
  if (!root) throw new Error("Entry is not mounted");
  const props = root.root.findByType(SetupCompletion).props;
  return { summary: props.summary, onHome: props.onHome };
}

test("a live defaults update keeps setup mounted until its receipt and Go to home opens the first category budget", async () => {
  await open();
  state.defaults = {
    purchaseAlertsConsent: false, wantsBudgets: true,
    workspace: {
      id: "workspace",
      kind: "Personal",
      functionalCurrency: "COP",
      timeZone: "America/Bogota",
      chartOfAccountsTemplate: "co-puc-personal@1",
      currentAccountingPeriod: { year: 2026, month: 10, status: "open" },
    },
    financialAccountProfile: {
      id: "money",
      workspaceId: "workspace",
      name: "My money",
      productKind: "cash",
      ledgerAccountId: "cash",
    },
  };
  await act(async () => root?.update(createElement(Index)));
  expect(root?.root.findAllByType(Setup)).toHaveLength(1);
  await act(async () => setup().onComplete(summary));
  expect(completion().summary).toEqual(summary);
  await act(async () => completion().onHome());
  expect(state.push).toHaveBeenCalledExactlyOnceWith({
    pathname: "/budget",
    params: { categoryId: "first-food" },
  });
});

test("Cancel returns to an empty home and reopening starts a new unsaved setup", async () => {
  await open();
  await act(async () => setup().onCancel());
  expect(root?.root.findAllByType(Setup)).toHaveLength(0);
  expect(root?.root.findByType("header").props.title).toBe("Home");
  await act(async () => root?.root.findByType("button").props.onPress());
  expect(root?.root.findAllByType(Setup)).toHaveLength(1);
  expect(state.defaults).toBeNull();
  expect(state.push).not.toHaveBeenCalled();
});

test("Go to home without the shortcut leaves the budget closed", async () => {
  await open();
  await act(async () =>
    setup().onComplete({ ...summary, wantsBudgets: false }),
  );
  await act(async () => completion().onHome());
  expect(state.push).not.toHaveBeenCalled();
  expect(root?.root.findAllByType(SetupCompletion)).toHaveLength(0);
});
