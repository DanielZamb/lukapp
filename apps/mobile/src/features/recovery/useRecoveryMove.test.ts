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
import type { RecoveryPlace, RecoveryPlanView } from "./model";
import { LanguageProvider } from "../../i18n";
import { useRecoveryMove, type RecoveryMoveTransport } from "./useRecoveryMove";

const plan: RecoveryPlanView = {
  canCancel: true, acceptsContributions: true, cancellation: undefined, replacesPlanId: undefined, replacedByPlanId: undefined, contributionHistory: [],
  status: "active",
  id: "plan-1", title: "Laptop repair", sourceJournalEntryId: "exp-1", sourceTitle: "Laptop repair",
  destinationFinancialAccountProfileId: "savings", destinationName: "Savings",
  principalMinorUnits: 1_200_000, installmentCount: 6, installmentMinorUnits: 230_000,
  impliedAnnualRateBps: 150, activationDate: "2026-09-01", activationMonth: "2026-09", currency: "COP",
  recoveredMinorUnits: 0, remainingMinorUnits: 1_380_000, targetMinorUnits: 1_380_000,
  dueMinorUnits: 230_000,
};
const sources: RecoveryPlace[] = [
  { id: "daily", name: "Daily", productKind: "bankAccount" },
  { id: "savings", name: "Savings", productKind: "savingsAccount" },
];
let root: ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function transport() {
  let sequence = 0;
  return {
    move: vi.fn<RecoveryMoveTransport["move"]>(async (request) => ({
      replay: false,
      transfer: { id: "xfer-1", amount: request.amount },
      contribution: {
        id: "gift-1", workspaceId: request.workspaceId, planId: request.planId,
        transferJournalEntryId: "xfer-1", amountMinorUnits: Math.min(request.amount.minorUnits, 230_000),
        contributionDate: "2026-10-17", idempotencyKey: request.idempotencyKey,
        createdBy: "owner", recordedAt: 1,
      },
    })),
    onMoved: vi.fn(), newKey: () => `move-${++sequence}`, reportFailure: vi.fn(() => false),
  } satisfies RecoveryMoveTransport;
}
async function open(
  api: RecoveryMoveTransport,
  seed = { workspaceId: "workspace", plan, sources, timeZone: "America/Bogota" },
  language?: "es",
) {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let hook: ReturnType<typeof useRecoveryMove> | undefined;
  function Harness() { hook = useRecoveryMove(seed, api); return null; }
  const node = language ? createElement(LanguageProvider, { initialPreference: language }, createElement(Harness)) : createElement(Harness);
  await act(async () => { root = create(node); });
  return () => { if (!hook) throw new Error("Move hook not mounted"); return hook; };
}

test("the due amount posts one guarded movement under one key", async () => {
  vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
  const api = transport();
  const move = await open(api);
  expect(move()).toMatchObject({ sourceId: "daily", amount: typedAmount("2300"), canSubmit: true });
  await act(async () => { await Promise.all([move().submit(), move().submit()]); });
  expect(api.move.mock.calls.map(([request]) => request)).toEqual([{
    workspaceId: "workspace", planId: "plan-1", sourceFinancialAccountProfileId: "daily",
    amount: { currency: "COP", minorUnits: 230_000 },
    accountingDate: "2026-10-17", description: "Recovery: Laptop repair", idempotencyKey: "move-1",
  }]);
  expect(api.onMoved).toHaveBeenCalledOnce();
});

test("a suspended plan cannot start a movement even when its handler is called", async () => {
  const api = transport();
  const move = await open(api, { workspaceId: "workspace", timeZone: "America/Bogota", sources,
    plan: { ...plan, acceptsContributions: false, status: "suspended" },
  });
  expect(move().canSubmit).toBe(false);
  await act(async () => { await move().submit(); });
  expect(api.move).not.toHaveBeenCalled();
});

