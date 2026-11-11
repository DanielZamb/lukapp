import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { Text, TextInput } from "react-native";
import { getFunctionName, type FunctionReturnType } from "convex/server";
import { afterEach, expect, test, vi } from "vitest";
import { openAmount, withNativeText } from "../amount/session";

/** The session after a person types `text` key by key. */
const money = (text: string, currency = "COP") =>
  [...text].reduce((session, key) => withNativeText(session, session.editor.text + key), openAmount(currency));
const typedAmount = (text: string) => expect.objectContaining({ editor: expect.objectContaining({ text }) });
import {
  BaseNavigationContainer, createNavigationContainerRef, createNavigatorFactory,
  StackActions, StackRouter, useNavigationBuilder,
} from "@react-navigation/native";
import { ConvexError } from "convex/values";
import { Choice, Header, ListGroup, ListRow, PrimaryButton, SecondaryButton } from "../../ui/core";
import type { api } from "../api";
import { Recovery } from "./Recovery";
import { RecoveryCandidates, RecoveryDraft, RecoveryPlanList, RecoveryPlanScreen } from "./RecoveryScreens";
import type { RecoveryCandidate, RecoveryContribution, RecoveryPlanView } from "./model";
import type { RecoveryEditorTransport } from "./useRecoveryEditor";
import type { RecoveryCancelTransport, RecoveryCorrectionTransport } from "./useRecoveryLifecycle";
import type { RecoveryMoveTransport } from "./useRecoveryMove";
import { RecoveryMoveScreen } from "./RecoveryScreens";
import { RecoveryCorrectScreen } from "./RecoveryLifecycleScreens";
import RecoveryRoute from "../../../app/recovery";

const phone = vi.hoisted(() => new Map<string, string>());
/** How many of the next writes or deletes the phone's secure store fails, as a full or locked keychain does. */
const failing = vi.hoisted(() => ({ writes: 0, deletes: 0 }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => phone.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    if (failing.writes > 0) { failing.writes--; throw new Error("keychain write failed"); }
    phone.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    if (failing.deletes > 0) { failing.deletes--; throw new Error("keychain delete failed"); }
    phone.delete(key);
  },
}));
vi.mock("../../local-auth/localInput", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../local-auth/localInput")>();
  const lease = new actual.LocalInputLease("owner", "session");
  return { ...actual, useLocalInputLease: () => lease };
});
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
const uuid = vi.hoisted(() => ({ next: (): string => "activation-key" }));
vi.mock("expo-crypto", () => ({ randomUUID: () => uuid.next() }));
const access = vi.hoisted(() => ({ report: (_error: unknown): boolean => false }));
vi.mock("../../local-auth/accessFailure", () => ({ useDeviceAccessFailure: () => access.report }));
vi.mock("../../local-auth/interaction", () => ({ useLocalEntryInteraction: () => () => {} }));
const remote = vi.hoisted(() => ({
  query: vi.fn(), activate: vi.fn<RecoveryEditorTransport["save"]>(), move: vi.fn<RecoveryMoveTransport["move"]>(),
  cancel: vi.fn<RecoveryCancelTransport["cancel"]>(), correct: vi.fn<RecoveryCorrectionTransport["correct"]>(),
}));
vi.mock("convex/react", () => ({
  useQuery: remote.query,
  useAction: (action: Parameters<typeof getFunctionName>[0]) => ({
    "savingsRecovery:recordContribution": remote.move,
    "savingsRecovery:cancelPlan": remote.cancel,
    "savingsRecovery:correctContribution": remote.correct,
  } as Record<string, unknown>)[getFunctionName(action)] ?? remote.activate,
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
const plan: RecoveryPlanView = {
  cancellation: undefined, replacesPlanId: undefined, replacedByPlanId: undefined, contributionHistory: [],
  status: "active", canCancel: true, acceptsContributions: true,
  id: "repair", title: "Emergency repair", sourceJournalEntryId: "expense-repair", sourceTitle: "Emergency repair",
  destinationFinancialAccountProfileId: "savings", destinationName: "Savings",
  principalMinorUnits: 300_000_000, installmentCount: 10, installmentMinorUnits: 30_000_000,
  impliedAnnualRateBps: 0, activationDate: "2026-05-01", activationMonth: "2026-05", currency: "COP",
  recoveredMinorUnits: 180_000_000, remainingMinorUnits: 120_000_000, targetMinorUnits: 300_000_000,
  dueMinorUnits: 30_000_000,
};
const evaluation = {
  month: "2026-10", currentMonth: "2026-10", currency: "COP", plans: [], candidates: [candidate],
  destinations: [{ id: "savings", name: "Savings", productKind: "savingsAccount" }],
  sources: [{ id: "daily", name: "Daily account", productKind: "bankAccount" }],
} satisfies FunctionReturnType<typeof api.savingsRecovery.evaluate>;

function button(screen: ReactTestInstance, label: string) {
  return screen.find((node) => (node.type === PrimaryButton || node.type === SecondaryButton) && node.props.label === label);
}

let root: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  phone.clear();
  failing.writes = 0;
  failing.deletes = 0;
  vi.unstubAllGlobals();
  vi.resetAllMocks();
  uuid.next = () => "activation-key";
  access.report = () => false;
});
async function open(plans: typeof plan[] = [], route = false, origin = "plans", candidates: RecoveryCandidate[] = evaluation.candidates) {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  remote.query.mockReturnValue({ ...evaluation, plans, candidates });
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
    installmentCount: 4, amount: typedAmount("120000"), destinationId: "savings",
  });
  expect(screen.findByType(ListRow).props).toMatchObject({ title: "Destination", value: "Savings" });
  await act(async () => { screen.findByType(RecoveryDraft).props.onAmount(money("119.999")); });
  expect(screen.findByType(PrimaryButton).props.disabled).toBe(true);
  expect(screen.findByType(RecoveryDraft).props.suggestion.valid).toBe(false);
  await act(async () => { screen.findByType(RecoveryDraft).props.onAmount(money("132.000")); });
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
    screen.findByType(RecoveryDraft).props.onAmount(money("140.000"));
  });
  expect(screen.findByType(RecoveryDraft).props).toMatchObject({ installmentCount: 4, amount: typedAmount("120000") });
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
  await act(async () => { button(screen, "Find another expense").props.onPress(); });
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
  await act(async () => { button(screen, "Find another expense").props.onPress(); });
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
  await act(async () => { button(screen, "Find another expense").props.onPress(); });
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
  if (plans.length) await act(async () => { button(screen, "Find another expense").props.onPress(); });
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
  expect(screen.findByType(RecoveryMoveScreen).props.amount.editor.text).toBe("300000");
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
  if (capped) await act(async () => { screen.findByType(RecoveryMoveScreen).props.onAmount(money("1.500.000")); });
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
    ? "COP 1.200.000 counted toward Emergency repair. Your Emergency repair plan is now 100% complete. Your savings place's balance is separate from plan progress."
    : "Your Emergency repair plan is now 70% complete. Your savings place's balance is separate from plan progress.");
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

test("a retry turned away before the server looked for the transfer keeps it frozen, so the next press resends that transfer instead of a second one", async () => {
  remote.move.mockRejectedValueOnce(new Error("offline"))
    .mockRejectedValueOnce(new ConvexError({ code: "provider_unavailable" }))
    .mockImplementation(async (request) => moveReceipt(request));
  const { screen } = await open([plan], true, "alerts");
  await act(async () => { button(screen, "Move money for October").props.onPress(); });
  uuid.next = () => "move-1";
  await act(async () => { button(screen, "Post transfer").props.onPress(); });
  uuid.next = () => "move-2";
  await act(async () => { button(screen, "Retry transfer").props.onPress(); });
  const refused = { onBack: screen.findByType(Header).props.onBack, labels: labels(screen), screen: screen.findByType(RecoveryMoveScreen).props };
  await act(async () => { screen.findByType(RecoveryMoveScreen).props.onAmount(money("10.000")); });
  await act(async () => { screen.findByType(PrimaryButton).props.onPress(); });
  const sent = remote.move.mock.calls.map(([request]) => request);
  expect(sent[0]).toMatchObject({
    workspaceId: "workspace", planId: "repair", sourceFinancialAccountProfileId: "daily",
    amount: { currency: "COP", minorUnits: 30_000_000 }, idempotencyKey: "move-1",
  });
  expect(sent).toEqual([sent[0], sent[0], sent[0]]);
  expect(refused).toMatchObject({ onBack: undefined, labels: ["Retry transfer"], screen: {
    pending: true, editable: false, canDismiss: false, error: "Could not confirm the transfer. Retry to safely check the same movement.",
  } });
});

