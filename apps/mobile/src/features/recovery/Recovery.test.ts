import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Text } from "react-native";
import { getFunctionName, type FunctionReturnType } from "convex/server";
import { afterEach, expect, test, vi } from "vitest";
import {
  BaseNavigationContainer, createNavigationContainerRef, createNavigatorFactory,
  StackActions, StackRouter, useNavigationBuilder,
} from "@react-navigation/native";
import { Header, ListRow, PrimaryButton, SecondaryButton } from "../../ui/core";
import type { api } from "../api";
import { Recovery } from "./Recovery";
import { RecoveryCandidates, RecoveryDraft, RecoveryPlanList, RecoveryPlanScreen } from "./RecoveryScreens";
import type { RecoveryEditorTransport } from "./useRecoveryEditor";
import type { RecoveryMoveTransport } from "./useRecoveryMove";
import { RecoveryMoveScreen } from "./RecoveryScreens";
import RecoveryRoute from "../../../app/recovery";

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  KeyboardAvoidingView: "keyboard-viewport",
  ActivityIndicator: "ActivityIndicator", Pressable: "Pressable", Text: "Text", TextInput: "TextInput",
  View: "View", ScrollView: "ScrollView",
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("@react-navigation/native", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  return import(require.resolve("@react-navigation/core", { paths: [require.resolve("@react-navigation/native")] }));
});
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "Icon" }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "activation-key" }));
vi.mock("../../local-auth/accessFailure", () => ({ useDeviceAccessFailure: () => () => false }));
vi.mock("../../local-auth/interaction", () => ({ useLocalEntryInteraction: () => () => {} }));
const remote = vi.hoisted(() => ({ query: vi.fn(), activate: vi.fn<RecoveryEditorTransport["save"]>(), move: vi.fn<RecoveryMoveTransport["move"]>() }));
vi.mock("convex/react", () => ({
  useQuery: remote.query,
  useAction: (action: typeof api.savingsRecovery.activatePlan | typeof api.savingsRecovery.recordContribution) =>
    getFunctionName(action) === "savingsRecovery:recordContribution" ? remote.move : remote.activate,
}));
const navigation = vi.hoisted(() => ({ back: vi.fn(), dismissTo: vi.fn() }));
vi.mock("expo-router", async () => {
  const { useNavigation } = await import("@react-navigation/native");
  return { router: navigation, useNavigation, Redirect: "Redirect" };
});
vi.mock("../activity", () => ({ usePersonalDefaults: () => ({ workspace: { id: "workspace", timeZone: "America/Bogota" } }) }));

function TestNavigator({ children }: { children: React.ReactNode }) {
  const { state, descriptors, NavigationContent } = useNavigationBuilder(StackRouter, { children });
  return createElement(NavigationContent, null, state.routes.map((route) => descriptors[route.key].render()));
}
const Stack = createNavigatorFactory(TestNavigator)();
const stack = createNavigationContainerRef();
const Empty = () => null;

const candidate = {
  journalEntryId: "dental", title: "Dental care", accountingDate: "2026-08-04",
  amountMinorUnits: 48_000_000, financialAccountProfileId: "daily", placeName: "Daily account",
};
const plan = {
  status: "active",
  id: "repair", title: "Emergency repair", sourceJournalEntryId: "expense-repair", sourceTitle: "Emergency repair",
  destinationFinancialAccountProfileId: "savings", destinationName: "Savings",
  principalMinorUnits: 300_000_000, installmentCount: 10, installmentMinorUnits: 30_000_000,
  impliedAnnualRateBps: 0, activationMonth: "2026-05", currency: "COP",
  recoveredMinorUnits: 180_000_000, remainingMinorUnits: 120_000_000, targetMinorUnits: 300_000_000,
  dueMinorUnits: 30_000_000,
};
const evaluation = {
  month: "2026-10", currentMonth: "2026-10", currency: "COP", plans: [], candidates: [candidate],
  destinations: [{ id: "savings", name: "Savings", productKind: "savingsAccount" }],
  sources: [{ id: "daily", name: "Daily account", productKind: "bankAccount" }],
} satisfies FunctionReturnType<typeof api.savingsRecovery.evaluate>;

