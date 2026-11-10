import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Text, TextInput } from "react-native";
import { Choice, Header, ListGroup, ListRow, PrimaryButton, Screen } from "../../ui/core";
import { afterEach, expect, test, vi } from "vitest";
import type { RecoveryCandidate, RecoveryContribution, RecoveryPlace, RecoveryPlanView } from "./model";
import { LanguageProvider } from "../../i18n";
import { RecoveryCandidates, RecoveryDraft, RecoveryMoveScreen, RecoveryPlanList, RecoveryPlanScreen } from "./RecoveryScreens";

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  KeyboardAvoidingView: "keyboard-viewport",
  ActivityIndicator: "ActivityIndicator", Pressable: "Pressable", Text: "Text", TextInput: "TextInput",
  View: "View", ScrollView: "ScrollView",
  StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1, absoluteFillObject: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "Icon" }));
vi.mock("expo-secure-store", () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));

const candidate: RecoveryCandidate = {
  journalEntryId: "exp-1", title: "Laptop repair", accountingDate: "2026-09-09",
  amountMinorUnits: 1_200_000, financialAccountProfileId: "daily", placeName: "Daily",
};
const plan: RecoveryPlanView = {
  cancellation: undefined, replacesPlanId: undefined, replacedByPlanId: undefined, contributionHistory: [],
  status: "active",
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
const planDefaults = {
  plans: [plan], timeZone: "America/Bogota", replacement: null,
  onCancel: () => {}, onReplace: () => {}, onPlan: () => {}, onFix: () => {},
};
let root: ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });
async function render(node: React.ReactElement) {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(async () => { root = create(node); });
  if (!root) throw new Error("Screen not mounted");
  return root.root;
}

test("the recovery plan list shows progress and opens a live plan", async () => {
  const onPlan = vi.fn();
  const screen = await render(createElement(RecoveryPlanList, {
    plans: [plan], onBack: () => {}, onPlan,
  }));
  expect(screen.findAll((node) => node.props.detail === "COP 2.300 of COP 13.800 moved back to savings")).toHaveLength(1);
  await act(async () => {
    screen.findAll((node) => node.props.title === "Laptop repair" && node.props.onPress)[0].props.onPress();
  });
  expect(onPlan).toHaveBeenCalledExactlyOnceWith("plan-1");
});

test("candidates use a human date and open their own expense", async () => {
  const onStart = vi.fn();
  const screen = await render(createElement(RecoveryCandidates, {
    currency: "COP", month: "2026-10", candidates: [candidate], onBack: () => {}, onStart,
  }));
  expect(screen.findAll((node) => node.props.eyebrow === "OCTOBER CLOSE")).toHaveLength(1);
  const row = screen.findAll((node) => node.props.title === "Laptop repair" && node.props.onPress)[0];
  expect(row.props).toMatchObject({ detail: "September 9 · Daily", value: "COP 12.000" });
  await act(async () => { row.props.onPress(); });
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
    && node.props.helperText.includes("at least COP 3.000")
    && node.props.helperText.includes("COP 1.200 extra"),
  )).toHaveLength(1);
  expect(screen.findAll((node) => node.props.label === "4 months" && node.props.selected)).toHaveLength(1);
  expect(screen.findAll((node) => node.props.label === "4 months")[0].props.detail).toBe("COP 3.300 each · COP 1.200 extra saving");
  expect(screen.findAll((node) => node.props.label === "6 months")[0].props.detail).toBe("COP 2.000 each · COP 0 extra saving");
  expect(screen.findAll((node) => node.props.label === "8 months")[0].props.detail).toBe("COP 1.500 each · COP 0 extra saving");
  expect(screen.findAll((node) => node.props.label === "12 months")[0].props.detail).toBe("COP 1.000 each · COP 0 extra saving");
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
    ...planDefaults,
    plan, month: "2026-10", onBack: () => {}, onMove, onFind: () => {},
  }));
  expect(screen.findAll((node) => node.props.title === "Due this month" && node.props.value === "COP 2.300")[0].props.valueStyle).toEqual({ color: "#9c5f06" });
  expect(screen.findAll((node) => node.type === Text && node.children.join("") === "17% complete")).toHaveLength(1);
  expect(screen.findAll((node) => node.type === Text && node.children.join("") === "COP 11.500 left")).toHaveLength(1);
  expect(screen.findAll((node) => node.props.accessibilityLabel === "Laptop repair recovery progress")).toHaveLength(1);
  await act(async () => { screen.findAll((node) => node.props.label === "Move money for October")[0].props.onPress(); });
  expect(onMove).toHaveBeenCalledOnce();
});

test("a completed plan has a neutral zero due and no movement button", async () => {
  const screen = await render(createElement(RecoveryPlanScreen, {
    ...planDefaults,
    plan: { ...plan, recoveredMinorUnits: 1_380_000, remainingMinorUnits: 0, dueMinorUnits: 0 },
    month: "2026-10", onBack: () => {}, onMove: () => {}, onFind: () => {},
  }));
  expect(screen.findAll((node) => node.type === Text && node.children.join("") === "100% complete")).toHaveLength(1);
  const due = screen.findAll((node) => node.props.title === "Due this month")[0];
  expect(due.props.value).toBe("COP 0");
  expect(due.props.valueStyle).toBeUndefined();
  expect(screen.findAll((node) => node.props.label === "Move money for October")).toHaveLength(0);
});

