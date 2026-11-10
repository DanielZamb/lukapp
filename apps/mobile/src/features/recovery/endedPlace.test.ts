import * as React from "react";
import { ConvexError } from "convex/values";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LanguageProvider } from "../../i18n";
import { Choice, ListRow } from "../../ui/core";
import type { RecoveryPlace, RecoveryPlanView } from "./model";
import { RecoveryDraft, RecoveryMoveScreen } from "./RecoveryScreens";
import { useRecoveryCancel, useRecoveryCorrection } from "./useRecoveryLifecycle";
import { useRecoveryEditor, type RecoveryEditorSeed, type RecoveryEditorTransport } from "./useRecoveryEditor";
import { useRecoveryMove, type RecoveryMoveTransport } from "./useRecoveryMove";

vi.mock("react-native", () => ({
  Platform: { OS: "android" }, KeyboardAvoidingView: "KeyboardAvoidingView",
  ActivityIndicator: "ActivityIndicator", Pressable: "Pressable", Text: "Text", TextInput: "TextInput",
  View: "View", ScrollView: "ScrollView", StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
}));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: "Icon" }));
vi.mock("expo-secure-store", () => ({ getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} }));

const daily: RecoveryPlace = { id: "daily", name: "Daily", productKind: "bankAccount" };
const savings: RecoveryPlace = { id: "savings", name: "Savings", productKind: "savingsAccount" };
const cash: RecoveryPlace = { id: "cash", name: "Cash", productKind: "cash" };
const seed: RecoveryEditorSeed = {
  workspaceId: "workspace", currency: "COP",
  candidate: { journalEntryId: "exp-1", title: "Laptop repair", accountingDate: "2026-09-09",
    amountMinorUnits: 1_200_000, financialAccountProfileId: "daily", placeName: "Daily" },
  destinations: [daily, savings],
};
const plan: RecoveryPlanView = {
  canCancel: true, acceptsContributions: true, cancellation: undefined, replacesPlanId: undefined, replacedByPlanId: undefined,
  contributionHistory: [], status: "active", id: "plan-1", title: "Laptop repair", sourceJournalEntryId: "exp-1",
  sourceTitle: "Laptop repair", destinationFinancialAccountProfileId: "savings", destinationName: "Savings",
  principalMinorUnits: 1_200_000, installmentCount: 6, installmentMinorUnits: 230_000, impliedAnnualRateBps: 150,
  activationDate: "2026-09-01", activationMonth: "2026-09", currency: "COP", recoveredMinorUnits: 0,
  remainingMinorUnits: 1_380_000, targetMinorUnits: 1_380_000, dueMinorUnits: 230_000,
};
const ended = (code: string, kind = "accounting") => new ConvexError({ kind, code, message: "x" });

let root: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });

function editorTransport() {
  let sequence = 0;
  return {
    save: vi.fn<RecoveryEditorTransport["save"]>(),
    onSaved: vi.fn(), newKey: () => `activate-${++sequence}`, reportFailure: vi.fn(() => false),
  } satisfies RecoveryEditorTransport;
}
function moveTransport() {
  let sequence = 0;
  return {
    move: vi.fn<RecoveryMoveTransport["move"]>(),
    onMoved: vi.fn(), newKey: () => `move-${++sequence}`, reportFailure: vi.fn(() => false),
  } satisfies RecoveryMoveTransport;
}

/** The activation screen as Recovery mounts it: the live destination list on every render, and the hook's output spread in. */
async function mountDraft(api: RecoveryEditorTransport, destinations: RecoveryPlace[], language?: "es") {
  let editor: ReturnType<typeof useRecoveryEditor> | undefined;
  function Draft({ live }: { live: RecoveryPlace[] }) {
    const value = useRecoveryEditor({ ...seed, destinations: live }, api);
    editor = value;
    return createElement(RecoveryDraft, { candidate: seed.candidate, currency: "COP", destinations: live, ...value,
      onSave: () => { void value.submit(); }, onBack: () => {} });
  }
  const tree = (live: RecoveryPlace[]) => language
    ? createElement(LanguageProvider, { initialPreference: language }, createElement(Draft, { live }))
    : createElement(Draft, { live });
  await act(async () => { root = create(tree(destinations)); });
  return {
    editor: () => editor!,
    update: async (live: RecoveryPlace[]) => { await act(async () => root!.update(tree(live))); },
  };
}
async function mountMove(api: RecoveryMoveTransport, sources: RecoveryPlace[], language?: "es") {
  let hook: ReturnType<typeof useRecoveryMove> | undefined;
  function Move({ live }: { live: RecoveryPlace[] }) {
    const value = useRecoveryMove({ workspaceId: "workspace", timeZone: "America/Bogota", plan, sources: live }, api);
    hook = value;
    return createElement(RecoveryMoveScreen, { plan, sources: live, ...value, onBack: () => {} });
  }
  const tree = (live: RecoveryPlace[]) => language
    ? createElement(LanguageProvider, { initialPreference: language }, createElement(Move, { live }))
    : createElement(Move, { live });
  await act(async () => { root = create(tree(sources)); });
  return { move: () => hook!, update: async (live: RecoveryPlace[]) => { await act(async () => root!.update(tree(live))); } };
}
const placeChoices = () => root!.root.findAllByType(Choice).filter((choice) => !/^\d+ (months|meses)$/.test(choice.props.label));
const choices = () => placeChoices().map((choice) =>
  ({ label: choice.props.label, selected: choice.props.selected, disabled: !!choice.props.disabled, detail: choice.props.detail }));
