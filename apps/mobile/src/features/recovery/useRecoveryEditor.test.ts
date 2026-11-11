import * as React from "react";
import { ConvexError } from "convex/values";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, test, vi } from "vitest";
import { openAmount, withNativeText } from "../amount/session";

/** The session after a person types `text` key by key. */
const money = (text: string, currency = "COP") =>
  [...text].reduce((session, key) => withNativeText(session, session.editor.text + key), openAmount(currency));
const typedAmount = (text: string) => expect.objectContaining({ editor: expect.objectContaining({ text }) });
import { LanguageProvider } from "../../i18n";
import { useRecoveryEditor, type RecoveryEditorSeed, type RecoveryEditorTransport } from "./useRecoveryEditor";

const seed: RecoveryEditorSeed = {
  workspaceId: "workspace",
  currency: "COP",
  candidate: {
    journalEntryId: "exp-1", title: "Laptop repair", accountingDate: "2026-09-09",
    amountMinorUnits: 1_200_000, financialAccountProfileId: "daily", placeName: "Daily",
  },
  destinations: [
    { id: "daily", name: "Daily", productKind: "bankAccount" },
    { id: "savings", name: "Savings", productKind: "savingsAccount" },
  ],
};
type Request = Parameters<RecoveryEditorTransport["save"]>[0];
/** What the phone keeps of a sent activation while its outcome is unknown. */
const phone: { request: Request | null } = { request: null };
let root: ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; phone.request = null; vi.unstubAllGlobals(); });
function transport() {
  let sequence = 0;
  return {
    save: vi.fn<RecoveryEditorTransport["save"]>(async (request) => ({
      replay: false,
      plan: {
        id: "plan-1", workspaceId: request.workspaceId, sourceJournalEntryId: request.sourceJournalEntryId,
        destinationFinancialAccountProfileId: request.destinationFinancialAccountProfileId,
        title: "Laptop repair", principalMinorUnits: 1_200_000, installmentCount: request.installmentCount,
        installmentMinorUnits: request.installmentMinorUnits, impliedAnnualRateBps: 1800,
        currency: "COP", activationMonth: "2026-09", idempotencyKey: request.idempotencyKey,
        createdBy: "owner", createdAt: 1,
      },
    })),
    onSaved: vi.fn(), newKey: () => `activate-${++sequence}`, reportFailure: vi.fn(() => false),
    keep: vi.fn(async (request: Request) => { phone.request = request; }),
    forget: vi.fn(async (request: Request) => { if (phone.request?.idempotencyKey === request.idempotencyKey) phone.request = null; }),
  } satisfies RecoveryEditorTransport;
}
async function open(api: RecoveryEditorTransport, initial: RecoveryEditorSeed = { ...seed, unresolved: phone.request }, language?: "es") {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let editor: ReturnType<typeof useRecoveryEditor> | undefined;
  function Harness() { editor = useRecoveryEditor(initial, api); return null; }
  const node = language ? createElement(LanguageProvider, { initialPreference: language }, createElement(Harness)) : createElement(Harness);
  await act(async () => { root = create(node); });
  return () => { if (!editor) throw new Error("Editor not mounted"); return editor; };
}

test("the default suggestion is the even split, and an edit posts that exact monthly amount", async () => {
  const api = transport();
  const editor = await open(api);
  expect(editor()).toMatchObject({
    installmentCount: 4, destinationId: "savings", suggestion: { installmentMinorUnits: 300_000, valid: true },
  });
  await act(async () => { editor().onMonths(4); editor().onAmount(money("3.300")); });
  expect(editor().suggestion).toMatchObject({ installmentMinorUnits: 330_000, premiumMinorUnits: 120_000, valid: true });
  await act(async () => { await Promise.all([editor().submit(), editor().submit()]); });
  expect(api.save.mock.calls.map(([request]) => request)).toEqual([{
    workspaceId: "workspace", sourceJournalEntryId: "exp-1", destinationFinancialAccountProfileId: "savings",
    installmentCount: 4, installmentMinorUnits: 330_000, idempotencyKey: "activate-1",
  }]);
  expect(api.onSaved).toHaveBeenCalledOnce();
});