test("an uncertain movement freezes edits and retry reuses the same key", async () => {
  const api = transport();
  api.move.mockRejectedValueOnce(new Error("lost acknowledgement"));
  const move = await open(api);
  await act(async () => { await move().submit(); move().onSource("savings"); move().onAmount(money("3.000")); });
  expect(move()).toMatchObject({ sourceId: "daily", amount: typedAmount("2300"), pending: true, editable: false, canDismiss: false });
  await act(async () => { await move().submit(); });
  expect(api.move.mock.calls.map(([request]) => request.idempotencyKey)).toEqual(["move-1", "move-1"]);
});

test("a typed rejection leaves the draft editable for a new key", async () => {
  const api = transport();
  api.move.mockRejectedValueOnce(new ConvexError({ kind: "recovery", code: "source_must_be_asset" }));
  const move = await open(api);
  await act(async () => { await move().submit(); });
  expect(move()).toMatchObject({ pending: false, editable: true, canDismiss: true,
    error: "The movement was rejected. Check the source and amount, then try again.",
  });
  await act(async () => { await move().submit(); });
  expect(api.move.mock.calls.map(([request]) => request.idempotencyKey)).toEqual(["move-1", "move-2"]);
});

test("the same source and destination never posts", async () => {
  const api = transport();
  const move = await open(api);
  await act(async () => { move().onSource("savings"); });
  await act(async () => { await move().submit(); });
  expect(move().error).toBe("Choose a different place to move money from.");
  expect(api.move).not.toHaveBeenCalled();
});

test("unmounted acknowledgements cannot finish a newer movement", async () => {
  const api = transport();
  let resolve: ((value: Awaited<ReturnType<RecoveryMoveTransport["move"]>>) => void) | undefined;
  api.move.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const old = await open(api);
  let pending: Promise<void> | undefined;
  await act(async () => { pending = old().submit(); });
  await act(async () => { root?.unmount(); });
  const current = await open(api);
  await act(async () => {
    resolve?.({
      replay: true,
      transfer: { id: "late", amount: { currency: "COP", minorUnits: 230_000 } },
      contribution: {
        id: "late-gift", workspaceId: "workspace", planId: "plan-1",
        transferJournalEntryId: "late", amountMinorUnits: 230_000, contributionDate: "2026-10-17",
        idempotencyKey: "move-1", createdBy: "owner", recordedAt: 1,
      },
    });
    await pending;
  });
  expect(api.onMoved).not.toHaveBeenCalled();
  await act(async () => { await current().submit(); });
  expect(api.move.mock.calls.map(([request]) => request.idempotencyKey)).toEqual(["move-1", "move-2"]);
});

test.each(["", "0", "-1", "1.23", "2.300,123", "abc"])("invalid hero amount %s blocks posting", async (amount) => {
  const api = transport();
  const move = await open(api);
  await act(async () => { move().onAmount(money(amount)); });
  expect(move().canSubmit).toBe(false);
  await act(async () => { await move().submit(); });
  expect(api.move).not.toHaveBeenCalled();
});

test("the edited hero uses the shared parser and the chosen source", async () => {
  const api = transport();
  const move = await open(api, { workspaceId: "workspace", timeZone: "America/Bogota", plan, sources: [...sources, { id: "cash", name: "Cash", productKind: "cash" }] });
  await act(async () => { move().onAmount(money("3.000,25")); move().onSource("cash"); });
  expect(move().canSubmit).toBe(true);
  await act(async () => { await move().submit(); });
  expect(api.move.mock.calls[0][0]).toMatchObject({
    sourceFinancialAccountProfileId: "cash", amount: { currency: "COP", minorUnits: 300_025 },
  });
});

test("a destination without another source cannot be selected or posted", async () => {
  const api = transport();
  const move = await open(api, { workspaceId: "workspace", timeZone: "America/Bogota", plan, sources: sources.slice(1) });
  expect(move()).toMatchObject({ sourceId: null, canSubmit: false });
  await act(async () => { await move().submit(); });
  expect(api.move).not.toHaveBeenCalled();
});

