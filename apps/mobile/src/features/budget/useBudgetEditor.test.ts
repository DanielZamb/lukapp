import { ConvexError } from "convex/values";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, test, vi } from "vitest";
import { useBudgetEditor, type BudgetEditorSeed, type BudgetTransport } from "./useBudgetEditor";

const seed: BudgetEditorSeed = { workspaceId: "workspace", month: "2026-10", currency: "COP", jar: null };
let root: ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });
function transport() {
  let sequence = 0;
  return {
    save: vi.fn<BudgetTransport["save"]>(async (request) => ({ replay: false, revision: {
      id: "saved", workspaceId: request.workspaceId, categoryId: request.categoryId,
      effectiveMonth: request.effectiveMonth, limitMinorUnits: request.limit.minorUnits,
      expectedRevisionId: request.expectedRevisionId, sequence: 1, idempotencyKey: request.idempotencyKey,
      createdBy: "owner", createdAt: 1,
    } })),
    onSaved: vi.fn(), newKey: () => `budget-${++sequence}`, reportFailure: vi.fn(() => false),
  } satisfies BudgetTransport;
}
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
  await act(async () => { editor().onCategory("food"); editor().onAmount("1.500,25"); });
  expect(editor().canSubmit).toBe(true);
  await act(async () => { await Promise.all([editor().submit(), editor().submit()]); });
  expect(api.save.mock.calls.map(([request]) => request)).toEqual([{
    workspaceId: "workspace", categoryId: "food", effectiveMonth: "2026-10",
    limit: { currency: "COP", minorUnits: 150025 }, expectedRevisionId: null, idempotencyKey: "budget-1",
  }]);
  expect(api.onSaved).toHaveBeenCalledOnce();
  expect(editor().pending).toBe(false);
});

test("an uncertain save freezes edits and retry reuses its exact payload and key", async () => {
  const api = transport();
  api.save.mockRejectedValueOnce(new Error("lost acknowledgement"));
  const editor = await open(api);
  await act(async () => { editor().onCategory("food"); editor().onAmount("1.500"); });
  await act(async () => { await editor().submit(); editor().onCategory("family"); editor().onAmount("7.000"); });
  expect(editor()).toMatchObject({ categoryId: "food", amount: "1.500", pending: true, editable: false, canDismiss: false, canSubmit: true });
  expect(editor().error).toBe("Could not confirm saving. Retry to safely check the same Budget.");
  await act(async () => { await editor().submit(); });
  expect(api.save.mock.calls.map(([request]) => [request.categoryId, request.limit.minorUnits, request.idempotencyKey]))
    .toEqual([["food", 150000, "budget-1"], ["food", 150000, "budget-1"]]);
  expect(api.onSaved).toHaveBeenCalledOnce();
});

test("a validation rejection preserves input, and a stale revision requires closing and refreshing", async () => {
  const api = transport();
  api.save.mockRejectedValueOnce(new ConvexError({ kind: "budget", code: "limit_must_be_positive" }));
  const editor = await open(api, { ...seed, jar: { category: { id: "food", name: "Food", emoji: "🛒" }, revisionId: "revision-1", limitMinorUnits: 100000, consumptionMinorUnits: 0 } });
  expect(editor().amount).toBe("1.000,00");
  await act(async () => { editor().onCategory("another"); await editor().submit(); });
  expect(editor()).toMatchObject({ categoryId: "food", amount: "1.000,00", editable: true });
  api.save.mockRejectedValueOnce(new ConvexError({ kind: "budget", code: "limit_changed" }));
  await act(async () => { editor().onAmount("2.000"); });
  await act(async () => { await editor().submit(); });
  expect(editor()).toMatchObject({ amount: "2.000", editable: false, canSubmit: false, canDismiss: true });
  expect(editor().error).toBe("This limit or month changed. Close and reopen the Budget to use its latest limit.");
  expect(api.save.mock.calls.map(([request]) => [request.expectedRevisionId, request.idempotencyKey])).toEqual([["revision-1", "budget-1"], ["revision-1", "budget-2"]]);
});

test("unmounted editor acknowledgements cannot close a new editor or submit again", async () => {
  const api = transport();
  let resolve: (() => void) | undefined;
  const wait = new Promise<void>((done) => { resolve = done; });
  api.save.mockImplementationOnce(async (request) => { await wait; return { replay: true, revision: {
    id: "late", workspaceId: request.workspaceId, categoryId: request.categoryId,
    effectiveMonth: request.effectiveMonth, limitMinorUnits: request.limit.minorUnits,
    expectedRevisionId: null, sequence: 1, idempotencyKey: request.idempotencyKey, createdBy: "owner", createdAt: 1,
  } }; });
  const old = await open(api);
  await act(async () => { old().onCategory("food"); old().onAmount("1.000"); });
  let pending: Promise<void> | undefined;
  await act(async () => { pending = old().submit(); });
  await act(async () => { root?.unmount(); });
  const current = await open(api);
  await act(async () => { current().onCategory("family"); current().onAmount("2.000"); resolve?.(); await pending; });
  expect(current()).toMatchObject({ amount: "2.000", categoryId: "family", pending: false, canSubmit: true });
  expect(api.onSaved).not.toHaveBeenCalled();
  await act(async () => { await old().submit(); await current().submit(); });
  expect(api.save.mock.calls.map(([request]) => [request.categoryId, request.limit.minorUnits]))
    .toEqual([["food", 100000], ["family", 200000]]);
  expect(api.onSaved).toHaveBeenCalledOnce();
});

test.each(["", "0", "-1", "1,234", "90.071.992.547.409,92"])("invalid limit %s remains editable without submitting", async (amount) => {
  const api = transport();
  const editor = await open(api);
  await act(async () => { editor().onCategory("food"); editor().onAmount(amount); });
  expect(editor().canSubmit).toBe(false);
  await act(async () => { await editor().submit(); });
  expect(api.save).not.toHaveBeenCalled();
  await act(async () => { editor().onAmount("1,23"); await editor().submit(); });
  expect(editor().amount).toBe("1,23");
  expect(editor().canSubmit).toBe(true);
});
