import { ConvexError } from "convex/values";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, test, vi } from "vitest";
import { openAmount, withNativeText } from "../amount/session";

/** The session after a person types `text` key by key. */
const money = (text: string, currency = "COP") =>
  [...text].reduce((session, key) => withNativeText(session, session.editor.text + key), openAmount(currency));
const typedAmount = (text: string) => expect.objectContaining({ editor: expect.objectContaining({ text }) });
import { useBudgetEditor, type BudgetEditorSeed, type BudgetTransport } from "./useBudgetEditor";

const seed: BudgetEditorSeed = { workspaceId: "workspace", month: "2026-10", currency: "COP", jar: null, removedLimits: [] };
let root: ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });
function transport() {
  let sequence = 0;
  return {
    send: vi.fn<BudgetTransport["send"]>(async ({ kind, args }) => ({ replay: false, revision: {
      id: "saved", workspaceId: args.workspaceId, categoryId: args.categoryId, effectiveMonth: args.effectiveMonth,
      limitMinorUnits: "limit" in args ? args.limit.minorUnits : 0, kind,
      expectedRevisionId: args.expectedRevisionId, sequence: 1, idempotencyKey: args.idempotencyKey,
      createdBy: "owner", createdAt: 1,
    } })),
    onSaved: vi.fn(), newKey: () => `budget-${++sequence}`, reportFailure: vi.fn<BudgetTransport["reportFailure"]>(() => false),
  } satisfies BudgetTransport;
}
const foodJar = { category: { id: "food", name: "Food", emoji: "🛒" }, revisionId: "revision-1", limitMinorUnits: 100000, consumptionMinorUnits: 0 };
async function open(api: BudgetTransport, initial = seed) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let editor: ReturnType<typeof useBudgetEditor> | undefined;
  function Harness() { editor = useBudgetEditor(initial, api); return null; }
  await act(async () => { root = create(createElement(Harness)); });
  return () => { if (!editor) throw new Error("Editor not mounted"); return editor; };
}

test("positive category limits submit once with exact minor units and current-month revision identity", async () => {
  const api = transport();
  const editor = await open(api);
  expect(editor().canSubmit).toBe(false);
  await act(async () => { editor().onCategory("food"); editor().onAmount(money("1.500,25")); });
  expect(editor().canSubmit).toBe(true);
  await act(async () => { await Promise.all([editor().submit(), editor().submit()]); });
  expect(api.send.mock.calls.map(([command]) => command)).toEqual([{ kind: "amount", args: {
    workspaceId: "workspace", categoryId: "food", effectiveMonth: "2026-10",
    limit: { currency: "COP", minorUnits: 150025 }, expectedRevisionId: null, idempotencyKey: "budget-1",
  } }]);
  expect(api.onSaved).toHaveBeenCalledOnce();
  expect(editor().pending).toBe(false);
});

test("an uncertain save freezes edits and retry reuses its exact payload and key", async () => {
  const api = transport();
  api.send.mockRejectedValueOnce(new Error("lost acknowledgement"));
  const editor = await open(api);
  await act(async () => { editor().onCategory("food"); editor().onAmount(money("1.500")); });
  await act(async () => { await editor().submit(); editor().onCategory("family"); editor().onAmount(money("7.000")); });
  expect(editor()).toMatchObject({ categoryId: "food", amount: typedAmount("1.500"), pending: true, editable: false, canDismiss: false, canSubmit: true });
  expect(editor().error).toBe("Could not confirm saving. Retry to safely check the same Budget.");
  await act(async () => { await editor().submit(); });
  expect(api.send.mock.calls.map(([command]) => command)).toEqual([1, 2].map(() => ({ kind: "amount", args: {
    workspaceId: "workspace", categoryId: "food", effectiveMonth: "2026-10",
    limit: { currency: "COP", minorUnits: 150000 }, expectedRevisionId: null, idempotencyKey: "budget-1",
  } })));
  expect(api.onSaved).toHaveBeenCalledOnce();
});

test("a validation rejection preserves input, and a stale revision requires closing and refreshing", async () => {
  const api = transport();
  api.send.mockRejectedValueOnce(new ConvexError({ kind: "budget", code: "limit_must_be_positive" }));
  const editor = await open(api, { ...seed, jar: foodJar });
  expect(editor()).toMatchObject({ amount: typedAmount("1000,00"), amountIssue: "unchanged", canSubmit: false });
  await act(async () => { await editor().submit(); });
  expect(api.send).not.toHaveBeenCalled();
  await act(async () => { editor().onAmount(money("1.500")); });
  await act(async () => { editor().onCategory("another"); await editor().submit(); });
  expect(editor()).toMatchObject({ categoryId: "food", amount: typedAmount("1.500"), editable: true });
  api.send.mockRejectedValueOnce(new ConvexError({ kind: "budget", code: "limit_changed" }));
  await act(async () => { editor().onAmount(money("2.000")); });
  await act(async () => { await editor().submit(); });
  expect(editor()).toMatchObject({ amount: typedAmount("2.000"), editable: false, canSubmit: false, canDismiss: true });
  expect(editor().error).toBe("This limit or month changed. Close and reopen the Budget to use its latest limit.");
  expect(api.send.mock.calls.map(([{ args }]) => [args.expectedRevisionId, args.idempotencyKey])).toEqual([["revision-1", "budget-1"], ["revision-1", "budget-2"]]);
});

