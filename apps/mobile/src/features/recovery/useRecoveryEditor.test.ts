import { ConvexError } from "convex/values";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, test, vi } from "vitest";
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
let root: ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });
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
  } satisfies RecoveryEditorTransport;
}
async function open(api: RecoveryEditorTransport, initial = seed) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let editor: ReturnType<typeof useRecoveryEditor> | undefined;
  function Harness() { editor = useRecoveryEditor(initial, api); return null; }
  await act(async () => { root = create(createElement(Harness)); });
  return () => { if (!editor) throw new Error("Editor not mounted"); return editor; };
}

test("the default suggestion is the even split, and an edit posts that exact monthly amount", async () => {
  const api = transport();
  const editor = await open(api);
  expect(editor()).toMatchObject({
    installmentCount: 4, destinationId: "savings", suggestion: { installmentMinorUnits: 300_000, valid: true },
  });
  await act(async () => { editor().onMonths(4); editor().onAmount("3.300"); });
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
  await act(async () => { editor().onAmount("3.000"); });
  await act(async () => { await editor().submit(); editor().onMonths(8); });
  expect(editor()).toMatchObject({ installmentCount: 4, amount: "3.000", pending: true, editable: false, canDismiss: false });
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
  await act(async () => { editor().onAmount(amount); });
  expect(editor().suggestion.valid).toBe(false);
  expect(editor().canSubmit).toBe(false);
  await act(async () => { await editor().submit(); });
  expect(api.save).not.toHaveBeenCalled();
});
