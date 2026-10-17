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
  impliedAnnualRateBps: 1800, activationMonth: "2026-09", currency: "COP",
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
    transfer: vi.fn<RecoveryMoveTransport["transfer"]>(async () => ({ id: "xfer-1" })),
    contribute: vi.fn<RecoveryMoveTransport["contribute"]>(async (request) => ({
      replay: false,
      contribution: {
        id: "gift-1", workspaceId: request.workspaceId, planId: request.planId,
        transferJournalEntryId: request.transferJournalEntryId, amountMinorUnits: 230_000,
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

test("the due amount posts a transfer first, then attributes that exact posted entry", async () => {
  const api = transport();
  const move = await open(api);
  expect(move()).toMatchObject({ sourceId: "daily", amount: "2.300,00", canSubmit: true });
  await act(async () => { await Promise.all([move().submit(), move().submit()]); });
  expect(api.transfer.mock.calls.map(([request]) => request)).toEqual([{
    workspaceId: "workspace",
    sourceFinancialAccountProfileId: "daily",
    destinationFinancialAccountProfileId: "savings",
    amount: { currency: "COP", minorUnits: 230_000 },
    accountingDate: localDate(),
    description: "Recovery: Laptop repair",
    idempotencyKey: "move-1",
  }]);
  expect(api.contribute.mock.calls.map(([request]) => request)).toEqual([{
    workspaceId: "workspace", planId: "plan-1", transferJournalEntryId: "xfer-1", idempotencyKey: "move-2",
  }]);
  expect(api.onMoved).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    contribution: expect.objectContaining({ transferJournalEntryId: "xfer-1", amountMinorUnits: 230_000 }),
  }), 230_000);
});

test("an uncertain transfer freezes edits and retry reuses both keys", async () => {
  const api = transport();
  api.transfer.mockRejectedValueOnce(new Error("lost acknowledgement"));
  const move = await open(api);
  await act(async () => { await move().submit(); move().onSource("savings"); move().onAmount("3.000"); });
  expect(move()).toMatchObject({ sourceId: "daily", amount: "2.300,00", pending: true, editable: false, canDismiss: false });
  await act(async () => { await move().submit(); });
  expect(api.transfer.mock.calls.map(([request]) => request.idempotencyKey)).toEqual(["move-1", "move-1"]);
  expect(api.contribute.mock.calls.map(([request]) => request.idempotencyKey)).toEqual(["move-2"]);
});

test("a posted transfer whose contribution is rejected is retried without a second transfer", async () => {
  const api = transport();
  api.contribute.mockRejectedValueOnce(new ConvexError({ kind: "recovery", code: "plan_already_complete" }));
  const move = await open(api);
  await act(async () => { await move().submit(); });
  expect(move()).toMatchObject({
    pending: false, canDismiss: true, editable: false, postedTransferId: "xfer-1",
    error: "The transfer posted or the contribution was rejected. Retry to use the same movement safely.",
  });
  await act(async () => { move().onAmount("4.000"); await move().submit(); });
  expect(move().amount).toBe("2.300,00");
  expect(api.transfer).toHaveBeenCalledOnce();
  expect(api.contribute.mock.calls.map(([request]) => request.transferJournalEntryId)).toEqual(["xfer-1", "xfer-1"]);
  expect(api.onMoved).toHaveBeenCalledOnce();
});

test("an accounting rejection before a transfer id lets the next attempt use new keys", async () => {
  const api = transport();
  api.transfer.mockRejectedValueOnce(new ConvexError({ kind: "accounting", code: "transfer_profiles_must_differ" }));
  const move = await open(api);
  await act(async () => { await move().submit(); });
  expect(move()).toMatchObject({ pending: false, editable: true, canDismiss: true });
  await act(async () => { await move().submit(); });
  expect(api.transfer.mock.calls.map(([request]) => request.idempotencyKey)).toEqual(["move-1", "move-3"]);
});

test("the same source and destination never posts", async () => {
  const api = transport();
  const move = await open(api);
  await act(async () => { move().onSource("savings"); });
  await act(async () => { await move().submit(); });
  expect(move().error).toBe("Choose a different place to move money from.");
  expect(api.transfer).not.toHaveBeenCalled();
});

test("unmounted acknowledgements cannot finish a newer movement", async () => {
  const api = transport();
  let resolve: ((value: { id: string }) => void) | undefined;
  api.transfer.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const old = await open(api);
  let pending: Promise<void> | undefined;
  await act(async () => { pending = old().submit(); });
  await act(async () => { root?.unmount(); });
  const current = await open(api);
  await act(async () => { resolve?.({ id: "late" }); await pending; });
  expect(api.onMoved).not.toHaveBeenCalled();
  await act(async () => { await current().submit(); });
  expect(api.contribute.mock.calls.map(([request]) => request.transferJournalEntryId)).toEqual(["xfer-1"]);
});