test("unmounted editor acknowledgements cannot close a new editor or submit again", async () => {
  const api = transport();
  let resolve: (() => void) | undefined;
  const wait = new Promise<void>((done) => { resolve = done; });
  api.send.mockImplementationOnce(async ({ args }) => { await wait; return { replay: true, revision: {
    id: "late", workspaceId: args.workspaceId, categoryId: args.categoryId,
    effectiveMonth: args.effectiveMonth, limitMinorUnits: "limit" in args ? args.limit.minorUnits : 0,
    expectedRevisionId: null, sequence: 1, idempotencyKey: args.idempotencyKey, createdBy: "owner", createdAt: 1,
  } }; });
  const old = await open(api);
  await act(async () => { old().onCategory("food"); old().onAmount(money("1.000")); });
  let pending: Promise<void> | undefined;
  await act(async () => { pending = old().submit(); });
  await act(async () => { root?.unmount(); });
  const current = await open(api);
  await act(async () => { current().onCategory("family"); current().onAmount(money("2.000")); resolve?.(); await pending; });
  expect(current()).toMatchObject({ amount: typedAmount("2.000"), categoryId: "family", pending: false, canSubmit: true });
  expect(api.onSaved).not.toHaveBeenCalled();
  await act(async () => { await old().submit(); await current().submit(); });
  expect(api.send.mock.calls.map(([{ args }]) => [args.categoryId, "limit" in args ? args.limit.minorUnits : null]))
    .toEqual([["food", 100000], ["family", 200000]]);
  expect(api.onSaved).toHaveBeenCalledOnce();
});

test.each(["", "0", "-1", "1,234", "90.071.992.547.409,92"])("invalid limit %s remains editable without submitting", async (amount) => {
  const api = transport();
  const editor = await open(api);
  await act(async () => { editor().onCategory("food"); editor().onAmount(money(amount)); });
  expect(editor().canSubmit).toBe(false);
  await act(async () => { await editor().submit(); });
  expect(api.send).not.toHaveBeenCalled();
  await act(async () => { editor().onAmount(money("1,23")); await editor().submit(); });
  expect(editor().amount.editor.text).toBe("1,23");
  expect(editor().canSubmit).toBe(true);
});


test.each([["JPY", "100", 100], ["BHD", "1,234", 1234]] satisfies [string, string, number][])(
  "a %s Budget saves the currency's exact minor units", async (currency, amount, minorUnits) => {
    const api = transport();
    const editor = await open(api, { ...seed, currency });
    await act(async () => { editor().onCategory("food"); editor().onAmount(money(amount, currency)); });
    await act(async () => { await editor().submit(); });
    expect(api.send.mock.calls[0][0]).toMatchObject({ kind: "amount", args: { limit: { currency, minorUnits } } });
  },
);

const food = (idempotencyKey: string, expectedRevisionId: string | null = "revision-1") => ({
  workspaceId: "workspace", categoryId: "food", effectiveMonth: "2026-10", expectedRevisionId, idempotencyKey,
});

test("removing an existing limit sends one removal for its current revision, with no amount", async () => {
  const api = transport();
  const editor = await open(api, { ...seed, jar: foodJar });
  await act(async () => { await Promise.all([editor().remove(), editor().remove()]); });
  expect(api.send.mock.calls.map(([command]) => command)).toEqual([{ kind: "remove", args: food("budget-1") }]);
  expect(api.onSaved.mock.calls.map(([receipt]) => [receipt.revision.kind, receipt.revision.id])).toEqual([["remove", "saved"]]);
  expect(editor().pending).toBe(false);
});