const rows = () => root!.root.findAllByType(ListRow).map((row) => [row.props.title, row.props.value]);

test.each([
  { code: "financial_account_profile_ended", label: "Savings (closed)", detail: "Savings is closed. Choose another place.",
    es: { label: "Savings (cerrado)", detail: "Savings está cerrado. Elige otro lugar." } },
  { code: "place_undo_in_progress", label: "Savings (being undone)",
    detail: "Savings is being undone and takes no new movements. Choose another place.",
    es: { label: "Savings (deshaciéndose)", detail: "Savings se está deshaciendo y no recibe movimientos nuevos. Elige otro lugar." } },
])("an activation refused with $code unlocks the destination, marks it and sends the next choice under a new key", async ({ code, label, detail, es }) => {
  for (const language of [undefined, "es"] as const) {
    const api = editorTransport();
    api.save.mockRejectedValueOnce(ended(code));
    const draft = await mountDraft(api, [daily, savings], language);
    await act(async () => { await draft.editor().submit(); });
    expect(draft.editor()).toMatchObject({ pending: false, editable: true, canSubmit: false, error: "" });
    expect(choices()).toEqual([
      { label: "Daily", selected: false, disabled: false, detail: undefined },
      { label: language ? es.label : label, selected: true, disabled: true, detail: language ? es.detail : detail },
    ]);
    await act(async () => { await draft.editor().submit(); });
    expect(api.save).toHaveBeenCalledTimes(1);
    await act(async () => placeChoices()[0]!.props.onPress());
    await act(async () => { await draft.editor().submit(); });
    expect(api.save.mock.calls.map(([request]) => [request.destinationFinancialAccountProfileId, request.idempotencyKey]))
      .toEqual([["savings", "activate-1"], ["daily", "activate-2"]]);
    await act(async () => root!.unmount());
  }
  root = undefined;
});

test("when the destination list shrinks to one other place, that place is offered, not shown as the chosen one", async () => {
  const api = editorTransport();
  const draft = await mountDraft(api, [daily, savings]);
  expect(draft.editor().destinationId).toBe("savings");
  await draft.update([daily]);
  expect(rows()).not.toContainEqual(["Destination", "Daily"]);
  expect(choices()).toEqual([
    { label: "Daily", selected: false, disabled: false, detail: undefined },
    { label: "Savings (unavailable)", selected: true, disabled: true, detail: "Savings is no longer available. Choose another place." },
  ]);
  expect(draft.editor().canSubmit).toBe(false);
  await act(async () => { await draft.editor().submit(); });
  expect(api.save).not.toHaveBeenCalled();
  await act(async () => placeChoices()[0]!.props.onPress());
  expect(rows()).toContainEqual(["Destination", "Daily"]);
  await act(async () => { await draft.editor().submit(); });
  expect(api.save.mock.calls[0]![0].destinationFinancialAccountProfileId).toBe("daily");
});

test("an unknown activation outcome still freezes the same destination", async () => {
  const api = editorTransport();
  api.save.mockRejectedValueOnce(new Error("lost acknowledgement"));
  const draft = await mountDraft(api, [daily, savings]);
  await act(async () => { await draft.editor().submit(); });
  expect(draft.editor()).toMatchObject({ pending: true, editable: false, error: "Could not confirm activation. Retry to safely check the same plan." });
});

test.each([
  { failure: new ConvexError({ kind: "accounting", code: "locked_period", message: "x" }) },
  { failure: new ConvexError({ code: "permission_denied" }) },
])("a structured activation error of any kind is a refusal, not an unknown outcome ($failure.data.code)", async ({ failure }) => {
  const api = editorTransport();
  api.save.mockRejectedValueOnce(failure);
  const draft = await mountDraft(api, [daily, savings]);
  await act(async () => { await draft.editor().submit(); });
  expect(draft.editor()).toMatchObject({ pending: false, editable: true,
    error: "The plan was not activated. Check the monthly amount and destination, then try again." });
});