let root: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
async function open(plans: typeof plan[] = [], route = false, origin = "plans") {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  remote.query.mockReturnValue({ ...evaluation, plans });
  const onBack = vi.fn();
  const onViewPlans = vi.fn();
  const onHome = vi.fn();
  navigation.back.mockImplementation(() => stack.goBack());
  navigation.dismissTo.mockImplementation((path: string) => stack.dispatch(StackActions.popTo(path === "/" ? "index" : "plans")));
  await act(async () => {
    root = create(createElement(BaseNavigationContainer, {
      ref: stack,
      initialState: { index: 2, routes: [{ name: "index" }, { name: origin }, { name: "recovery" }] },
      children: createElement(Stack.Navigator, null,
        createElement(Stack.Screen, { name: "index", component: Empty }),
        createElement(Stack.Screen, { name: "alerts", component: Empty }),
        createElement(Stack.Screen, { name: "plans", component: Empty }),
        createElement(Stack.Screen, { name: "recovery", children: () => route
          ? createElement(RecoveryRoute)
          : createElement(Recovery, { workspaceId: "workspace", timeZone: "America/Bogota", onBack, onViewPlans, onHome }) }),
      ),
    }));
  });
  if (!root) throw new Error("Recovery not mounted");
  return { screen: root.root, onBack, onViewPlans, onHome };
}

test("zero plans opens candidates, and the selected expense drafts and activates its own schedule", async () => {
  remote.activate.mockImplementation(async (request) => ({
    replay: false,
    plan: {
      ...request, id: "dental-plan", title: "Dental care", principalMinorUnits: 48_000_000,
      impliedAnnualRateBps: 0, currency: "COP", activationMonth: "2026-10", createdBy: "owner", createdAt: 1,
    },
  }));
  const { screen, onBack, onViewPlans, onHome } = await open();
  expect(screen.findByType(RecoveryCandidates).props.month).toBe("2026-10");
  await act(async () => { screen.findByType(Header).props.onBack(); });
  expect(onBack).toHaveBeenCalledOnce();
  await act(async () => { screen.findByType(ListRow).props.onPress(); });
  expect(screen.findByType(Header).props.eyebrow).toBe("DENTAL CARE · DRAFT");
  expect(screen.findByType(RecoveryDraft).props).toMatchObject({
    candidate: { title: "Dental care", amountMinorUnits: 48_000_000 },
    installmentCount: 4, amount: "120.000", destinationId: "savings",
  });
  expect(screen.findByType(ListRow).props).toMatchObject({ title: "Destination", value: "Savings" });
  await act(async () => { screen.findByType(RecoveryDraft).props.onAmount("119.999"); });
  expect(screen.findByType(PrimaryButton).props.disabled).toBe(true);
  expect(screen.findByType(RecoveryDraft).props.suggestion.valid).toBe(false);
  await act(async () => { screen.findByType(RecoveryDraft).props.onAmount("132.000"); });
  expect(screen.findByType(RecoveryDraft).props.suggestion).toMatchObject({
    installmentMinorUnits: 13_200_000, premiumMinorUnits: 4_800_000, valid: true,
  });
  await act(async () => { screen.findByType(PrimaryButton).props.onPress(); });
  expect(remote.activate.mock.calls[0][0]).toEqual({
    workspaceId: "workspace", sourceJournalEntryId: "dental", destinationFinancialAccountProfileId: "savings",
    installmentCount: 4, installmentMinorUnits: 13_200_000, idempotencyKey: "activation-key",
  });
  expect(JSON.stringify(root?.toJSON())).toContain("Dental care will begin with a COP 132.000 contribution in October.");
  expect(screen.findAllByType(Header)).toHaveLength(0);
  expect(screen.findAllByType(RecoveryDraft)).toHaveLength(0);
  expect(screen.findByType(PrimaryButton).props.label).toBe("View Plans");
  expect(screen.findByType(SecondaryButton).props.label).toBe("Back home");
  await act(async () => { screen.findByType(PrimaryButton).props.onPress(); screen.findByType(SecondaryButton).props.onPress(); });
  expect(onViewPlans).toHaveBeenCalledOnce();
  expect(onHome).toHaveBeenCalledOnce();
});