test("spend nothing sends a zero-limit decision, and a spend-nothing jar starts empty and saves a typed amount as a normal limit", async () => {
  const api = transport();
  const editor = await open(api, { ...seed, jar: foodJar });
  await act(async () => { await editor().spendNothing(); });
  expect(api.send.mock.calls.map(([command]) => command)).toEqual([{ kind: "spendNothing", args: food("budget-1") }]);
  await act(async () => root?.unmount());
  const zero = await open(api, { ...seed, jar: { ...foodJar, revisionId: "zero-revision", limitMinorUnits: 0 } });
  expect(zero()).toMatchObject({ amount: typedAmount(""), amountIssue: "empty", canSubmit: false });
  expect(zero().canSend("spendNothing")).toBe(false);
  await act(async () => { await zero().spendNothing(); });
  await act(async () => { zero().onAmount(money("50.000")); });
  await act(async () => { await zero().submit(); });
  expect(api.send.mock.calls.slice(1).map(([command]) => command)).toEqual([{ kind: "amount", args: {
    ...food("budget-2", "zero-revision"), limit: { currency: "COP", minorUnits: 5_000_000 },
  } }]);
});

test("an uncertain removal stays frozen until the identical removal is retried", async () => {
  const api = transport();
  api.send.mockRejectedValueOnce(new Error("lost acknowledgement"));
  const editor = await open(api, { ...seed, jar: foodJar });
  await act(async () => { await editor().remove(); });
  expect(editor()).toMatchObject({ pending: true, pendingAct: "remove", canDismiss: false, editable: false,
    error: "Could not confirm saving. Retry to safely check the same Budget." });
  expect([editor().canSend("remove"), editor().canSend("amount"), editor().canSend("spendNothing")]).toEqual([true, false, false]);
  await act(async () => { editor().onAmount(money("2.000")); editor().onResetAmount(); });
  await act(async () => { await editor().submit(); await editor().spendNothing(); });
  expect(editor().amount.editor.text).toBe("1000,00");
  expect(api.send).toHaveBeenCalledOnce();
  await act(async () => { await editor().remove(); });
  expect(api.send.mock.calls.map(([command]) => command)).toEqual([
    { kind: "remove", args: food("budget-1") }, { kind: "remove", args: food("budget-1") },
  ]);
  expect(api.onSaved).toHaveBeenCalledOnce();
});

test("a category whose limit was removed expects that removal when it gets a limit again", async () => {
  const api = transport();
  const removedLimits = [{ categoryId: "food", revisionId: "removal-7", effectiveMonth: "2026-09" }];
  const editor = await open(api, { ...seed, removedLimits });
  await act(async () => { editor().onCategory("food"); editor().onAmount(money("50.000")); });
  await act(async () => { await editor().submit(); });
  await act(async () => root?.unmount());
  const other = await open(api, { ...seed, removedLimits });
  await act(async () => { other().onCategory("travel"); other().onAmount(money("50.000")); });
  await act(async () => { await other().submit(); });
  expect(api.send.mock.calls.map(([{ args }]) => [args.categoryId, args.expectedRevisionId])).toEqual([["food", "removal-7"], ["travel", null]]);
});

test("a typed zero is its own issue: nothing saves, and the two explicit acts remain available", async () => {
  const api = transport();
  const editor = await open(api, { ...seed, jar: foodJar });
  for (const typed of ["0", "0,00"]) {
    await act(async () => { editor().onAmount(money(typed)); });
    expect(editor()).toMatchObject({ amountIssue: "zero", canSubmit: false });
    await act(async () => { await editor().submit(); });
  }
  expect(api.send).not.toHaveBeenCalled();
  expect([editor().canSend("remove"), editor().canSend("spendNothing")]).toEqual([true, true]);
  await act(async () => { editor().onResetAmount(); });
  expect(editor().amount.editor.text).toBe("1000,00");
});

test.each([
  ["limit_changed", "This limit or month changed. Close and reopen the Budget to use its latest limit.", true],
  ["month_changed", "This limit or month changed. Close and reopen the Budget to use its latest limit.", true],
  ["month_invalid", "This month cannot take a limit. Close and reopen the Budget.", true],
  ["limit_not_set", "This category no longer has a limit. Close and reopen the Budget.", true],
  ["category_not_found", "This category is no longer available. Close and reopen the Budget.", true],
  ["expense_category_required", "Only expense categories can have a limit. Close and reopen the Budget.", true],
  ["currency_mismatch", "The currency changed. Close and reopen the Budget.", true],
  ["workspace_not_found", "We couldn't find your Budget. Close and reopen it.", true],
  ["limit_must_be_positive", "The limit must be more than zero.", false],
  ["amount_out_of_range", "This amount is too large. Try a smaller one.", false],
  ["idempotency_key_conflict", "This change didn't match the one sent before. Try again.", false],
  ["idempotency_key_invalid", "Budget was not saved. Check the category and positive limit, then try again.", false],
  ["a_future_code", "Budget was not saved. Check the category and positive limit, then try again.", false],
] as const)("Budget refusal %s reads from the catalog and releases the command", async (code, message, closes) => {
  const api = transport();
  api.send.mockRejectedValueOnce(new ConvexError({ kind: "budget", code }));
  const editor = await open(api, { ...seed, jar: foodJar });
  await act(async () => { await editor().remove(); });
  expect(editor()).toMatchObject({ error: message, pending: false, canDismiss: true });
  expect(editor().canSend("remove")).toBe(!closes);
  await act(async () => { await editor().remove(); });
  expect(api.send.mock.calls.map(([{ args }]) => args.idempotencyKey)).toEqual(closes ? ["budget-1"] : ["budget-1", "budget-2"]);
});