test("a suspended plan explains its reversed expense and offers no movement", async () => {
  const screen = await render(createElement(RecoveryPlanScreen, {
    ...planDefaults,
    plan: { ...plan, status: "suspended", dueMinorUnits: 0 },
    month: "2026-10", onBack: () => {}, onMove: () => {}, onFind: () => {},
  }));
  expect(screen.findAll((node) => node.type === Text && node.children.join("") ===
    "Plan suspended because the original expense was reversed. Money already saved stays in your accounts.")).toHaveLength(1);
  expect(screen.findAll((node) => node.props.label === "Move money for October")).toHaveLength(0);
});

test("the editable hero precedes one static source, destination and plan, then posts before the footnote", async () => {
  const submit = vi.fn(async () => {});
  const onAmount = vi.fn();
  const screen = await render(createElement(RecoveryMoveScreen, {
    plan, sources: destinations, sourceId: "daily", amount: "2.300,00",
    editable: true, busy: false, pending: false, canSubmit: true, canDismiss: true, error: "",
    onSource: () => {}, onAmount, submit, onBack: () => {},
  }));
  expect(screen.findByType(Header).props).toMatchObject({ title: "Move money", eyebrow: "RECOVERY CONTRIBUTION" });
  const input = screen.findByType(TextInput);
  expect(input.props).toMatchObject({ accessibilityLabel: "Amount in COP", value: "2.300,00", keyboardType: "decimal-pad", editable: true });
  expect(screen.findAllByType(Choice)).toHaveLength(0);
  expect(screen.findByType(ListGroup).findAllByType(ListRow).map((row) => ({ title: row.props.title, value: row.props.value, icon: row.props.icon }))).toEqual([
    { title: "From", value: "Daily", icon: "arrow-up-circle-outline" },
    { title: "To", value: "Savings", icon: "arrow-down-circle-outline" },
    { title: "Counts toward", value: "Laptop repair", icon: "trending-up-outline" },
  ]);
  const children = screen.findByType(Screen).props.children;
  expect(children[1].props.children[0].props.children).toBe("Amount");
  expect(children[2].type).toBe(ListGroup);
  expect(children[3].type).toBe(PrimaryButton);
  expect(children[4].props.children).toBe("Progress changes only after this real account-to-account transfer posts.");
  expect(screen.findByType(PrimaryButton).props.trailingIcon).toBe("checkmark");
  await act(async () => { input.props.onChangeText("3.000,25"); });
  expect(onAmount).toHaveBeenCalledExactlyOnceWith("3.000,25");
  await act(async () => { screen.findAll((node) => node.props.label === "Post transfer")[0].props.onPress(); });
  expect(submit).toHaveBeenCalledOnce();
});

test("several sources are radios inside the transfer group, excluding the plan destination", async () => {
  const onSource = vi.fn();
  const screen = await render(createElement(RecoveryMoveScreen, {
    plan, sources: [...destinations, { id: "cash", name: "Cash", productKind: "cash" }],
    sourceId: "daily", amount: "2.300", editable: true, busy: false, pending: false,
    canSubmit: true, canDismiss: true, error: "", onSource, onAmount: () => {},
    submit: async () => {}, onBack: () => {},
  }));
  const choices = screen.findByType(ListGroup).findAllByType(Choice);
  expect(choices.map((choice) => [choice.props.label, choice.props.selected])).toEqual([["Daily", true], ["Cash", false]]);
  await act(async () => { choices[1].props.onPress(); });
  expect(onSource).toHaveBeenCalledExactlyOnceWith("cash");
});

test("no eligible source explains why posting is unavailable", async () => {
  const screen = await render(createElement(RecoveryMoveScreen, {
    plan, sources: destinations.slice(0, 1), sourceId: null, amount: "2.300",
    editable: true, busy: false, pending: false, canSubmit: false, canDismiss: true,
    error: "", onSource: () => {}, onAmount: () => {}, submit: async () => {}, onBack: () => {},
  }));
  expect(screen.findAllByType(Choice)).toHaveLength(0);
  expect(screen.findByType(PrimaryButton).props.disabled).toBe(true);
  expect(JSON.stringify(root?.toJSON())).toContain("Add another place before you can move money into this destination.");
});