test("a retry refused after the server found no earlier transfer answers it and unlocks Move money", async () => {
  remote.move.mockRejectedValueOnce(new Error("offline"))
    .mockRejectedValueOnce(new ConvexError({ kind: "recovery", code: "plan_cancelled" }));
  const { screen } = await open([plan], true, "alerts");
  await act(async () => { button(screen, "Move money for October").props.onPress(); });
  await act(async () => { button(screen, "Post transfer").props.onPress(); });
  await act(async () => { button(screen, "Retry transfer").props.onPress(); });
  expect(screen.findByType(RecoveryMoveScreen).props).toMatchObject({ pending: false, editable: true, canDismiss: true,
    error: "The movement was rejected. Check the source and amount, then try again." });
  expect(screen.findByType(Header).props.onBack).toBeDefined();
});

test("a retry turned away before the server looked for the plan keeps the draft frozen and activates that same plan", async () => {
  remote.activate.mockRejectedValueOnce(new Error("offline"))
    .mockRejectedValueOnce(new ConvexError({ code: "provider_unavailable" }))
    .mockImplementation(async (request) => ({
      replay: true,
      plan: { ...request, id: "dental-plan", title: "Dental care", principalMinorUnits: 48_000_000,
        impliedAnnualRateBps: 0, currency: "COP", activationMonth: "2026-10", createdBy: "owner", createdAt: 1 },
    }));
  const { screen } = await open();
  await act(async () => { screen.findByType(ListRow).props.onPress(); });
  uuid.next = () => "plan-1";
  await act(async () => { button(screen, "Activate plan").props.onPress(); });
  uuid.next = () => "plan-2";
  await act(async () => { button(screen, "Retry activation").props.onPress(); });
  const refused = { onBack: screen.findByType(Header).props.onBack, draft: screen.findByType(RecoveryDraft).props };
  await act(async () => { screen.findByType(RecoveryDraft).props.onMonths(12); });
  await act(async () => { screen.findByType(PrimaryButton).props.onPress(); });
  const first = {
    workspaceId: "workspace", sourceJournalEntryId: "dental", destinationFinancialAccountProfileId: "savings",
    installmentCount: 4, installmentMinorUnits: 12_000_000, idempotencyKey: "plan-1",
  };
  expect(remote.activate.mock.calls.map(([request]) => request)).toEqual([first, first, first]);
  expect(refused).toMatchObject({ onBack: undefined, draft: {
    pending: true, editable: false, canDismiss: false, error: "Could not confirm activation. Retry to safely check the same plan.",
  } });
});

test("a retry refused after the server found no earlier plan answers it and unlocks the draft", async () => {
  remote.activate.mockRejectedValueOnce(new Error("offline"))
    .mockRejectedValueOnce(new ConvexError({ kind: "recovery", code: "expense_already_recovered" }));
  const { screen } = await open();
  await act(async () => { screen.findByType(ListRow).props.onPress(); });
  await act(async () => { button(screen, "Activate plan").props.onPress(); });
  await act(async () => { button(screen, "Retry activation").props.onPress(); });
  expect(screen.findByType(RecoveryDraft).props).toMatchObject({ pending: false, editable: true, canDismiss: true,
    error: "This expense already has a recovery plan." });
});

/** The app is closed and opened again: nothing survives but what the phone stored. */
async function restart(...args: Parameters<typeof open>) {
  await act(async () => root?.unmount());
  root = undefined;
  return open(...args);
}
function counting() {
  let count = 0;
  uuid.next = () => `uuid-${++count}`;
}

test("a transfer whose reply was lost is resent under its own key after the app restarts", async () => {
  counting();
  remote.move.mockRejectedValueOnce(new Error("lost acknowledgement"));
  const first = await open([plan], true);
  await act(async () => { button(first.screen, "Move money for October").props.onPress(); });
  await act(async () => { button(first.screen, "Post transfer").props.onPress(); });
  const { screen } = await restart([plan], true);
  await act(async () => { screen.findByType(PrimaryButton).props.onPress(); });
  expect(screen.findByType(RecoveryMoveScreen).props).toMatchObject({ pending: true, editable: false,
    error: "Could not confirm the transfer. Retry to safely check the same movement." });
  remote.move.mockImplementationOnce(async (request) => moveReceipt(request));
  await act(async () => { button(screen, "Retry transfer").props.onPress(); });
  const sent = remote.move.mock.calls.map(([request]) => request);
  expect(sent).toHaveLength(2);
  expect(sent[1]).toEqual(sent[0]);
});

test("an activation whose reply was lost is resent under its own key after the app restarts", async () => {
  counting();
  remote.activate.mockRejectedValueOnce(new Error("lost acknowledgement"));
  const first = await open();
  await act(async () => { first.screen.findByType(ListRow).props.onPress(); });
  await act(async () => { button(first.screen, "Activate plan").props.onPress(); });
  const { screen } = await restart();
  await act(async () => { screen.findByType(ListRow).props.onPress(); });
  expect(screen.findByType(RecoveryDraft).props).toMatchObject({ pending: true, editable: false,
    error: "Could not confirm activation. Retry to safely check the same plan." });
  remote.activate.mockImplementationOnce(async (request) => activationReceipt(request));
  await act(async () => { button(screen, "Retry activation").props.onPress(); });
  const sent = remote.activate.mock.calls.map(([request]) => request);
  expect(sent).toHaveLength(2);
  expect(sent[1]).toEqual(sent[0]);
});

const storedKey = "lukapp.recovery.unresolved.owner";
const storeOnPhone = (...requests: unknown[]) => phone.set(storedKey, JSON.stringify({ v: 1, requests }));
const storedRequests = () => phone.has(storedKey) ? JSON.parse(phone.get(storedKey)!).requests : [];
const sentMove = {
  workspaceId: "workspace", planId: "repair", sourceFinancialAccountProfileId: "daily",
  amount: { currency: "COP", minorUnits: 30_000_000 }, accountingDate: "2026-10-17",
  description: "Recovery: Emergency repair", idempotencyKey: "move-1",
};
const sentActivation = {
  workspaceId: "workspace", sourceJournalEntryId: "dental", destinationFinancialAccountProfileId: "savings",
  installmentCount: 4, installmentMinorUnits: 12_000_000, idempotencyKey: "plan-1",
};
const dentalPlan = (over: Partial<RecoveryPlanView> = {}): RecoveryPlanView => ({
  ...plan, id: "dental-plan", title: "Dental care", sourceJournalEntryId: "dental", sourceTitle: "Dental care",
  principalMinorUnits: 48_000_000, installmentCount: 4, installmentMinorUnits: 12_000_000,
  recoveredMinorUnits: 0, remainingMinorUnits: 48_000_000, targetMinorUnits: 48_000_000, dueMinorUnits: 12_000_000, ...over,
});

test("a stored transfer the plan's history lists under its key is settled, and Move money starts a new movement", async () => {
  storeOnPhone({ act: "move", request: sentMove });
  const recorded = { ...plan, contributionHistory: [contribution("oct", { idempotencyKey: "move-1", contributionDate: "2026-10-17" })] };
  const { screen } = await open([recorded], true);
  expect(screen.findByType(RecoveryPlanScreen).props.unconfirmedMove).toBe(false);
  expect(phone.has(storedKey)).toBe(false);
  await act(async () => { button(screen, "Move money for October").props.onPress(); });
  expect(screen.findByType(RecoveryMoveScreen).props).toMatchObject({ pending: false, editable: true, error: "" });
});