test("an uncertain activation freezes edits and retry reuses the same key", async () => {
  const api = transport();
  api.save.mockRejectedValueOnce(new Error("lost acknowledgement"));
  const editor = await open(api);
  await act(async () => { editor().onAmount(money("3.000")); });
  await act(async () => { await editor().submit(); editor().onMonths(8); });
  expect(editor()).toMatchObject({ installmentCount: 4, amount: typedAmount("3.000"), pending: true, editable: false, canDismiss: false });
  await act(async () => { await editor().submit(); });
  expect(api.save.mock.calls.map(([request]) => [request.installmentCount, request.installmentMinorUnits, request.idempotencyKey]))
    .toEqual([[4, 300_000, "activate-1"], [4, 300_000, "activate-1"]]);
});

test("a recovery rejection keeps the draft editable", async () => {
  const api = transport();
  api.save.mockRejectedValueOnce(new ConvexError({ kind: "recovery", code: "expense_already_recovered" }));
  const editor = await open(api);
  await act(async () => { await editor().submit(); });
  expect(editor()).toMatchObject({
    pending: false, editable: true, error: "This expense already has a recovery plan.",
  });
});

test.each(["", "0", "2.999", "12.001"])("invalid monthly amount %s stays editable without activating", async (amount) => {
  const api = transport();
  const editor = await open(api);
  await act(async () => { editor().onAmount(money(amount)); });
  expect(editor().suggestion.valid).toBe(false);
  expect(editor().canSubmit).toBe(false);
  await act(async () => { await editor().submit(); });
  expect(api.save).not.toHaveBeenCalled();
});


test("a three-decimal recovery plan keeps the edited installment in exact minor units", async () => {
  const api = transport();
  const editor = await open(api, { ...seed, currency: "BHD", candidate: { ...seed.candidate, amountMinorUnits: 1234 } });
  await act(async () => { editor().onMonths(4); editor().onAmount(money("0,400", "BHD")); });
  await act(async () => { await editor().submit(); });
  expect(api.save.mock.calls[0][0].installmentMinorUnits).toBe(400);
});

test.each([
  { failure: new ConvexError({ kind: "recovery", code: "expense_already_recovered" }), en: "This expense already has a recovery plan.",
    es: "Este gasto ya tiene un plan para recuperarlo." },
  { failure: new ConvexError({ kind: "recovery", code: "replacement_already_exists" }), en: "The cancelled plan already has a replacement.",
    es: "El plan cancelado ya tiene un reemplazo." },
  { failure: new ConvexError({ kind: "recovery", code: "installment_out_of_range" }),
    en: "The plan was not activated. Check the monthly amount and destination, then try again.",
    es: "No pudimos activar el plan. Revisa el monto por mes y el destino, y vuelve a intentarlo." },
  { failure: new Error("lost acknowledgement"), en: "Could not confirm activation. Retry to safely check the same plan.",
    es: "No pudimos confirmar la activación. Reintenta: revisamos el mismo plan sin duplicarlo." },
])("activation failure $failure.message maps to a catalog message in both languages", async ({ failure, en, es }) => {
  for (const [language, message] of [[undefined, en], ["es", es]] as const) {
    const api = transport();
    api.save.mockRejectedValueOnce(failure);
    const editor = await open(api, seed, language);
    await act(async () => { await editor().submit(); });
    expect(editor().error).toBe(message);
    await act(async () => root?.unmount());
  }
  root = undefined;
});

test.each([
  new ConvexError({ code: "provider_unavailable" }),
  new ConvexError({ code: "session_verification_required" }),
  new ConvexError({ code: "device_registration_required" }),
  new ConvexError({ code: "permission_denied" }),
  new ConvexError({ kind: "recovery", code: "idempotency_key_conflict" }),
  new ConvexError({ kind: "recovery", code: "a_code_this_app_does_not_know" }),
])("a retry refused with $data.code after a lost reply keeps the same plan until an answer arrives", async (refusal) => {
  const api = transport();
  api.save.mockRejectedValueOnce(new Error("lost acknowledgement")).mockRejectedValueOnce(refusal);
  const editor = await open(api);
  await act(async () => { await editor().submit(); });
  await act(async () => { await editor().submit(); editor().onMonths(12); editor().onDestination("daily"); });
  expect(editor()).toMatchObject({ pending: true, editable: false, canDismiss: false, canSubmit: true,
    installmentCount: 4, destinationId: "savings", error: "Could not confirm activation. Retry to safely check the same plan." });
  await act(async () => { await editor().submit(); });
  const first = {
    workspaceId: "workspace", sourceJournalEntryId: "exp-1", destinationFinancialAccountProfileId: "savings",
    installmentCount: 4, installmentMinorUnits: 300_000, idempotencyKey: "activate-1",
  };
  expect(api.save.mock.calls.map(([request]) => request)).toEqual([first, first, first]);
  expect(api.onSaved).toHaveBeenCalledOnce();
});