test("access refusals: wipe signals go to access handling, a first denial releases, and a denied retry keeps the uncertain command", async () => {
  const api = transport();
  api.reportFailure.mockImplementation((error: unknown) => error instanceof ConvexError && error.data.wipeLocalInput === true);
  const revoked = new ConvexError({ code: "device_revoked", wipeLocalInput: true });
  api.send.mockRejectedValueOnce(revoked);
  const editor = await open(api, { ...seed, jar: foodJar });
  await act(async () => { await editor().spendNothing(); });
  expect(api.reportFailure.mock.calls.map(([error]) => error)).toEqual([revoked]);
  expect(editor().error).toBe("");
  await act(async () => root?.unmount());

  const denied = transport();
  denied.send.mockRejectedValueOnce(new ConvexError({ code: "permission_denied" }));
  const first = await open(denied, { ...seed, jar: foodJar });
  await act(async () => { await first().remove(); });
  expect(first()).toMatchObject({ error: "This account no longer has access.", pending: false, canDismiss: true });
  await act(async () => root?.unmount());

  const uncertain = transport();
  uncertain.send.mockRejectedValueOnce(new Error("lost acknowledgement"))
    .mockRejectedValueOnce(new ConvexError({ code: "provider_unavailable" }));
  const retried = await open(uncertain, { ...seed, jar: foodJar });
  await act(async () => { await retried().remove(); });
  await act(async () => { await retried().remove(); });
  expect(retried()).toMatchObject({ error: "Device access could not be confirmed. Check your connection and try again.",
    pending: true, pendingAct: "remove", canDismiss: false });
  await act(async () => { await retried().remove(); });
  expect(uncertain.send.mock.calls.map(([command]) => command)).toEqual([1, 2, 3].map(() => ({ kind: "remove", args: food("budget-1") })));
  expect(uncertain.onSaved).toHaveBeenCalledOnce();
});

test("a Save handler kept before the category changed sets the limit on the category the screen shows", async () => {
  const api = transport();
  const editor = await open(api);
  await act(async () => { editor().onCategory("food"); editor().onAmount(money("1.500")); });
  const kept = editor().submit;
  await act(async () => { editor().onCategory("family"); });
  expect(editor().categoryId).toBe("family");
  await act(async () => { await kept(); });
  expect(api.send.mock.calls.map(([command]) => command)).toEqual([{ kind: "amount", args: {
    workspaceId: "workspace", categoryId: "family", effectiveMonth: "2026-10",
    limit: { currency: "COP", minorUnits: 150000 }, expectedRevisionId: null, idempotencyKey: "budget-1",
  } }]);
});

test("a Save handler kept from before a closing refusal sends nothing more", async () => {
  const api = transport();
  api.send.mockRejectedValueOnce(new ConvexError({ kind: "budget", code: "limit_changed" }));
  const editor = await open(api);
  await act(async () => { editor().onCategory("food"); editor().onAmount(money("1.500")); });
  const kept = editor().submit;
  await act(async () => { await editor().submit(); });
  expect(editor().error).toBe("This limit or month changed. Close and reopen the Budget to use its latest limit.");
  await act(async () => { await kept(); });
  expect(api.send).toHaveBeenCalledOnce();
});

test("handlers kept from before a lost reply neither edit the held limit nor rebuild it", async () => {
  const api = transport();
  api.send.mockRejectedValueOnce(new Error("lost acknowledgement"));
  const editor = await open(api);
  await act(async () => { editor().onCategory("food"); editor().onAmount(money("1.500")); });
  const kept = { submit: editor().submit, category: editor().onCategory, amount: editor().onAmount };
  await act(async () => { await kept.submit(); });
  await act(async () => { kept.category("family"); kept.amount(money("9.000")); });
  expect(editor()).toMatchObject({ categoryId: "food", amount: typedAmount("1.500") });
  await act(async () => { await kept.submit(); });
  const held = { kind: "amount", args: {
    workspaceId: "workspace", categoryId: "food", effectiveMonth: "2026-10",
    limit: { currency: "COP", minorUnits: 150000 }, expectedRevisionId: null, idempotencyKey: "budget-1",
  } };
  expect(api.send.mock.calls.map(([command]) => command)).toEqual([held, held]);
});