test("activation keeps the draft locked and hides back until completion replaces it", async () => {
  let finish: ((receipt: Awaited<ReturnType<RecoveryEditorTransport["save"]>>) => void) | undefined;
  remote.activate.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const { screen } = await open();
  await act(async () => { screen.findByType(ListRow).props.onPress(); });
  await act(async () => { screen.findByType(PrimaryButton).props.onPress(); });
  expect(screen.findByType(Header).props.onBack).toBeUndefined();
  expect(screen.findByType(RecoveryDraft).props).toMatchObject({ editable: false, busy: true, canDismiss: false });
  await act(async () => { stack.goBack(); stack.dispatch(StackActions.pop(1)); });
  expect(screen.findByType(RecoveryDraft).props.busy).toBe(true);
  await act(async () => {
    screen.findByType(RecoveryDraft).props.onMonths(12);
    screen.findByType(RecoveryDraft).props.onAmount("140.000");
  });
  expect(screen.findByType(RecoveryDraft).props).toMatchObject({ installmentCount: 4, amount: "120.000" });
  const request = remote.activate.mock.calls[0][0];
  await act(async () => {
    finish?.({
      replay: false,
      plan: {
        ...request, id: "dental-plan", title: "Dental care", principalMinorUnits: 48_000_000,
        impliedAnnualRateBps: 0, currency: "COP", activationMonth: "2026-10", createdBy: "owner", createdAt: 1,
      },
    });
  });
  expect(screen.findByType(PrimaryButton).props.label).toBe("View Plans");
  expect(screen.findAllByType(RecoveryDraft)).toHaveLength(0);
});

test("one plan opens live progress, and candidates and drafts return to that plan", async () => {
  const { screen, onBack } = await open([plan]);
  expect(screen.findByType(RecoveryPlanScreen).props.plan.title).toBe("Emergency repair");
  await act(async () => { screen.findByType(SecondaryButton).props.onPress(); });
  expect(screen.findByType(RecoveryCandidates).props.candidates[0].title).toBe("Dental care");
  await act(async () => { screen.findByType(ListRow).props.onPress(); });
  expect(screen.findByType(Header).props.eyebrow).toBe("DENTAL CARE · DRAFT");
  await act(async () => { screen.findByType(Header).props.onBack(); });
  expect(screen.findByType(RecoveryCandidates).props.candidates[0].title).toBe("Dental care");
  await act(async () => { screen.findByType(Header).props.onBack(); });
  expect(screen.findByType(RecoveryPlanScreen).props.plan.id).toBe("repair");
  await act(async () => { screen.findByType(Header).props.onBack(); });
  expect(onBack).toHaveBeenCalledOnce();
});