test("a stored transfer another phone's movement does not answer stays unconfirmed and resends itself", async () => {
  storeOnPhone({ act: "move", request: sentMove });
  const elsewhere = { ...plan, contributionHistory: [contribution("oct", { idempotencyKey: "other-phone" })] };
  const { screen } = await open([elsewhere], true);
  expect(screen.findByType(RecoveryPlanScreen).props.unconfirmedMove).toBe(true);
  await act(async () => { button(screen, "See the transfer").props.onPress(); });
  remote.move.mockImplementationOnce(async (request) => moveReceipt(request));
  await act(async () => { button(screen, "Retry transfer").props.onPress(); });
  expect(remote.move.mock.calls.map(([request]) => request)).toEqual([sentMove]);
  expect(phone.has(storedKey)).toBe(false);
});

test.each([
  ["a plan with its terms", dentalPlan()],
  ["a cancelled plan with its terms", dentalPlan({ status: "cancelled", remainingMinorUnits: 0, dueMinorUnits: 0 })],
  ["another phone's running plan with other terms", dentalPlan({ installmentCount: 6, installmentMinorUnits: 8_000_000 })],
  ["a completed plan", dentalPlan({ status: "completed", remainingMinorUnits: 0, dueMinorUnits: 0, installmentCount: 12 })],
])("a stored activation is settled once the board shows %s for its expense", async (_case, shown) => {
  storeOnPhone({ act: "activate", request: sentActivation }, { act: "move", request: sentMove });
  await open([plan, shown]);
  expect(storedRequests()).toEqual([{ act: "move", request: sentMove }]);
});

test("a stored activation stays while the expense shows only a cancelled plan with other terms, and the proposal resends it", async () => {
  const earlier = dentalPlan({ id: "dental-old", status: "cancelled", installmentCount: 6, installmentMinorUnits: 8_000_000,
    remainingMinorUnits: 0, dueMinorUnits: 0 });
  storeOnPhone({ act: "activate", request: { ...sentActivation, replacesPlanId: "dental-old" } });
  const { screen } = await open([earlier]);
  await act(async () => { button(screen, "Find another expense").props.onPress(); });
  await act(async () => { screen.findByType(ListRow).props.onPress(); });
  expect(screen.findByType(RecoveryDraft).props).toMatchObject({ pending: true, editable: false, installmentCount: 4,
    error: "Could not confirm activation. Retry to safely check the same plan." });
  remote.activate.mockImplementationOnce(async (request) => activationReceipt(request));
  await act(async () => { button(screen, "Retry activation").props.onPress(); });
  expect(remote.activate.mock.calls.map(([request]) => request)).toEqual([{ ...sentActivation, replacesPlanId: "dental-old" }]);
  expect(phone.has(storedKey)).toBe(false);
});

test.each([
  { name: "cancelled", shown: { ...plan, status: "cancelled" as const, canCancel: false, acceptsContributions: false, dueMinorUnits: 0 }, code: "plan_cancelled" },
  { name: "completed", shown: { ...plan, status: "completed" as const, acceptsContributions: false, remainingMinorUnits: 0, dueMinorUnits: 0 }, code: "plan_already_complete" },
  { name: "with its source Place closed", shown: plan, code: "financial_account_profile_ended" },
])("a stored transfer for a plan $name meanwhile is still reachable, and its retry's refusal settles it", async ({ shown, code }) => {
  storeOnPhone({ act: "move", request: sentMove });
  const { screen } = await open([shown], true);
  expect(button(screen, "See the transfer")).toBeDefined();
  expect(screen.findAll((node) => node.type === Text && node.children.join("") === "Could not confirm the transfer. Retry to safely check the same movement.")).toHaveLength(1);
  await act(async () => { button(screen, "See the transfer").props.onPress(); });
  expect(screen.findByType(Header).props.onBack).toBeUndefined();
  remote.move.mockRejectedValueOnce(new ConvexError({ kind: "recovery", code }));
  await act(async () => { button(screen, "Retry transfer").props.onPress(); });
  expect(remote.move.mock.calls.map(([request]) => request)).toEqual([sentMove]);
  expect(screen.findByType(RecoveryMoveScreen).props).toMatchObject({ pending: false, editable: true, canDismiss: true });
  expect(phone.has(storedKey)).toBe(false);
  await act(async () => { screen.findByType(Header).props.onBack(); });
  expect(screen.findByType(RecoveryPlanScreen).props.unconfirmedMove).toBe(false);
});

test("a retry turned away before the server looked keeps the stored transfer frozen and on the phone across another restart", async () => {
  storeOnPhone({ act: "move", request: sentMove });
  const first = await open([plan], true);
  await act(async () => { button(first.screen, "See the transfer").props.onPress(); });
  remote.move.mockRejectedValueOnce(new ConvexError({ code: "device_revoked" }));
  await act(async () => { button(first.screen, "Retry transfer").props.onPress(); });
  expect(first.screen.findByType(RecoveryMoveScreen).props).toMatchObject({ pending: true, editable: false });
  expect(storedRequests()).toEqual([{ act: "move", request: sentMove }]);
  const { screen } = await restart([plan], true);
  await act(async () => { button(screen, "See the transfer").props.onPress(); });
  remote.move.mockImplementationOnce(async (request) => moveReceipt(request));
  await act(async () => { button(screen, "Retry transfer").props.onPress(); });
  expect(remote.move.mock.calls.map(([request]) => request)).toEqual([sentMove, sentMove]);
  expect(phone.has(storedKey)).toBe(false);
});

test("a stored request for a plan this workspace no longer shows neither blocks other plans nor disappears", async () => {
  storeOnPhone({ act: "move", request: { ...sentMove, planId: "gone" } }, { act: "move", request: { ...sentMove, workspaceId: "other" } });
  counting();
  const { screen } = await open([plan], true);
  expect(screen.findByType(RecoveryPlanScreen).props.unconfirmedMove).toBe(false);
  await act(async () => { button(screen, "Move money for October").props.onPress(); });
  remote.move.mockImplementationOnce(async (request) => moveReceipt(request));
  await act(async () => { button(screen, "Post transfer").props.onPress(); });
  expect(remote.move.mock.calls.map(([request]) => request.planId)).toEqual(["repair"]);
  expect(remote.move.mock.calls[0][0].idempotencyKey).not.toBe("move-1");
  expect(storedRequests()).toEqual([{ act: "move", request: { ...sentMove, planId: "gone" } }, { act: "move", request: { ...sentMove, workspaceId: "other" } }]);
});

test.each(["header", "android"])("an unreadable store sends nothing new, %s back returns to the plan twice, and Try again reads it again", async (method) => {
  phone.set(storedKey, "{not json");
  const { screen } = await open([plan], true);
  for (let round = 0; round < 2; round++) {
    await act(async () => { button(screen, "Move money for October").props.onPress(); });
    expect(screen.findAllByType(RecoveryMoveScreen)).toHaveLength(0);
    expect(screen.findByType(Header).props.title).toBe("We couldn't read this phone's saved request");
    expect(JSON.stringify(root?.toJSON())).toContain("An earlier transfer or plan activation may be waiting on this phone. Try reading it again before starting anything new.");
    await act(async () => { if (method === "header") screen.findByType(Header).props.onBack(); else stack.goBack(); });
    expect(screen.findByType(RecoveryPlanScreen).props.plan.id).toBe("repair");
  }
  expect(stack.getRootState()?.routes.map((route) => route.name)).toEqual(["index", "plans", "recovery"]);
  await act(async () => { button(screen, "Move money for October").props.onPress(); });
  storeOnPhone({ act: "move", request: sentMove });
  await act(async () => { button(screen, "Try again").props.onPress(); });
  expect(screen.findByType(RecoveryMoveScreen).props).toMatchObject({ pending: true, editable: false });
  expect(remote.move).not.toHaveBeenCalled();
});

