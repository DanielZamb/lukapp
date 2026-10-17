import { ConvexError } from "convex/values";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, test, vi } from "vitest";
import { localDate } from "../money";
import type { RecoveryPlace, RecoveryPlanView } from "./model";
import { useRecoveryMove, type RecoveryMoveTransport } from "./useRecoveryMove";

const plan: RecoveryPlanView = {
  id: "plan-1", title: "Laptop repair", sourceJournalEntryId: "exp-1", sourceTitle: "Laptop repair",
  destinationFinancialAccountProfileId: "savings", destinationName: "Savings",
  principalMinorUnits: 1_200_000, installmentCount: 6, installmentMinorUnits: 230_000,
  impliedAnnualRateBps: 150, activationMonth: "2026-09", currency: "COP",
  recoveredMinorUnits: 0, remainingMinorUnits: 1_380_000, targetMinorUnits: 1_380_000,
  dueMinorUnits: 230_000,
};
const sources: RecoveryPlace[] = [
  { id: "daily", name: "Daily", productKind: "bankAccount" },
  { id: "savings", name: "Savings", productKind: "savingsAccount" },
];
let root: ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });
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
async function open(api: RecoveryMoveTransport) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let hook: ReturnType<typeof useRecoveryMove> | undefined;
  function Harness() { hook = useRecoveryMove({ workspaceId: "workspace", plan, sources }, api); return null; }
  await act(async () => { root = create(createElement(Harness)); });
  return () => { if (!hook) throw new Error("Move hook not mounted"); return hook; };
}

test("the due amount posts one guarded movement under one key", async () => {
  const api = transport();
  const move = await open(api);
  expect(move()).toMatchObject({ sourceId: "daily", amount: "2.300,00", canSubmit: true });
  await act(async () => { await Promise.all([move().submit(), move().submit()]); });
  expect(api.move.mock.calls.map(([request]) => request)).toEqual([{
    workspaceId: "workspace", planId: "plan-1", sourceFinancialAccountProfileId: "daily",
    amount: { currency: "COP", minorUnits: 230_000 },
    accountingDate: localDate(), description: "Recovery: Laptop repair", idempotencyKey: "move-1",
  }]);
  expect(api.onMoved).toHaveBeenCalledOnce();
});

test("an uncertain movement freezes edits and retry reuses the same key", async () => {
  const api = transport();
  api.move.mockRejectedValueOnce(new Error("lost acknowledgement"));
  const move = await open(api);
  await act(async () => { await move().submit(); move().onSource("savings"); move().onAmount("3.000"); });
  expect(move()).toMatchObject({ sourceId: "daily", amount: "2.300,00", pending: true, editable: false, canDismiss: false });
  await act(async () => { await move().submit(); });
  expect(api.move.mock.calls.map(([request]) => request.idempotencyKey)).toEqual(["move-1", "move-1"]);
});

test("a typed rejection leaves the draft editable for a new key", async () => {
  const api = transport();
  api.move.mockRejectedValueOnce(new ConvexError({ kind: "recovery", code: "source_must_be_asset" }));
  const move = await open(api);
  await act(async () => { await move().submit(); });
  expect(move()).toMatchObject({ pending: false, editable: true, canDismiss: true });
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