test.each([
  { code: "financial_account_profile_ended", label: "Daily (closed)", detail: "Daily is closed. Choose another place." },
  { code: "place_undo_in_progress", label: "Daily (being undone)", detail: "Daily is being undone and takes no new movements. Choose another place." },
])("Move money refused with $code unlocks the source, marks it and sends the next choice under a new key", async ({ code, label, detail }) => {
  const api = moveTransport();
  api.move.mockRejectedValueOnce(ended(code));
  const move = await mountMove(api, [daily, savings, cash]);
  await act(async () => { await move.move().submit(); });
  expect(move.move()).toMatchObject({ pending: false, editable: true, canSubmit: false, error: "" });
  expect(choices()).toEqual([
    { label: "Cash", selected: false, disabled: false, detail: undefined },
    { label, selected: true, disabled: true, detail },
  ]);
  await act(async () => placeChoices()[0]!.props.onPress());
  await act(async () => { await move.move().submit(); });
  expect(api.move.mock.calls.map(([request]) => [request.sourceFinancialAccountProfileId, request.idempotencyKey]))
    .toEqual([["daily", "move-1"], ["cash", "move-2"]]);
});

test("when the Move money sources shrink to one other place, the screen never shows it while sending the old one", async () => {
  const api = moveTransport();
  const move = await mountMove(api, [daily, savings, cash]);
  expect(move.move().sourceId).toBe("daily");
  await move.update([savings, cash]);
  expect(rows()).not.toContainEqual(["From", "Cash"]);
  expect(choices()).toEqual([
    { label: "Cash", selected: false, disabled: false, detail: undefined },
    { label: "Daily (unavailable)", selected: true, disabled: true, detail: "Daily is no longer available. Choose another place." },
  ]);
  await act(async () => { await move.move().submit(); });
  expect(api.move).not.toHaveBeenCalled();
});

test("Move money treats a structured accounting error as a refusal and a lost reply as unknown", async () => {
  const api = moveTransport();
  api.move.mockRejectedValueOnce(new ConvexError({ code: "session_inactive" })).mockRejectedValueOnce(new Error("offline"));
  const move = await mountMove(api, [daily, savings]);
  await act(async () => { await move.move().submit(); });
  expect(move.move()).toMatchObject({ pending: false, editable: true });
  await act(async () => { await move.move().submit(); });
  expect(move.move()).toMatchObject({ pending: true, editable: false });
});

async function hook<T>(use: () => T) {
  let value: T | undefined;
  function Harness() { value = use(); return null; }
  await act(async () => { root = create(createElement(Harness)); });
  return () => value!;
}

test("cancelling a plan treats a structured error without a planning kind as a refusal", async () => {
  const cancel = vi.fn().mockRejectedValueOnce(new ConvexError({ code: "permission_denied" }));
  const form = await hook(() => useRecoveryCancel({ workspaceId: "workspace", plan },
    { cancel, newKey: () => "cancel-1", reportFailure: () => false, onCancelled: () => {} }));
  await act(async () => { await form().submit(); });
  expect(form()).toMatchObject({ pending: false, editable: true, error: "The plan was not cancelled. Try again." });
});

test.each([
  { code: "financial_account_profile_ended", error: "Laptop repair saves into a place that is closed, so it can't take this contribution. Choose another plan or don’t count it." },
  { code: "place_undo_in_progress", error: "Laptop repair saves into a place that is being undone, so it can't take this contribution. Choose another plan or don’t count it." },
])("fixing an attribution refused with $code is a refusal that names the plan", async ({ code, error }) => {
  const other: RecoveryPlanView = { ...plan, id: "plan-2", title: "Laptop repair", sourceJournalEntryId: "exp-2" };
  const contribution = { id: "c1", status: "active", amountMinorUnits: 100_000, contributionDate: "2026-10-01" } as never;
  const correct = vi.fn().mockRejectedValueOnce(ended(code));
  const form = await hook(() => useRecoveryCorrection({ workspaceId: "workspace", plan: { ...plan, title: "Dental" }, plans: [plan, other], contribution },
    { correct, newKey: () => "fix-1", reportFailure: () => false, onCorrected: () => {} }));
  await act(async () => { form().onTarget({ kind: "plan", planId: "plan-2" }); form().onReason("Wrong plan"); });
  await act(async () => { await form().submit(); });
  expect(correct).toHaveBeenCalledOnce();
  expect(form()).toMatchObject({ pending: false, editable: true, error });
});