test("an unreadable store keeps a proposal from starting until it can be read", async () => {
  phone.set(storedKey, JSON.stringify({ v: 1, requests: [{ act: "activate", request: { ...sentActivation, note: "x" } }] }));
  const { screen } = await open();
  await act(async () => { screen.findByType(ListRow).props.onPress(); });
  expect(screen.findAllByType(RecoveryDraft)).toHaveLength(0);
  expect(screen.findByType(Header).props.title).toBe("We couldn't read this phone's saved request");
  await act(async () => { screen.findByType(Header).props.onBack(); });
  expect(screen.findByType(RecoveryCandidates)).toBeDefined();
  expect(remote.activate).not.toHaveBeenCalled();
});

test("when the phone can't save the request nothing is sent, and the next press sends once it can", async () => {
  counting();
  const { screen } = await open([plan], true);
  await act(async () => { button(screen, "Move money for October").props.onPress(); });
  failing.writes = 1;
  await act(async () => { button(screen, "Post transfer").props.onPress(); });
  expect(remote.move).not.toHaveBeenCalled();
  expect(screen.findByType(RecoveryMoveScreen).props).toMatchObject({ pending: false, editable: true, canDismiss: true,
    error: "This phone couldn't save the request before sending it, so nothing was sent. Try again." });
  let saved: unknown;
  remote.move.mockImplementationOnce(async (request) => { saved = storedRequests(); return moveReceipt(request); });
  await act(async () => { button(screen, "Post transfer").props.onPress(); });
  expect(remote.move).toHaveBeenCalledOnce();
  expect(saved).toEqual([{ act: "move", request: remote.move.mock.calls[0][0] }]);
  expect(phone.has(storedKey)).toBe(false);
});

test("a known outcome the phone fails to delete doesn't hold the person, and its leftover settles from the board after a restart", async () => {
  storeOnPhone({ act: "move", request: sentMove });
  const first = await open([plan], true);
  await act(async () => { button(first.screen, "See the transfer").props.onPress(); });
  failing.deletes = 1;
  remote.move.mockImplementationOnce(async (request) => moveReceipt(request));
  await act(async () => { button(first.screen, "Retry transfer").props.onPress(); });
  expect(JSON.stringify(root?.toJSON())).toContain("COP 300.000 moved");
  expect(storedRequests()).toEqual([{ act: "move", request: sentMove }]);
  await act(async () => { button(first.screen, "View recovery plan").props.onPress(); });
  expect(first.screen.findByType(RecoveryPlanScreen).props.unconfirmedMove).toBe(false);
  const recorded = { ...plan, contributionHistory: [contribution("oct", { idempotencyKey: "move-1", contributionDate: "2026-10-17" })] };
  const { screen } = await restart([recorded], true);
  expect(screen.findByType(RecoveryPlanScreen).props.unconfirmedMove).toBe(false);
  expect(phone.has(storedKey)).toBe(false);
  expect(remote.move).toHaveBeenCalledOnce();
});

function activationReceipt(request: Parameters<RecoveryEditorTransport["save"]>[0], replay = true) {
  return {
    replay,
    plan: { ...request, id: "dental-plan", title: "Dental care", principalMinorUnits: 48_000_000,
      impliedAnnualRateBps: 0, currency: "COP", activationMonth: "2026-10", createdBy: "owner", createdAt: 1 },
  };
}

function contribution(id: string, over: Partial<RecoveryContribution> = {}): RecoveryContribution {
  return {
    id, workspaceId: "workspace", planId: "repair", transferJournalEntryId: `transfer-${id}`, amountMinorUnits: 30_000_000,
    contributionDate: "2026-09-18", idempotencyKey: `key-${id}`, createdBy: "owner", recordedAt: Date.UTC(2026, 8, 18, 17),
    status: "active", transferReversed: false, correction: undefined, correctsContributionId: undefined, ...over,
  };
}
const repair: RecoveryPlanView = {
  ...plan,
  contributionHistory: [
    contribution("aug", { contributionDate: "2026-08-18", amountMinorUnits: 25_000_000, status: "voided", transferReversed: true }),
    contribution("sep"),
  ],
};
const appliance: RecoveryPlanView = {
  ...plan, id: "appliance", title: "Home appliance", sourceJournalEntryId: "expense-appliance",
  activationDate: "2026-06-01", activationMonth: "2026-06", remainingMinorUnits: 200_000_000, recoveredMinorUnits: 0, contributionHistory: [],
};
const repairCandidate: RecoveryCandidate = {
  journalEntryId: "expense-repair", title: "Emergency repair", accountingDate: "2026-05-02",
  amountMinorUnits: 120_000_000, financialAccountProfileId: "daily", placeName: "Daily account",
};
const cancellation = {
  id: "cancel-1", workspaceId: "workspace", planId: "repair", reason: "Income changed", idempotencyKey: "cancel-key",
  createdBy: "owner", cancellationDate: "2026-10-05", eventTime: Date.UTC(2026, 9, 5, 15), recordedAt: Date.UTC(2026, 9, 5, 15),
  origin: { kind: "person" as const },
};
const cancelledRepair: RecoveryPlanView = {
  ...repair, canCancel: false, acceptsContributions: false, status: "cancelled", cancellation, remainingMinorUnits: 0, dueMinorUnits: 0,
};
function texts() {
  return root?.root.findAll((node) => node.type === Text).map((node) => node.children.join("")) ?? [];
}
function alerts() {
  return root?.root.findAll((node) => node.type === Text && node.props.accessibilityRole === "alert")
    .map((node) => node.children.join("")) ?? [];
}
function field(screen: ReactTestInstance, label: string) {
  return screen.find((node) => node.type === TextInput && node.props.accessibilityLabel === label);
}
function labels(screen: ReactTestInstance) {
  return screen.findAll((node) => node.type === PrimaryButton || node.type === SecondaryButton).map((node) => node.props.label);
}
function cancelReceipt(request: Parameters<RecoveryCancelTransport["cancel"]>[0]) {
  return { replay: false, cancellation: { ...cancellation, idempotencyKey: request.idempotencyKey, reason: request.reason } };
}

test("Cancel plan explains what stays, sends one trimmed command, and the cancelled plan offers a linked replacement", async () => {
  const { screen } = await open([repair], true);
  expect(labels(screen)).toEqual(["Move money for October", "Find another expense", "Cancel plan"]);
  await act(async () => { button(screen, "Cancel plan").props.onPress(); });
  expect(screen.findByType(Header).props).toMatchObject({ title: "Cancel this plan?", eyebrow: "EMERGENCY REPAIR" });
  expect(texts()).toEqual(expect.arrayContaining([
    "Already moved back to savings",
    "COP 1.800.000",
    "The COP 1.800.000 you already moved to Savings stays there and stays counted in this plan’s history.",
    "Cancelling moves no money. Nothing is transferred or refunded.",
    "The rest of the plan is released. This expense can get a new plan with a new schedule.",
    "This plan’s terms are not edited. Its schedule stays in history as it was.",
  ]));
  await act(async () => { field(screen, "Reason for cancelling").props.onChangeText("  Income changed  "); });
  uuid.next = () => "cancel-key";
  remote.cancel.mockImplementationOnce(async (request) => {
    remote.query.mockReturnValue({ ...evaluation, plans: [cancelledRepair], candidates: [repairCandidate, candidate] });
    return cancelReceipt(request);
  });
  await act(async () => { button(screen, "Cancel plan").props.onPress(); });
  expect(remote.cancel.mock.calls).toEqual([[{
    workspaceId: "workspace", planId: "repair", reason: "Income changed", idempotencyKey: "cancel-key",
  }]]);
  expect(screen.findByType(RecoveryPlanScreen).props.plan.status).toBe("cancelled");
  expect(alerts()).toEqual(["Plan cancelled. The money you moved stays in savings."]);
  expect(texts()).toEqual(expect.arrayContaining([
    "Cancelled on October 5, 2026", "Reason: Income changed", "COP 1.800.000",
    "COP 1.200.000 of this expense is open for a new plan.",
  ]));
  expect(labels(screen)).toEqual(["Start a replacement", "Find another expense"]);
  expect(screen.findAll((node) => node.type === ListRow && node.props.title === "Due this month")).toHaveLength(0);
  expect(screen.findAll((node) => node.type === ListRow && node.props.title === "COP 300.000")).toHaveLength(1);
  uuid.next = () => "replacement-key";
  await act(async () => { button(screen, "Start a replacement").props.onPress(); });
  expect(screen.findByType(Header).props.eyebrow).toBe("EMERGENCY REPAIR · REPLACEMENT");
  expect(texts()).toContain("This plan replaces the cancelled one. Money counted toward the cancelled plan stays there.");
  expect(screen.findByType(RecoveryDraft).props).toMatchObject({ candidate: repairCandidate, amount: typedAmount("300000"), replacing: true });
  await act(async () => { button(screen, "Activate plan").props.onPress(); });
  expect(remote.activate.mock.calls).toEqual([[{
    workspaceId: "workspace", sourceJournalEntryId: "expense-repair", destinationFinancialAccountProfileId: "savings",
    installmentCount: 4, installmentMinorUnits: 30_000_000, idempotencyKey: "replacement-key", replacesPlanId: "repair",
  }]]);
});

