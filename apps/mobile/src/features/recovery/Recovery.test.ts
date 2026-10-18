import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { FunctionReturnType } from "convex/server";
import { afterEach, expect, test, vi } from "vitest";
import { Header, ListRow, PrimaryButton, SecondaryButton } from "../../ui/core";
import type { api } from "../api";
import { Recovery } from "./Recovery";
import { RecoveryCandidates, RecoveryDraft, RecoveryPlanList, RecoveryPlanScreen } from "./RecoveryScreens";
import type { RecoveryEditorTransport } from "./useRecoveryEditor";
import RecoveryRoute from "../../../app/recovery";

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", Pressable: "Pressable", Text: "Text", TextInput: "TextInput",
  View: "View", ScrollView: "ScrollView",
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "Icon" }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "activation-key" }));
vi.mock("../../local-auth/accessFailure", () => ({ useDeviceAccessFailure: () => () => false }));
vi.mock("../../local-auth/interaction", () => ({ useLocalEntryInteraction: () => () => {} }));
const remote = vi.hoisted(() => ({ query: vi.fn(), activate: vi.fn<RecoveryEditorTransport["save"]>() }));
vi.mock("convex/react", () => ({ useQuery: remote.query, useAction: () => remote.activate }));
const navigation = vi.hoisted(() => ({ back: vi.fn(), dismissTo: vi.fn() }));
vi.mock("expo-router", () => ({ router: navigation, Redirect: "Redirect" }));
vi.mock("../activity", () => ({ usePersonalDefaults: () => ({ workspace: { id: "workspace" } }) }));

const candidate = {
  journalEntryId: "dental", title: "Dental care", accountingDate: "2026-08-04",
  amountMinorUnits: 48_000_000, financialAccountProfileId: "daily", placeName: "Daily account",
};
const plan = {
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
async function open(plans: typeof plan[] = []) {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  remote.query.mockReturnValue({ ...evaluation, plans });
  const onBack = vi.fn();
  const onViewPlans = vi.fn();
  const onHome = vi.fn();
  await act(async () => { root = create(createElement(Recovery, { workspaceId: "workspace", onBack, onViewPlans, onHome })); });
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

test("the route sends completion actions to Plans and home without retaining Recovery", async () => {
  await open();
  await act(async () => { root?.update(createElement(RecoveryRoute)); });
  if (!root) throw new Error("Recovery not mounted");
  const recovery = root.root.findByType(Recovery);
  expect(root.root.findByType(Header).props.title).toBe("Expenses to recover");
  await act(async () => { recovery.props.onViewPlans(); recovery.props.onHome(); });
  expect(navigation.dismissTo.mock.calls).toEqual([["/plans"], ["/"]]);
});