function contribution(id: string, over: Partial<RecoveryContribution> = {}): RecoveryContribution {
  return {
    id, workspaceId: "ws", planId: "plan-1", transferJournalEntryId: `transfer-${id}`, amountMinorUnits: 230_000,
    contributionDate: "2026-09-18", idempotencyKey: id, createdBy: "owner", recordedAt: Date.UTC(2026, 8, 18, 17),
    status: "active", transferReversed: false, correction: undefined, correctsContributionId: undefined, ...over,
  };
}
const recordedAt = Date.UTC(2026, 9, 2, 20, 30);
const correction = (contributionId: string, reason: string, targetPlanId?: string) => ({
  id: `fix-${contributionId}`, workspaceId: "ws", contributionId, reason, targetPlanId, contributionDate: "2026-07-05",
  idempotencyKey: `fix-${contributionId}`, createdBy: "owner", recordedAt,
});
const history = [
  contribution("jun", { contributionDate: "2026-06-20", amountMinorUnits: 100_000, status: "corrected", transferReversed: true,
    correction: correction("jun", "Not a recovery transfer") }),
  contribution("sep"),
  contribution("jul", { contributionDate: "2026-07-05", amountMinorUnits: 200_000, status: "corrected",
    correction: correction("jul", "Wrong plan", "plan-2") }),
  contribution("aug", { contributionDate: "2026-08-18", amountMinorUnits: 250_000, status: "voided", transferReversed: true }),
];
const withHistory: RecoveryPlanView = { ...plan, contributionHistory: history };
const other: RecoveryPlanView = { ...plan, id: "plan-2", title: "Fridge", contributionHistory: [
  contribution("jul-moved", { planId: "plan-2", contributionDate: "2026-07-05", amountMinorUnits: 200_000, correctsContributionId: "jul" }),
] };
function historyRows(screen: ReturnType<typeof render> extends Promise<infer T> ? T : never) {
  const label = screen.findAll((node) => node.type === Text && ["CONTRIBUTIONS", "APORTES"].includes(node.children.join("")))[0];
  return label.parent!.findAllByType(ListRow).map((row) => [row.props.title, row.props.value, row.props.detail, !!row.props.onPress]);
}

test("contribution history lists newest first with each status, its correction link, reason and recording time", async () => {
  const onFix = vi.fn();
  const onPlan = vi.fn();
  const screen = await render(createElement(RecoveryPlanScreen, {
    ...planDefaults, plan: withHistory, plans: [withHistory, other], month: "2026-10", onFix, onPlan,
    onBack: () => {}, onMove: () => {}, onFind: () => {},
  }));
  expect(historyRows(screen)).toEqual([
    ["COP 2.300", "Counted", "September 18, 2026", true],
    ["COP 2.500", "Voided", "August 18, 2026\nNot counted because the transfer was reversed.", false],
    ["COP 2.000", "Corrected", "July 5, 2026\nMoved to Fridge\nReason: Wrong plan\nRecorded Oct 2, 2026, 3:30 PM", true],
    ["COP 1.000", "Corrected", "June 20, 2026\nNo longer counts toward a plan. It stays as ordinary saving.\nReason: Not a recovery transfer\nRecorded Oct 2, 2026, 3:30 PM\nThe transfer was later reversed.", false],
  ]);
  expect(JSON.stringify(root?.toJSON())).toContain("Tap a counted contribution to fix which plan it counts toward.");
  const rows = screen.findAll((node) => node.type === ListRow && typeof node.props.onPress === "function" && node.props.title !== "Destination");
  await act(async () => { rows.find((row) => row.props.value === "Counted")?.props.onPress(); });
  await act(async () => { rows.find((row) => row.props.value === "Corrected")?.props.onPress(); });
  expect(onFix.mock.calls).toEqual([["sep"]]);
  expect(onPlan.mock.calls).toEqual([["plan-2"]]);
});

test("a replacement contribution names the plan it moved from, and an empty history explains itself", async () => {
  const screen = await render(createElement(RecoveryPlanScreen, {
    ...planDefaults, plan: other, plans: [withHistory, other], month: "2026-10",
    onBack: () => {}, onMove: () => {}, onFind: () => {},
  }));
  expect(historyRows(screen)).toEqual([["COP 2.000", "Counted", "July 5, 2026\nMoved from Laptop repair", true]]);
  await act(async () => root?.unmount());
  const empty = await render(createElement(RecoveryPlanScreen, {
    ...planDefaults, plan, month: "2026-10", onBack: () => {}, onMove: () => {}, onFind: () => {},
  }));
  expect(empty.findAll((node) => node.type === Text && node.children.join("") ===
    "No contributions yet. Each transfer you make toward this plan shows up here.")).toHaveLength(1);
  expect(JSON.stringify(root?.toJSON())).not.toContain("Tap a counted contribution");
});

test("Spanish history uses Colombian dates and money", async () => {
  const screen = await render(createElement(LanguageProvider, { initialPreference: "es" }, createElement(RecoveryPlanScreen, {
    ...planDefaults, plan: withHistory, plans: [withHistory, other], month: "2026-10",
    onBack: () => {}, onMove: () => {}, onFind: () => {},
  })));
  expect(historyRows(screen).slice(0, 3)).toEqual([
    ["COP 2.300", "Cuenta", "18 de septiembre de 2026", true],
    ["COP 2.500", "Anulado", "18 de agosto de 2026\nNo cuenta porque la transferencia se reversó.", false],
    ["COP 2.000", "Corregido", "5 de julio de 2026\nPasó a Fridge\nRazón: Wrong plan\nRegistrado el 2 de oct de 2026, 3:30 p. m.", true],
  ]);
});