test("several plans opens a plan list and back from a plan returns to the list", async () => {
  const { screen, onBack } = await open([plan, { ...plan, id: "appliance", title: "Home appliance" }]);
  expect(screen.findByType(RecoveryPlanList).props.plans.map((item: typeof plan) => item.title))
    .toEqual(["Emergency repair", "Home appliance"]);
  expect(screen.findAllByType(RecoveryCandidates)).toHaveLength(0);
  await act(async () => { screen.findAllByType(ListRow)[1].props.onPress(); });
  expect(screen.findByType(RecoveryPlanScreen).props.plan.id).toBe("appliance");
  await act(async () => { screen.findByType(SecondaryButton).props.onPress(); });
  expect(screen.findByType(RecoveryCandidates).props.candidates[0].title).toBe("Dental care");
  await act(async () => { screen.findByType(Header).props.onBack(); });
  expect(screen.findByType(RecoveryPlanScreen).props.plan.id).toBe("appliance");
  await act(async () => { screen.findByType(Header).props.onBack(); });
  expect(screen.findByType(RecoveryPlanList).props.plans).toHaveLength(2);
  await act(async () => { screen.findByType(Header).props.onBack(); });
  expect(onBack).toHaveBeenCalledOnce();
});

test.each(["plans", "alerts"])("View Plans replaces the stack from %s with Home then Plans", async (origin) => {
  const { screen } = await open([], true, origin);
  await act(async () => { screen.findByType(Recovery).props.onViewPlans(); });
  expect(stack.getRootState()?.routes.map((route) => route.name)).toEqual(["index", "plans"]);
  expect(stack.getRootState()?.index).toBe(1);
  await act(async () => { stack.goBack(); });
  expect(stack.getRootState()?.routes.map((route) => route.name)).toEqual(["index"]);
});

test("Back home leaves only /", async () => {
  const { screen } = await open([], true, "alerts");
  await act(async () => { screen.findByType(Recovery).props.onHome(); });
  expect(stack.getRootState()?.routes.map((route) => route.name)).toEqual(["index"]);
});

test.each(["android", "ios"])("%s back follows draft, candidates, opening plan, list, then leaves Recovery", async (platform) => {
  const back = () => platform === "android" ? stack.goBack() : stack.dispatch(StackActions.pop(1));
  const { screen } = await open([plan, { ...plan, id: "appliance", title: "Home appliance" }], true);
  await act(async () => { screen.findAllByType(ListRow)[1].props.onPress(); });
  await act(async () => { screen.findByType(SecondaryButton).props.onPress(); });
  await act(async () => { screen.findByType(ListRow).props.onPress(); });
  await act(async () => { back(); });
  expect(screen.findByType(RecoveryCandidates).props.candidates[0].title).toBe("Dental care");
  await act(async () => { back(); });
  expect(screen.findByType(RecoveryPlanScreen).props.plan.id).toBe("appliance");
  await act(async () => { back(); });
  expect(screen.findByType(RecoveryPlanList).props.plans).toHaveLength(2);
  await act(async () => { back(); });
  expect(stack.getRootState()?.routes.map((route) => route.name)).toEqual(["index", "plans"]);
});

test.each([
  { name: "no opening plan", plans: [] },
  { name: "a single opening plan", plans: [plan] },
])("system back unwinds the draft and candidates with $name, then leaves Recovery", async ({ plans }) => {
  const { screen } = await open(plans, true);
  if (plans.length) await act(async () => { screen.findByType(SecondaryButton).props.onPress(); });
  await act(async () => { screen.findByType(ListRow).props.onPress(); });
  await act(async () => { stack.goBack(); });
  expect(screen.findByType(RecoveryCandidates).props.candidates[0].title).toBe("Dental care");
  await act(async () => { stack.dispatch(StackActions.pop(1)); });
  if (plans.length) {
    expect(screen.findByType(RecoveryPlanScreen).props.plan.id).toBe("repair");
    await act(async () => { stack.goBack(); });
  }
  expect(stack.getRootState()?.routes.map((route) => route.name)).toEqual(["index", "plans"]);
});

test.each([{ plans: [] }, { plans: [plan] }])("system back leaves the opening screen directly with $plans.length plans", async ({ plans }) => {
  await open(plans, true);
  await act(async () => { stack.goBack(); });
  expect(stack.getRootState()?.routes.map((route) => route.name)).toEqual(["index", "plans"]);
});