test.each([
  { code: "expense_already_recovered", error: "This expense already has a recovery plan." },
  { code: "expense_not_recoverable", error: "The plan was not activated. Check the monthly amount and destination, then try again." },
  { code: "installment_below_minimum", error: "The plan was not activated. Check the monthly amount and destination, then try again." },
  { code: "replacement_already_exists", error: "The cancelled plan already has a replacement." },
  { code: "idempotency_key_invalid", error: "The plan was not activated. Check the monthly amount and destination, then try again." },
])("a retry refused with $code after a lost reply answers the plan and the next send is a new one", async ({ code, error }) => {
  const api = transport();
  api.save.mockRejectedValueOnce(new Error("lost acknowledgement")).mockRejectedValueOnce(new ConvexError({ kind: "recovery", code }));
  const editor = await open(api);
  await act(async () => { await editor().submit(); });
  await act(async () => { await editor().submit(); });
  expect(editor()).toMatchObject({ pending: false, editable: true, canDismiss: true, error });
  await act(async () => { await editor().submit(); });
  expect(api.save.mock.calls.map(([request]) => request.idempotencyKey)).toEqual(["activate-1", "activate-1", "activate-2"]);
});

test("a retry refused because the destination Place closed answers the plan and marks that Place", async () => {
  const api = transport();
  api.save.mockRejectedValueOnce(new Error("lost acknowledgement"))
    .mockRejectedValueOnce(new ConvexError({ kind: "accounting", code: "financial_account_profile_ended" }));
  const editor = await open(api);
  await act(async () => { await editor().submit(); });
  await act(async () => { await editor().submit(); });
  expect(editor()).toMatchObject({ pending: false, editable: true, canSubmit: false, error: "",
    unavailable: { id: "savings", label: "Savings (closed)" } });
});

test("a Submit handler kept from the eight-month render sends the four months the screen shows", async () => {
  const api = transport();
  const editor = await open(api);
  await act(async () => { editor().onMonths(8); });
  const kept = editor().submit;
  await act(async () => { editor().onMonths(4); });
  expect(editor()).toMatchObject({ installmentCount: 4, suggestion: { installmentMinorUnits: 300_000, targetMinorUnits: 1_200_000 } });
  await act(async () => { await kept(); });
  expect(api.save.mock.calls.map(([request]) => request)).toEqual([{
    workspaceId: "workspace", sourceJournalEntryId: "exp-1", destinationFinancialAccountProfileId: "savings",
    installmentCount: 4, installmentMinorUnits: 300_000, idempotencyKey: "activate-1",
  }]);
});

test("a Submit handler kept before the destination changed sends the destination the screen shows", async () => {
  const api = transport();
  const editor = await open(api);
  const kept = editor().submit;
  await act(async () => { editor().onDestination("daily"); });
  expect(editor().destinationId).toBe("daily");
  await act(async () => { await kept(); });
  expect(api.save.mock.calls.map(([request]) => request.destinationFinancialAccountProfileId)).toEqual(["daily"]);
});

test("a Submit handler kept before months changed resends the held plan unchanged after a lost reply", async () => {
  const api = transport();
  api.save.mockRejectedValueOnce(new Error("lost acknowledgement"));
  const editor = await open(api);
  const keptMonths = editor().onMonths;
  const keptDestination = editor().onDestination;
  await act(async () => { await editor().submit(); });
  await act(async () => { keptMonths(8); keptDestination("daily"); });
  const kept = editor().submit;
  await act(async () => { await kept(); });
  const first = {
    workspaceId: "workspace", sourceJournalEntryId: "exp-1", destinationFinancialAccountProfileId: "savings",
    installmentCount: 4, installmentMinorUnits: 300_000, idempotencyKey: "activate-1",
  };
  expect(api.save.mock.calls.map(([request]) => request)).toEqual([first, first]);
  expect(editor()).toMatchObject({ installmentCount: 4, destinationId: "savings" });
});

test("an activation held after a lost reply stays on the phone, so reopening resends it under its own key", async () => {
  const api = transport();
  api.save.mockRejectedValueOnce(new Error("lost acknowledgement"));
  const editor = await open(api);
  await act(async () => { await editor().submit(); });
  expect(editor().pending).toBe(true);
  await act(async () => root?.unmount());
  root = undefined;
  const reopened = await open(api);
  await act(async () => { await reopened().submit(); });
  expect(api.save.mock.calls.map(([request]) => request.idempotencyKey)).toEqual(["activate-1", "activate-1"]);
});