test("a cancellation without a reason omits it", async () => {
  const { screen } = await open([repair], true);
  await act(async () => { button(screen, "Cancel plan").props.onPress(); });
  await act(async () => { field(screen, "Reason for cancelling").props.onChangeText("   "); });
  uuid.next = () => "cancel-key";
  remote.cancel.mockImplementationOnce(async (request) => cancelReceipt(request));
  await act(async () => { button(screen, "Cancel plan").props.onPress(); });
  expect(remote.cancel.mock.calls).toEqual([[{ workspaceId: "workspace", planId: "repair", idempotencyKey: "cancel-key" }]]);
});

test.each(["keep", "header", "android", "ios"])("%s leaves the cancel confirmation for the same plan twice without sending anything", async (method) => {
  const { screen, onBack } = await open([repair, appliance], true);
  await act(async () => { screen.findAllByType(ListRow)[0].props.onPress(); });
  for (const round of [1, 2]) {
    await act(async () => { button(screen, "Cancel plan").props.onPress(); });
    expect(screen.findByType(Header).props.title).toBe("Cancel this plan?");
    await act(async () => { field(screen, "Reason for cancelling").props.onChangeText(`draft ${round}`); });
    await act(async () => {
      if (method === "keep") button(screen, "Keep plan").props.onPress();
      else if (method === "header") screen.findByType(Header).props.onBack();
      else if (method === "android") stack.goBack();
      else stack.dispatch(StackActions.pop(1));
    });
    expect(screen.findAllByType(RecoveryPlanScreen)).toHaveLength(1);
    expect(screen.findByType(RecoveryPlanScreen).props.plan.id).toBe("repair");
    expect(stack.getRootState()?.routes.map((route) => route.name)).toEqual(["index", "plans", "recovery"]);
  }
  expect(remote.cancel).not.toHaveBeenCalled();
  await act(async () => { stack.goBack(); });
  expect(screen.findByType(RecoveryPlanList).props.plans).toHaveLength(2);
  await act(async () => { stack.goBack(); });
  expect(stack.getRootState()?.routes.map((route) => route.name)).toEqual(["index", "plans"]);
  expect(onBack).not.toHaveBeenCalled();
});

test("an uncertain cancellation stays frozen, ignores back, and retries the identical command", async () => {
  const { screen } = await open([repair], true);
  await act(async () => { button(screen, "Cancel plan").props.onPress(); });
  await act(async () => { field(screen, "Reason for cancelling").props.onChangeText("Income changed"); });
  uuid.next = () => "cancel-key";
  remote.cancel.mockRejectedValueOnce(new Error("offline"));
  await act(async () => { button(screen, "Cancel plan").props.onPress(); });
  expect(alerts()).toEqual(["Could not confirm the cancellation. Retry to safely check the same request."]);
  expect(screen.findByType(Header).props.onBack).toBeUndefined();
  expect(labels(screen)).toEqual(["Retry cancellation"]);
  expect(field(screen, "Reason for cancelling").props.editable).toBe(false);
  await act(async () => { field(screen, "Reason for cancelling").props.onChangeText("Something else"); });
  await act(async () => { stack.goBack(); stack.dispatch(StackActions.pop(1)); });
  expect(screen.findByType(Header).props.title).toBe("Cancel this plan?");
  uuid.next = () => "new-key";
  remote.cancel.mockImplementationOnce(async (request) => cancelReceipt(request));
  await act(async () => { button(screen, "Retry cancellation").props.onPress(); });
  const sent = { workspaceId: "workspace", planId: "repair", reason: "Income changed", idempotencyKey: "cancel-key" };
  expect(remote.cancel.mock.calls.map(([request]) => request)).toEqual([sent, sent]);
  expect(screen.findByType(RecoveryPlanScreen).props.notice).toBe("cancelled");
});

test("an access failure during cancellation goes to the device handler and the retry repeats the command", async () => {
  const revoked = new ConvexError({ code: "session_inactive" });
  const reported: unknown[] = [];
  access.report = (error) => { reported.push(error); return error === revoked; };
  const { screen } = await open([repair], true);
  await act(async () => { button(screen, "Cancel plan").props.onPress(); });
  uuid.next = () => "cancel-key";
  remote.cancel.mockRejectedValueOnce(revoked).mockImplementationOnce(async (request) => cancelReceipt(request));
  await act(async () => { button(screen, "Cancel plan").props.onPress(); });
  expect(reported).toEqual([revoked]);
  uuid.next = () => "new-key";
  await act(async () => { button(screen, "Retry cancellation").props.onPress(); });
  expect(remote.cancel.mock.calls.map(([request]) => request.idempotencyKey)).toEqual(["cancel-key", "cancel-key"]);
});

test.each([
  { code: "plan_already_cancelled", message: "This plan was already cancelled. Nothing else changed." },
  { code: "plan_already_complete", message: "This plan is already complete, so there is nothing left to cancel." },
  { code: "reason_invalid", message: "Keep the reason under 1,000 characters." },
  { code: "plan_not_found", message: "This plan is no longer available." },
  { code: "idempotency_key_conflict", message: "The plan was not cancelled. Try again." },
])("cancellation refusal $code keeps the reason and explains it", async ({ code, message }) => {
  const { screen } = await open([repair], true);
  await act(async () => { button(screen, "Cancel plan").props.onPress(); });
  await act(async () => { field(screen, "Reason for cancelling").props.onChangeText("Income changed"); });
  remote.cancel.mockRejectedValueOnce(new ConvexError({ kind: "recovery", code }));
  await act(async () => { button(screen, "Cancel plan").props.onPress(); });
  expect(alerts()).toEqual([message]);
  expect(field(screen, "Reason for cancelling").props).toMatchObject({ value: "Income changed", editable: true });
  expect(screen.findByType(Header).props.onBack).toBeDefined();
  expect(JSON.stringify(root?.toJSON())).not.toContain(code);
});

test("a completed plan offers no cancel while a suspended plan can still be cancelled", async () => {
  const completed = { ...repair, canCancel: false, acceptsContributions: false, status: "completed" as const, remainingMinorUnits: 0, dueMinorUnits: 0, recoveredMinorUnits: 300_000_000 };
  const { screen } = await open([completed], true);
  expect(labels(screen)).toEqual(["Find another expense"]);
  await act(async () => root?.unmount());
  const suspended = { ...repair, acceptsContributions: false, status: "suspended" as const, dueMinorUnits: 0 };
  const next = await open([suspended], true);
  expect(labels(next.screen)).toEqual(["Find another expense", "Cancel plan"]);
});

