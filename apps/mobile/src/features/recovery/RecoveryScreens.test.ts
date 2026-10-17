import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, test, vi } from "vitest";
import type { RecoveryCandidate, RecoveryPlace, RecoveryPlanView } from "./model";
import { RecoveryBoard, RecoveryDraft, RecoveryMoveScreen, RecoveryPlanScreen } from "./RecoveryScreens";

vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator", Pressable: "Pressable", Text: "Text", TextInput: "TextInput",
  View: "View", ScrollView: "ScrollView",
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1, absoluteFillObject: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "Icon" }));

const candidate: RecoveryCandidate = {
  journalEntryId: "exp-1", title: "Laptop repair", accountingDate: "2026-09-09",
  amountMinorUnits: 1_200_000, financialAccountProfileId: "daily", placeName: "Daily",
};
const plan: RecoveryPlanView = {
  id: "plan-1", title: "Laptop repair", sourceJournalEntryId: "exp-1", sourceTitle: "Laptop repair",
  destinationFinancialAccountProfileId: "savings", destinationName: "Savings",
  principalMinorUnits: 1_200_000, installmentCount: 6, installmentMinorUnits: 230_000,
  impliedAnnualRateBps: 1800, activationMonth: "2026-09", currency: "COP",
  recoveredMinorUnits: 230_000, remainingMinorUnits: 1_150_000, targetMinorUnits: 1_380_000,
  dueMinorUnits: 230_000,
};
const destinations: RecoveryPlace[] = [
  { id: "savings", name: "Savings", productKind: "savingsAccount" },
  { id: "daily", name: "Daily", productKind: "bankAccount" },
];
let root: ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });
async function render(node: React.ReactElement) {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(async () => { root = create(node); });
  if (!root) throw new Error("Screen not mounted");
  return root.root;
}

test("Plans recovery lists progress and starts a plan from a posted expense", async () => {
  const onStart = vi.fn();
  const onPlan = vi.fn();
  const screen = await render(createElement(RecoveryBoard, {
    currency: "COP", plans: [plan], candidates: [candidate],
    onBack: () => {}, onPlan, onStart,
  }));
  expect(screen.findAll((node) => node.props.detail === "COP 2.300,00 of COP 13.800,00 moved back to savings")).toHaveLength(1);
  expect(screen.findAll((node) => node.props.value === "COP 12.000,00" && node.props.title === "Laptop repair")).toHaveLength(1);
  await act(async () => {
    screen.findAll((node) => node.props.title === "Laptop repair" && node.props.onPress)[0].props.onPress();
    screen.findAll((node) => node.props.title === "Laptop repair" && node.props.detail?.includes("2026-09-09"))[0].props.onPress();
  });
  expect(onPlan).toHaveBeenCalledExactlyOnceWith("plan-1");
  expect(onStart).toHaveBeenCalledExactlyOnceWith(candidate);
});

test("the draft shows the even-split limits and keeps the edited monthly amount", async () => {
  const onMonths = vi.fn();
  const onAmount = vi.fn();
  const screen = await render(createElement(RecoveryDraft, {
    candidate, currency: "COP", destinations, installmentCount: 4, amount: "3.300,00",
    destinationId: "savings",
    suggestion: {
      installmentMinorUnits: 330_000, minInstallmentMinorUnits: 300_000, maxInstallmentMinorUnits: 1_200_000,
      premiumMinorUnits: 120_000, targetMinorUnits: 1_320_000, valid: true,
    },
    editable: true, busy: false, pending: false, canSubmit: true, canDismiss: true, error: "",
    onMonths, onAmount, onDestination: () => {}, onSave: () => {}, onBack: () => {},
  }));
  expect(screen.findAll((node) =>
    typeof node.props.helperText === "string"
    && node.props.helperText.includes("at least COP 3.000,00")
    && node.props.helperText.includes("COP 1.200,00 extra"),
  )).toHaveLength(1);
  expect(screen.findAll((node) => node.props.label === "4 months" && node.props.selected)).toHaveLength(1);
  expect(screen.findAll((node) => node.props.label === "Activate plan")).toHaveLength(1);
  await act(async () => {
    screen.findAll((node) => node.props.label === "6 months")[0].props.onPress();
    screen.findAll((node) => node.props.accessibilityLabel === "Monthly amount in COP")[0].props.onChangeText("3.500");
  });
  expect(onMonths).toHaveBeenCalledExactlyOnceWith(6);
  expect(onAmount).toHaveBeenCalledExactlyOnceWith("3.500");
});

test("an open plan shows due progress and offers a real transfer", async () => {
  const onMove = vi.fn();
  const screen = await render(createElement(RecoveryPlanScreen, {
    plan, onBack: () => {}, onMove, onFind: () => {},
  }));
  expect(screen.findAll((node) => node.props.title === "Due this month" && node.props.value === "COP 2.300,00")).toHaveLength(1);
  expect(screen.findAll((node) => node.props.accessibilityLabel === "Laptop repair recovery progress")).toHaveLength(1);
  await act(async () => { screen.findAll((node) => node.props.label === "Move money")[0].props.onPress(); });
  expect(onMove).toHaveBeenCalledOnce();
});

test("moving money names the destination and posts a transfer", async () => {
  const submit = vi.fn(async () => {});
  const screen = await render(createElement(RecoveryMoveScreen, {
    plan, sources: destinations, sourceId: "daily", amount: "2.300,00",
    editable: true, busy: false, pending: false, canSubmit: true, canDismiss: true, error: "",
    onSource: () => {}, onAmount: () => {}, submit, onBack: () => {},
  }));
  expect(screen.findAll((node) => node.props.title === "To" && node.props.value === "Savings")).toHaveLength(1);
  expect(screen.findAll((node) => node.props.label === "Daily" && node.props.selected)).toHaveLength(1);
  await act(async () => { screen.findAll((node) => node.props.label === "Post transfer")[0].props.onPress(); });
  expect(submit).toHaveBeenCalledOnce();
});