test.each([
  { origin: "plans", destination: "plans" },
  { origin: "alerts", destination: "plans" },
  { origin: "alerts", destination: "home" },
])("pending and completed activation handle back from $origin before going to $destination", async ({ origin, destination }) => {
  remote.activate.mockRejectedValueOnce(new Error("offline"));
  const { screen } = await open([], true, origin);
  await act(async () => { screen.findByType(ListRow).props.onPress(); });
  await act(async () => { screen.findByType(PrimaryButton).props.onPress(); });
  await act(async () => { stack.goBack(); stack.dispatch(StackActions.pop(1)); });
  expect(screen.findByType(RecoveryDraft).props).toMatchObject({ pending: true, canDismiss: false });
  remote.activate.mockImplementationOnce(async (request) => ({
    replay: true,
    plan: { ...request, id: "dental-plan", title: "Dental care", principalMinorUnits: 48_000_000,
      impliedAnnualRateBps: 0, currency: "COP", activationMonth: "2026-10", createdBy: "owner", createdAt: 1 },
  }));
  await act(async () => { screen.findByType(PrimaryButton).props.onPress(); });
  await act(async () => { stack.goBack(); stack.dispatch(StackActions.pop(1)); });
  expect(screen.findAllByType(RecoveryDraft)).toHaveLength(0);
  expect(screen.findAllByType(Header)).toHaveLength(0);
  expect(screen.findByType(PrimaryButton).props.label).toBe("View Plans");
  await act(async () => {
    screen.findByType(destination === "plans" ? PrimaryButton : SecondaryButton).props.onPress();
  });
  expect(stack.getRootState()?.routes.map((route) => route.name))
    .toEqual(destination === "plans" ? ["index", "plans"] : ["index"]);
});

function moveReceipt(request: Parameters<RecoveryMoveTransport["move"]>[0], countedMinorUnits = request.amount.minorUnits) {
  return {
    replay: false,
    transfer: { id: "transfer", amount: request.amount },
    contribution: {
      id: "contribution", workspaceId: request.workspaceId, planId: request.planId,
      transferJournalEntryId: "transfer", amountMinorUnits: countedMinorUnits,
      contributionDate: "2026-10-18", idempotencyKey: request.idempotencyKey,
      createdBy: "owner", recordedAt: 1,
    },
  };
}

test.each(["header", "android", "ios"])("move is pushed from the plan and %s back pops to that plan", async (method) => {
  const { screen, onBack } = await open([plan], true);
  await act(async () => { screen.findByType(PrimaryButton).props.onPress(); });
  expect(screen.findByType(Header).props).toMatchObject({ title: "Move money", eyebrow: "RECOVERY CONTRIBUTION" });
  expect(screen.findByType(RecoveryMoveScreen).props.amount).toBe("300.000");
  await act(async () => {
    if (method === "header") screen.findByType(Header).props.onBack();
    else if (method === "android") stack.goBack();
    else stack.dispatch(StackActions.pop(1));
  });
  expect(screen.findByType(RecoveryPlanScreen).props.plan.id).toBe("repair");
  expect(onBack).not.toHaveBeenCalled();
  expect(stack.getRootState()?.routes.map((route) => route.name)).toEqual(["index", "plans", "recovery"]);
});