test("cancelled and completed plans sit in a quieter past group after current plans", async () => {
  const replacement = { ...appliance, id: "repair-2", title: "Emergency repair again", replacesPlanId: "repair" };
  const completed = { ...appliance, id: "laptop", title: "Laptop", canCancel: false, acceptsContributions: false, status: "completed" as const, remainingMinorUnits: 0, recoveredMinorUnits: 300_000_000, targetMinorUnits: 300_000_000 };
  const { screen } = await open([{ ...cancelledRepair, replacedByPlanId: "repair-2" }, completed, replacement], true);
  const groups = screen.findByType(RecoveryPlanList).findAllByType(ListGroup);
  expect(groups.map((group) => group.findAllByType(ListRow).map((row) => [row.props.title, row.props.detail, row.props.value]))).toEqual([
    [["Emergency repair again", "COP 0 of COP 3.000.000 moved back to savings", "0%"]],
    [
      ["Emergency repair", "Cancelled · COP 1.800.000 moved back to savings", "Cancelled"],
      ["Laptop", "COP 3.000.000 of COP 3.000.000 moved back to savings", "100%"],
    ],
  ]);
  expect(texts()).toContain("PAST PLANS");
  expect(groups[1].findAllByType(ListRow).every((row) => row.props.titleStyle && row.props.valueStyle)).toBe(true);
});

const secondRepair: RecoveryPlanView = {
  ...cancelledRepair, id: "repair-2", title: "Emergency repair again", replacesPlanId: "repair", replacedByPlanId: "repair-3",
};
const thirdRepair: RecoveryPlanView = { ...appliance, id: "repair-3", title: "Emergency repair third", replacesPlanId: "repair-2" };
const shownPlan = () => root?.root.findByType(RecoveryPlanScreen).props.plan.id;
const routeNames = () => stack.getRootState()?.routes.map((route) => route.name);
async function follow(title: "Replaced by" | "Replaces") {
  const row = root?.root.find((node) => node.type === ListRow && node.props.title === title);
  await act(async () => { row?.props.onPress(); });
}
async function openFromList(title: string) {
  const row = root?.root.find((node) => node.type === ListRow && node.props.title === title);
  await act(async () => { row?.props.onPress(); });
}
async function goBack(method: "android" | "ios" | "header") {
  await act(async () => {
    if (method === "header") root?.root.findAllByType(Header)[0].props.onBack();
    else if (method === "android") stack.goBack();
    else stack.dispatch(StackActions.pop(1));
  });
}

test.each(["android", "ios", "header"] as const)("%s back from a linked plan returns to the plan it was opened from, twice", async (method) => {
  await open([{ ...cancelledRepair, replacedByPlanId: "repair-2" }, { ...appliance, id: "repair-2", title: "Emergency repair again", replacesPlanId: "repair" }], true, "plans", [candidate]);
  await openFromList("Emergency repair");
  for (const round of [1, 2]) {
    await follow("Replaced by");
    expect(shownPlan()).toBe("repair-2");
    await goBack(method);
    expect({ round, plan: shownPlan(), routes: routeNames() }).toEqual({ round, plan: "repair", routes: ["index", "plans", "recovery"] });
  }
  await goBack(method);
  expect(root?.root.findByType(RecoveryPlanList).props.plans).toHaveLength(2);
  await goBack(method);
  expect(routeNames()).toEqual(["index", "plans"]);
});

test.each(["android", "ios", "header"] as const)("the reciprocal link on a linked plan returns to its caller instead of stepping forward, twice (%s)", async (method) => {
  await open([{ ...cancelledRepair, replacedByPlanId: "repair-2" }, { ...appliance, id: "repair-2", title: "Emergency repair again", replacesPlanId: "repair" }], true, "plans", [candidate]);
  await openFromList("Emergency repair");
  for (const round of [1, 2]) {
    await follow("Replaced by");
    await follow("Replaces");
    expect({ round, plan: shownPlan(), screens: root?.root.findAllByType(RecoveryPlanScreen).length }).toEqual({ round, plan: "repair", screens: 1 });
  }
  await goBack(method);
  expect(root?.root.findAllByType(RecoveryPlanScreen)).toHaveLength(0);
  expect(root?.root.findByType(RecoveryPlanList).props.plans).toHaveLength(2);
  await goBack(method);
  expect(routeNames()).toEqual(["index", "plans"]);
});

test.each(["android", "ios", "header"] as const)("a chain of linked plans returns step by step and never adds a plan twice (%s)", async (method) => {
  await open([{ ...cancelledRepair, replacedByPlanId: "repair-2" }, secondRepair, thirdRepair], true, "plans", [candidate]);
  for (const round of [1, 2]) {
    await openFromList("Emergency repair");
    await follow("Replaced by");
    await follow("Replaced by");
    expect(shownPlan()).toBe("repair-3");
    await follow("Replaces");
    expect(shownPlan()).toBe("repair-2");
    await follow("Replaced by");
    await act(async () => { root?.root.findByType(RecoveryPlanScreen).props.onPlan("repair"); });
    expect(shownPlan()).toBe("repair");
    await follow("Replaced by");
    await follow("Replaced by");
    const steps: (string | undefined)[] = [];
    for (let back = 0; back < 3; back += 1) {
      await goBack(method);
      steps.push(root?.root.findAllByType(RecoveryPlanScreen)[0]?.props.plan.id ?? "list");
    }
    expect({ round, steps, routes: routeNames() }).toEqual({ round, steps: ["repair-2", "repair", "list"], routes: ["index", "plans", "recovery"] });
  }
  await goBack(method);
  expect(routeNames()).toEqual(["index", "plans"]);
});

test("returning from a linked plan keeps the caller's notice", async () => {
  const { screen } = await open([repair, appliance], true);
  await openFromList("Emergency repair");
  await act(async () => { button(screen, "Cancel plan").props.onPress(); });
  await act(async () => { field(screen, "Reason for cancelling").props.onChangeText("Income changed"); });
  remote.cancel.mockImplementationOnce(async (request) => {
    remote.query.mockReturnValue({
      ...evaluation,
      plans: [{ ...cancelledRepair, replacedByPlanId: "repair-2" }, { ...appliance, id: "repair-2", title: "Emergency repair again", replacesPlanId: "repair" }],
      candidates: [candidate],
    });
    return cancelReceipt(request);
  });
  await act(async () => { button(screen, "Cancel plan").props.onPress(); });
  expect(alerts()).toEqual(["Plan cancelled. The money you moved stays in savings."]);
  for (const round of [1, 2]) {
    await follow("Replaced by");
    expect(alerts()).toEqual([]);
    await goBack("android");
    expect({ round, plan: shownPlan(), alerts: alerts() }).toEqual({
      round, plan: "repair", alerts: ["Plan cancelled. The money you moved stays in savings."],
    });
  }
});

test.each(["android", "ios", "header"])("declining a replacement draft with %s back returns to the cancelled plan, twice", async (method) => {
  const { screen } = await open([cancelledRepair], true, "plans", [repairCandidate]);
  for (const round of [1, 2]) {
    await act(async () => { button(screen, "Start a replacement").props.onPress(); });
    expect(screen.findByType(RecoveryDraft).props.replacing).toBe(true);
    await act(async () => {
      if (method === "header") screen.findByType(Header).props.onBack();
      else if (method === "android") stack.goBack();
      else stack.dispatch(StackActions.pop(1));
    });
    expect(screen.findAllByType(RecoveryCandidates)).toHaveLength(0);
    expect(screen.findByType(RecoveryPlanScreen).props.plan.id).toBe("repair");
    expect(stack.getRootState()?.routes.map((route) => route.name)).toEqual(["index", "plans", "recovery"]);
    expect(round).toBeGreaterThan(0);
  }
  expect(remote.activate).not.toHaveBeenCalled();
});

