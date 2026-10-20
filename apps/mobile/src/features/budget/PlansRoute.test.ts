import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { getFunctionName, type FunctionReference, type FunctionReturnType } from "convex/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import PlansRoute from "../../../app/plans";
import { api } from "../api";

type RecoveryEvaluation = FunctionReturnType<typeof api.savingsRecovery.evaluate>;

const state = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  timeZone: "America/Bogota",
  recovery: { month: "2026-10", currentMonth: "2026-10", currency: "COP", plans: [], candidates: [], destinations: [], sources: [] } as
    RecoveryEvaluation | undefined,
}));
vi.mock("expo-router", () => ({ router: { push: state.push, back: state.back }, Redirect: "Redirect" }));
vi.mock("../activity", () => ({ usePersonalDefaults: () => ({ workspace: { id: "workspace", timeZone: state.timeZone } }) }));
vi.mock("convex/react", () => ({
  useQuery: (reference: FunctionReference<"query">, args: unknown) => {
    if (getFunctionName(reference) === "savingsRecovery:evaluate") return state.recovery;
    throw new Error(`Unexpected query ${getFunctionName(reference)} with ${JSON.stringify(args)}`);
  },
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", Pressable: "Pressable", Text: "Text", View: "View", ScrollView: "ScrollView",
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "Icon" }));

let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T02:00:00Z"));
  state.timeZone = "America/Bogota";
  state.recovery = {
    month: "2026-10", currentMonth: "2026-10", currency: "COP", plans: [], candidates: [], destinations: [], sources: [],
  };
  state.push.mockClear();
  state.back.mockClear();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function textCopy(screen: ReactTestRenderer["root"]) {
  return screen.findAll((node) => String(node.type) === "Text").map((node) => node.children.join(""));
}

test("Plans matches the settled landing using the workspace month with separate budget and recovery routes", async () => {
  await act(async () => { root = create(createElement(PlansRoute)); });
  if (!root) throw new Error("Plans not mounted");
  const screen = root.root;
  expect(textCopy(screen)).toEqual([
    "LOOKING AHEAD", "Plans", "October budget", "This month's limits", "Savings recovery", "Start from an expense",
    "Budget is the October plan. Recovery is a sibling destination. It is not a budget row.",
  ]);
  expect(screen.findAll((node) => String(node.type) === "Icon").map((node) => node.props.name)).toEqual([
    "chevron-back", "flag-outline", "chevron-forward", "trending-up-outline", "chevron-forward",
  ]);
  await act(async () => {
    screen.findByProps({ accessibilityLabel: "October budget, This month's limits" }).props.onPress();
    screen.findByProps({ accessibilityLabel: "Savings recovery, Start from an expense" }).props.onPress();
    screen.findByProps({ accessibilityLabel: "Back" }).props.onPress();
  });
  expect(state.push.mock.calls).toEqual([["/budget"], ["/recovery"]]);
  expect(state.back).toHaveBeenCalledOnce();
  await act(async () => { vi.advanceTimersByTime(3 * 60 * 60 * 1000 + 1); });
  expect(textCopy(screen)).toContain("November budget");
});

test.each(["active", "suspended"] as const)("Plans shows only an active recovery plan by title, status=%s", async (status) => {
  state.recovery = {
    ...state.recovery!,
    plans: [{
      status, id: "plan-1", title: "Emergency repair", sourceJournalEntryId: "exp-1", sourceTitle: "Emergency repair",
      destinationFinancialAccountProfileId: "savings", destinationName: "Savings", principalMinorUnits: 100_00,
      installmentCount: 6, installmentMinorUnits: 20_00, impliedAnnualRateBps: 0, activationMonth: "2026-10",
      currency: "COP", recoveredMinorUnits: 0, remainingMinorUnits: 120_00, targetMinorUnits: 120_00, dueMinorUnits: 20_00,
    }],
  };
  await act(async () => { root = create(createElement(PlansRoute)); });
  if (!root) throw new Error("Plans not mounted");
  const detail = status === "active" ? "Emergency repair" : "Start from an expense";
  expect(textCopy(root.root)).toContain(detail);
  root.root.findByProps({ accessibilityLabel: `Savings recovery, ${detail}` });
});

test("Plans summarizes several recovery plans", async () => {
  const plan = {
    status: "active" as const, id: "plan-1", title: "Emergency repair", sourceJournalEntryId: "exp-1", sourceTitle: "Emergency repair",
    destinationFinancialAccountProfileId: "savings", destinationName: "Savings", principalMinorUnits: 100_00,
    installmentCount: 6, installmentMinorUnits: 20_00, impliedAnnualRateBps: 0, activationMonth: "2026-10",
    currency: "COP", recoveredMinorUnits: 0, remainingMinorUnits: 120_00, targetMinorUnits: 120_00, dueMinorUnits: 20_00,
  };
  state.recovery = { ...state.recovery!, plans: [plan, { ...plan, id: "plan-2", title: "Laptop repair" }] };
  await act(async () => { root = create(createElement(PlansRoute)); });
  if (!root) throw new Error("Plans not mounted");
  expect(textCopy(root.root)).toContain("2 plans");
  root.root.findByProps({ accessibilityLabel: "Savings recovery, 2 plans" });
});

test.each([
  { activeCount: 0, detail: "Start from an expense" },
  { activeCount: 1, detail: "Emergency repair" },
  { activeCount: 2, detail: "2 plans" },
])("Plans excludes completed plans when $activeCount active plans remain", async ({ activeCount, detail }) => {
  const plan = {
    status: "active" as const, id: "plan-1", title: "Emergency repair", sourceJournalEntryId: "exp-1", sourceTitle: "Emergency repair",
    destinationFinancialAccountProfileId: "savings", destinationName: "Savings", principalMinorUnits: 100_00,
    installmentCount: 6, installmentMinorUnits: 20_00, impliedAnnualRateBps: 0, activationMonth: "2026-10",
    currency: "COP", recoveredMinorUnits: 0, remainingMinorUnits: 120_00, targetMinorUnits: 120_00, dueMinorUnits: 20_00,
  };
  state.recovery = {
    ...state.recovery!,
    plans: [
      { ...plan, id: "completed", title: "Completed repair", recoveredMinorUnits: 120_00, remainingMinorUnits: 0, dueMinorUnits: 0 },
      ...Array.from({ length: activeCount }, (_, index) => ({ ...plan, id: `active-${index}` })),
    ],
  };
  await act(async () => { root = create(createElement(PlansRoute)); });
  if (!root) throw new Error("Plans not mounted");
  expect(textCopy(root.root)).toContain(detail);
  expect(textCopy(root.root)).not.toContain("Completed repair");
  root.root.findByProps({ accessibilityLabel: `Savings recovery, ${detail}` });
});

test("Plans keeps the recovery row visible while evaluate is loading", async () => {
  state.recovery = undefined;
  await act(async () => { root = create(createElement(PlansRoute)); });
  if (!root) throw new Error("Plans not mounted");
  const copy = textCopy(root.root);
  expect(copy).toEqual([
    "LOOKING AHEAD", "Plans", "October budget", "This month's limits", "Savings recovery", "",
    "Budget is the October plan. Recovery is a sibling destination. It is not a budget row.",
  ]);
  expect(copy).not.toContain("Emergency repair");
  root.root.findByProps({ accessibilityLabel: "Savings recovery, " });
  expect(root.root.findAll((node) => String(node.type) === "Icon").map((node) => node.props.name)).toContain("trending-up-outline");
});