test("zero due blocks posting until a positive amount is entered", async () => {
  const api = transport();
  const move = await open(api, { workspaceId: "workspace", timeZone: "America/Bogota", plan: { ...plan, dueMinorUnits: 0 }, sources });
  expect(move()).toMatchObject({ amount: typedAmount("0"), canSubmit: false });
  await act(async () => { move().onAmount(money("100")); });
  expect(move().canSubmit).toBe(true);
});

test("recovery uses the workspace date and keeps it unchanged when retry crosses midnight", async () => {
  vi.stubEnv("TZ", "UTC");
  vi.setSystemTime(new Date("2026-03-01T02:00:00Z"));
  const api = transport();
  api.move.mockRejectedValueOnce(new Error("lost acknowledgement"));
  const move = await open(api);
  await act(async () => { await move().submit(); });
  vi.setSystemTime(new Date("2026-03-01T08:00:00Z"));
  await act(async () => { await move().submit(); });
  expect(api.move.mock.calls.map(([request]) => request.accountingDate)).toEqual(["2026-02-28", "2026-02-28"]);
  expect(api.move.mock.calls.map(([request]) => request.idempotencyKey)).toEqual(["move-1", "move-1"]);
});


test.each([["JPY", 100, "100"], ["BHD", 1234, "1,234"]] satisfies [string, number, string][])(
  "a %s recovery movement preserves its displayed and posted precision", async (currency, minorUnits, amount) => {
    const api = transport();
    const move = await open(api, { workspaceId: "workspace", timeZone: "America/Bogota", sources,
      plan: { ...plan, currency, dueMinorUnits: minorUnits } });
    expect(move().amount.editor.text).toBe(amount);
    await act(async () => { await move().submit(); });
    expect(api.move.mock.calls[0][0].amount).toEqual({ currency, minorUnits });
  },
);

test("a Spanish movement stores a Spanish description and a retry repeats it unchanged", async () => {
  vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
  const api = transport();
  api.move.mockRejectedValueOnce(new Error("lost acknowledgement"));
  const move = await open(api, undefined, "es");
  await act(async () => { await move().submit(); });
  expect(move().error).toBe("No pudimos confirmar la transferencia. Reintenta: revisamos la misma transferencia sin duplicarla.");
  await act(async () => { await move().submit(); });
  expect(api.move.mock.calls.map(([request]) => [request.description, request.idempotencyKey])).toEqual([
    ["Recuperar ahorros: Laptop repair", "move-1"], ["Recuperar ahorros: Laptop repair", "move-1"],
  ]);
});

test.each([
  { failure: new ConvexError({ kind: "accounting", code: "insufficient_funds" }),
    en: "The movement was rejected. Check the source and amount, then try again.",
    es: "No pudimos hacer la transferencia. Revisa el origen y el monto, y vuelve a intentarlo." },
  { failure: new Error("lost acknowledgement"),
    en: "Could not confirm the transfer. Retry to safely check the same movement.",
    es: "No pudimos confirmar la transferencia. Reintenta: revisamos la misma transferencia sin duplicarla." },
])("movement failure $failure.message maps to a catalog message in both languages", async ({ failure, en, es }) => {
  for (const [language, message] of [[undefined, en], ["es", es]] as const) {
    const api = transport();
    api.move.mockRejectedValueOnce(failure);
    const move = await open(api, undefined, language);
    await act(async () => { await move().submit(); });
    expect(move().error).toBe(message);
    await act(async () => root?.unmount());
  }
  root = undefined;
});

test("choosing the destination as the source is refused in Spanish without sending", async () => {
  const api = transport();
  const move = await open(api, undefined, "es");
  await act(async () => { move().onSource("savings"); });
  await act(async () => { await move().submit(); });
  expect(move().error).toBe("Elige otro lugar de donde sacar la plata.");
  expect(api.move).not.toHaveBeenCalled();
});