test("starting the same expense later from candidates still links the replacement", async () => {
  const { screen } = await open([cancelledRepair], true, "plans", [repairCandidate, candidate]);
  await act(async () => { button(screen, "Find another expense").props.onPress(); });
  await act(async () => { screen.findAllByType(ListRow)[1].props.onPress(); });
  expect(screen.findByType(RecoveryDraft).props).toMatchObject({ candidate: { title: "Dental care" }, replacing: false });
  await act(async () => { screen.findByType(Header).props.onBack(); });
  await act(async () => { screen.findAllByType(ListRow)[0].props.onPress(); });
  expect(screen.findByType(RecoveryDraft).props).toMatchObject({ candidate: repairCandidate, replacing: true });
  uuid.next = () => "replacement-key";
  await act(async () => { button(screen, "Activate plan").props.onPress(); });
  expect(remote.activate.mock.calls[0][0]).toMatchObject({ sourceJournalEntryId: "expense-repair", replacesPlanId: "repair" });
  await act(async () => { root?.unmount(); });
  const next = await open([cancelledRepair, { ...appliance, id: "repair-2", replacesPlanId: "repair" }].map((item) =>
    item.id === "repair" ? { ...item, replacedByPlanId: "repair-2" } : item), true, "plans", [candidate]);
  await act(async () => { next.screen.findAllByType(ListRow)[1].props.onPress(); });
  expect(next.screen.findAll((node) => node.type === PrimaryButton && node.props.label === "Start a replacement")).toHaveLength(0);
});

test.each([
  { code: "replacement_already_exists", message: "The cancelled plan already has a replacement." },
  { code: "replacement_plan_not_cancelled", message: "This can no longer replace the cancelled plan. Go back and check the plan." },
  { code: "replacement_expense_mismatch", message: "This can no longer replace the cancelled plan. Go back and check the plan." },
  { code: "replacement_plan_not_found", message: "This can no longer replace the cancelled plan. Go back and check the plan." },
])("replacement refusal $code is explained on the draft", async ({ code, message }) => {
  const { screen } = await open([cancelledRepair], true, "plans", [repairCandidate]);
  await act(async () => { button(screen, "Start a replacement").props.onPress(); });
  remote.activate.mockRejectedValueOnce(new ConvexError({ kind: "recovery", code }));
  await act(async () => { button(screen, "Activate plan").props.onPress(); });
  expect(screen.findByType(RecoveryDraft).props).toMatchObject({ error: message, editable: true, canDismiss: true });
});

test("a cancelled plan with nothing left to recover explains that no replacement is needed", async () => {
  const { screen } = await open([cancelledRepair], true, "plans", [candidate]);
  expect(texts()).toContain("Nothing of this expense is left to recover, so there is no replacement to start.");
  expect(labels(screen)).toEqual(["Find another expense"]);
});

const correctionRecordedAt = Date.UTC(2026, 9, 2, 20, 30);
const others: RecoveryPlanView[] = [
  { ...appliance, id: "card", title: "Card fee", destinationFinancialAccountProfileId: "wallet", destinationName: "Wallet" },
  { ...appliance, id: "trip", title: "Trip", activationDate: "2026-10-01", activationMonth: "2026-10" },
  { ...appliance, id: "small", title: "Small fix", remainingMinorUnits: 10_000_000 },
  { ...appliance, id: "paused", title: "Paused", acceptsContributions: false, status: "suspended" },
  { ...appliance, id: "ended", title: "Ended", canCancel: false, acceptsContributions: false, status: "cancelled", cancellation: { ...cancellation, planId: "ended" } },
];
function correctionReceipt(request: Parameters<RecoveryCorrectionTransport["correct"]>[0]) {
  return {
    replay: false,
    correction: {
      id: "correction-1", workspaceId: "workspace", contributionId: request.contributionId, reason: request.reason,
      targetPlanId: request.targetPlanId, contributionDate: "2026-09-18", idempotencyKey: request.idempotencyKey,
      createdBy: "owner", recordedAt: correctionRecordedAt,
    },
  };
}
async function openFix(plans: RecoveryPlanView[] = [repair, appliance, ...others]) {
  const opened = await open(plans, true);
  await act(async () => { opened.screen.findAllByType(ListRow)[0].props.onPress(); });
  expect(opened.screen.findByType(RecoveryPlanScreen).props.plan.id).toBe("repair");
  await act(async () => {
    opened.screen.find((node) => node.type === ListRow && node.props.title === "COP 300.000").props.onPress();
  });
  return opened;
}
function choices(screen: ReactTestInstance) {
  return screen.findByType(RecoveryCorrectScreen).findAllByType(Choice).map((node) => [node.props.label, node.props.selected]);
}
function choose(screen: ReactTestInstance, label: string) {
  return act(async () => {
    screen.findByType(RecoveryCorrectScreen).findAllByType(Choice).find((node) => node.props.label === label)?.props.onPress();
  });
}

test("Fix attribution lists only plans that can take the contribution and sends one planning-only correction", async () => {
  const { screen } = await openFix();
  expect(screen.findByType(Header).props).toMatchObject({ title: "Change the plan it counts toward", eyebrow: "EMERGENCY REPAIR" });
  expect(texts()).toEqual(expect.arrayContaining([
    "COP 300.000", "September 18, 2026 · counts toward Emergency repair",
    "This changes only which plan the transfer counts toward. It does not move money or reverse the transfer.",
  ]));
  expect(choices(screen)).toEqual([["Don’t count it toward a plan", false], ["Home appliance", false]]);
  expect(screen.findByType(RecoveryCorrectScreen).findAllByType(Choice)[1].props.detail).toBe("COP 2.000.000 left to recover");
  expect(button(screen, "Save correction").props.disabled).toBe(true);
  await choose(screen, "Home appliance");
  expect(button(screen, "Save correction").props.disabled).toBe(true);
  await act(async () => { field(screen, "Reason for the correction").props.onChangeText("  Wrong plan  "); });
  expect(button(screen, "Save correction").props.disabled).toBe(false);
  uuid.next = () => "fix-key";
  const corrected = {
    ...repair,
    contributionHistory: repair.contributionHistory.map((item) => item.id === "sep" ? {
      ...item, status: "corrected" as const,
      correction: { ...correctionReceipt({ workspaceId: "workspace", contributionId: "sep", reason: "Wrong plan", targetPlanId: "appliance", idempotencyKey: "fix-key" }).correction },
    } : item),
  };
  remote.correct.mockImplementationOnce(async (request) => {
    remote.query.mockReturnValue({
      ...evaluation, candidates: [candidate],
      plans: [corrected, { ...appliance, contributionHistory: [contribution("sep-moved", { planId: "appliance", correctsContributionId: "sep" })] }, ...others],
    });
    return correctionReceipt(request);
  });
  await act(async () => { button(screen, "Save correction").props.onPress(); });
  expect(remote.correct.mock.calls).toEqual([[{
    workspaceId: "workspace", contributionId: "sep", reason: "Wrong plan", targetPlanId: "appliance", idempotencyKey: "fix-key",
  }]]);
  expect(screen.findByType(RecoveryPlanScreen).props.plan.id).toBe("repair");
  expect(alerts()).toEqual(["Contribution now counts toward the right plan. No money moved."]);
  const row = screen.find((node) => node.type === ListRow && node.props.title === "COP 300.000");
  expect([row.props.value, row.props.detail]).toEqual([
    "Corrected", "September 18, 2026\nMoved to Home appliance\nReason: Wrong plan\nRecorded Oct 2, 2026, 3:30 PM",
  ]);
  await act(async () => { row.props.onPress(); });
  expect(screen.findByType(RecoveryPlanScreen).props.plan.id).toBe("appliance");
  const moved = screen.find((node) => node.type === ListRow && node.props.title === "COP 300.000");
  expect([moved.props.value, moved.props.detail]).toEqual(["Counted", "September 18, 2026\nMoved from Emergency repair"]);
  await act(async () => { stack.goBack(); });
  expect(screen.findByType(RecoveryPlanScreen).props.plan.id).toBe("repair");
  expect(alerts()).toEqual(["Contribution now counts toward the right plan. No money moved."]);
  await act(async () => { stack.goBack(); });
  expect(screen.findByType(RecoveryPlanList).props.plans).toHaveLength(7);
});