test.each([false, true])("posting replaces the form and View recovery plan shows refreshed progress, capped=%s", async (capped) => {
  let finish: ((receipt: Awaited<ReturnType<RecoveryMoveTransport["move"]>>) => void) | undefined;
  remote.move.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const { screen } = await open([plan], true);
  await act(async () => { screen.findByType(PrimaryButton).props.onPress(); });
  if (capped) await act(async () => { screen.findByType(RecoveryMoveScreen).props.onAmount("1.500.000"); });
  await act(async () => { screen.findByType(PrimaryButton).props.onPress(); });
  expect(screen.findByType(Header).props.onBack).toBeUndefined();
  expect(screen.findByType(RecoveryMoveScreen).props).toMatchObject({ busy: true, editable: false, canDismiss: false });
  await act(async () => { stack.goBack(); stack.dispatch(StackActions.pop(1)); });
  expect(screen.findByType(RecoveryMoveScreen).props.busy).toBe(true);
  const request = remote.move.mock.calls[0][0];
  expect(request.amount).toEqual({ currency: "COP", minorUnits: capped ? 150_000_000 : 30_000_000 });
  const refreshed = {
    ...plan, recoveredMinorUnits: capped ? 300_000_000 : 210_000_000,
    remainingMinorUnits: capped ? 0 : 90_000_000, dueMinorUnits: 0,
  };
  await act(async () => {
    remote.query.mockReturnValue({ ...evaluation, plans: [refreshed] });
    finish?.(moveReceipt(request, capped ? 120_000_000 : 30_000_000));
  });
  expect(screen.findAllByType(RecoveryMoveScreen)).toHaveLength(0);
  expect(screen.findAllByType(Header)).toHaveLength(0);
  expect(JSON.stringify(root?.toJSON())).toContain(capped ? "COP 1.500.000 moved" : "COP 300.000 moved");
  expect(JSON.stringify(root?.toJSON())).toContain(capped
    ? "COP 1.200.000 counted toward Emergency repair. Your Emergency repair plan is now 100% complete. The Savings account balance remains separate from plan progress."
    : "Your Emergency repair plan is now 70% complete. The Savings account balance remains separate from plan progress.");
  expect(screen.findByType(PrimaryButton).props).toMatchObject({ label: "View recovery plan", trailingIcon: "trending-up-outline" });
  expect(screen.findByType(SecondaryButton).props.label).toBe("Back home");
  await act(async () => { stack.goBack(); stack.dispatch(StackActions.pop(1)); });
  expect(screen.findAllByType(RecoveryMoveScreen)).toHaveLength(0);
  await act(async () => { screen.findByType(PrimaryButton).props.onPress(); });
  expect(screen.findByType(RecoveryPlanScreen).props.plan).toEqual(refreshed);
  expect(JSON.stringify(root?.toJSON())).toContain(capped ? "COP 3.000.000" : "COP 2.100.000");
  expect(screen.findAll((node) => node.type === Text && node.children.join("") === (capped ? "100% complete" : "70% complete"))).toHaveLength(1);
  expect(screen.findAll((node) => node.type === Text && node.children.join("") === (capped ? "COP 0 left" : "COP 900.000 left"))).toHaveLength(1);
  expect(screen.findAllByType(PrimaryButton)).toHaveLength(capped ? 0 : 1);
});

test("an uncertain transfer keeps back hidden, retries the same movement, then Back home resets to /", async () => {
  remote.move.mockRejectedValueOnce(new Error("offline"));
  const { screen } = await open([plan], true, "alerts");
  await act(async () => { screen.findByType(PrimaryButton).props.onPress(); });
  await act(async () => { screen.findByType(PrimaryButton).props.onPress(); });
  expect(screen.findByType(Header).props.onBack).toBeUndefined();
  expect(screen.findByType(RecoveryMoveScreen).props).toMatchObject({
    pending: true, editable: false, canDismiss: false,
    error: "Could not confirm the transfer. Retry to safely check the same movement.",
  });
  await act(async () => { stack.goBack(); stack.dispatch(StackActions.pop(1)); });
  expect(screen.findByType(PrimaryButton).props.label).toBe("Retry transfer");
  remote.move.mockImplementationOnce(async (request) => moveReceipt(request));
  await act(async () => { screen.findByType(PrimaryButton).props.onPress(); });
  expect(remote.move.mock.calls.map(([request]) => request.idempotencyKey)).toEqual(["activation-key", "activation-key"]);
  await act(async () => { screen.findByType(SecondaryButton).props.onPress(); });
  expect(stack.getRootState()?.routes.map((route) => route.name)).toEqual(["index"]);
});