test("removing the attribution sends no target plan", async () => {
  const { screen } = await openFix();
  await choose(screen, "Don’t count it toward a plan");
  await act(async () => { field(screen, "Reason for the correction").props.onChangeText("Not a recovery transfer"); });
  uuid.next = () => "fix-key";
  remote.correct.mockImplementationOnce(async (request) => correctionReceipt(request));
  await act(async () => { button(screen, "Save correction").props.onPress(); });
  expect(remote.correct.mock.calls).toEqual([[{
    workspaceId: "workspace", contributionId: "sep", reason: "Not a recovery transfer", idempotencyKey: "fix-key",
  }]]);
});

test.each([
  ["correction_exceeds_plan_remaining", "Home appliance has less left to recover than this contribution. Choose another plan or don’t count it."],
  ["transfer_destination_mismatch", "This transfer went to a different place than Home appliance uses. Choose another plan or don’t count it."],
  ["transfer_predates_activation", "This transfer happened before Home appliance started, so it can’t count toward it. Choose another plan or don’t count it."],
  ["plan_cancelled", "Home appliance was cancelled. Choose another plan or don’t count it."],
  ["expense_not_recoverable", "The expense behind Home appliance was reversed, so it can’t take contributions now. Choose another plan or don’t count it."],
  ["plan_not_found", "That plan is no longer available. Choose another plan or don’t count it."],
  ["transfer_capacity_exceeded", "Other plans already count part of this transfer, so the whole amount can’t move there. Choose another plan or don’t count it."],
  ["correction_target_same_plan", "It already counts toward that plan. Choose a different one."],
  ["contribution_voided", "The transfer behind this contribution was reversed, so its attribution can’t change."],
  ["contribution_already_corrected", "This contribution was already corrected. Nothing else changed."],
  ["contribution_not_found", "This contribution is no longer available."],
  ["reason_invalid", "Keep the reason between 1 and 1,000 characters."],
  ["transfer_not_usable", "The correction was not saved. Try again."],
])("correction refusal %s keeps the choice and reason and explains it", async (code, message) => {
  const { screen } = await openFix();
  await choose(screen, "Home appliance");
  await act(async () => { field(screen, "Reason for the correction").props.onChangeText("Wrong plan"); });
  remote.correct.mockRejectedValueOnce(new ConvexError({ kind: "recovery", code }));
  await act(async () => { button(screen, "Save correction").props.onPress(); });
  expect(alerts()).toEqual([message]);
  expect(choices(screen)).toEqual([["Don’t count it toward a plan", false], ["Home appliance", true]]);
  expect(field(screen, "Reason for the correction").props).toMatchObject({ value: "Wrong plan", editable: true });
  expect(screen.findByType(Header).props.onBack).toBeDefined();
  expect(JSON.stringify(root?.toJSON())).not.toContain(code);
});

test("an uncertain correction stays frozen, ignores back, and retries the identical command", async () => {
  const { screen } = await openFix();
  await choose(screen, "Home appliance");
  await act(async () => { field(screen, "Reason for the correction").props.onChangeText("Wrong plan"); });
  uuid.next = () => "fix-key";
  remote.correct.mockRejectedValueOnce(new Error("offline"));
  await act(async () => { button(screen, "Save correction").props.onPress(); });
  expect(alerts()).toEqual(["Could not confirm the correction. Retry to safely check the same request."]);
  expect(screen.findByType(Header).props.onBack).toBeUndefined();
  await choose(screen, "Don’t count it toward a plan");
  await act(async () => { field(screen, "Reason for the correction").props.onChangeText("Changed"); });
  expect(choices(screen)).toEqual([["Don’t count it toward a plan", false], ["Home appliance", true]]);
  expect(field(screen, "Reason for the correction").props).toMatchObject({ value: "Wrong plan", editable: false });
  await act(async () => { stack.goBack(); stack.dispatch(StackActions.pop(1)); });
  expect(screen.findAllByType(RecoveryCorrectScreen)).toHaveLength(1);
  uuid.next = () => "new-key";
  remote.correct.mockImplementationOnce(async (request) => correctionReceipt(request));
  await act(async () => { button(screen, "Retry correction").props.onPress(); });
  const sent = { workspaceId: "workspace", contributionId: "sep", reason: "Wrong plan", targetPlanId: "appliance", idempotencyKey: "fix-key" };
  expect(remote.correct.mock.calls.map(([request]) => request)).toEqual([sent, sent]);
  expect(screen.findByType(RecoveryPlanScreen).props.notice).toBe("corrected");
});

test.each(["header", "android", "ios"])("%s back leaves Fix attribution for the same plan twice without sending anything", async (method) => {
  const { screen, onBack } = await openFix();
  for (const round of [1, 2]) {
    if (round === 2) {
      await act(async () => {
        screen.find((node) => node.type === ListRow && node.props.title === "COP 300.000").props.onPress();
      });
    }
    expect(screen.findAllByType(RecoveryCorrectScreen)).toHaveLength(1);
    await choose(screen, "Home appliance");
    await act(async () => {
      if (method === "header") screen.findByType(Header).props.onBack();
      else if (method === "android") stack.goBack();
      else stack.dispatch(StackActions.pop(1));
    });
    expect(screen.findAllByType(RecoveryPlanScreen)).toHaveLength(1);
    expect(screen.findByType(RecoveryPlanScreen).props).toMatchObject({ plan: { id: "repair" }, notice: undefined });
    expect(stack.getRootState()?.routes.map((route) => route.name)).toEqual(["index", "plans", "recovery"]);
  }
  expect(remote.correct).not.toHaveBeenCalled();
  await act(async () => { stack.goBack(); });
  expect(screen.findByType(RecoveryPlanList).props.plans).toHaveLength(7);
  await act(async () => { stack.goBack(); });
  expect(stack.getRootState()?.routes.map((route) => route.name)).toEqual(["index", "plans"]);
  expect(onBack).not.toHaveBeenCalled();
});

test("a contribution with no other eligible plan can still have its attribution removed", async () => {
  const { screen } = await openFix([repair, ...others]);
  expect(choices(screen)).toEqual([["Don’t count it toward a plan", false]]);
  expect(texts()).toContain("No other plan can take this contribution. A plan needs the same destination, room for the whole amount, and to have started by September 18, 2026.");
});

test("a renamed destination place shows its new name on the plan and the draft while keeping its identity", async () => {
  const { screen } = await open([repair], true);
  const destination = () => screen.find((node) => node.type === ListRow && node.props.title === "Destination").props.value;
  expect(destination()).toBe("Savings");
  remote.query.mockReturnValue({
    ...evaluation, candidates: [candidate],
    plans: [{ ...repair, destinationName: "Emergency fund" }],
    destinations: [{ id: "savings", name: "Emergency fund", productKind: "savingsAccount" }],
  });
  await act(async () => { button(screen, "Find another expense").props.onPress(); });
  await act(async () => { screen.findByType(Header).props.onBack(); });
  expect(destination()).toBe("Emergency fund");
  await act(async () => { button(screen, "Find another expense").props.onPress(); });
  await act(async () => { screen.findByType(ListRow).props.onPress(); });
  expect(destination()).toBe("Emergency fund");
  expect(screen.findByType(RecoveryDraft).props.destinationId).toBe("savings");
  uuid.next = () => "dental-key";
  await act(async () => { button(screen, "Activate plan").props.onPress(); });
  expect(remote.activate.mock.calls).toEqual([[{
    workspaceId: "workspace", sourceJournalEntryId: "dental", destinationFinancialAccountProfileId: "savings",
    installmentCount: 4, installmentMinorUnits: 12_000_000, idempotencyKey: "dental-key",
  }]]);
});
