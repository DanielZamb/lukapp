import * as React from "react";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { RecoveryContribution, RecoveryPlanView } from "./model";
import { useRecoveryCancel, useRecoveryCorrection } from "./useRecoveryLifecycle";

const plan: RecoveryPlanView = {
  canCancel: true, acceptsContributions: true, cancellation: undefined, replacesPlanId: undefined, replacedByPlanId: undefined,
  contributionHistory: [], status: "active", id: "plan-1", title: "Laptop repair", sourceJournalEntryId: "exp-1",
  sourceTitle: "Laptop repair", destinationFinancialAccountProfileId: "savings", destinationName: "Savings",
  principalMinorUnits: 1_200_000, installmentCount: 6, installmentMinorUnits: 230_000, impliedAnnualRateBps: 150,
  activationDate: "2026-09-01", activationMonth: "2026-09", currency: "COP", recoveredMinorUnits: 0,
  remainingMinorUnits: 1_380_000, targetMinorUnits: 1_380_000, dueMinorUnits: 230_000,
};
const other: RecoveryPlanView = { ...plan, id: "plan-2", title: "Dental", sourceJournalEntryId: "exp-2" };
const contribution = { id: "c1", status: "active", amountMinorUnits: 100_000, contributionDate: "2026-10-01" } as RecoveryContribution;

let root: ReactTestRenderer | undefined;
beforeEach(() => { vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); });
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });

async function hook<T>(use: () => T) {
  let value: T | undefined;
  function Harness() { value = use(); return null; }
  await act(async () => { root = create(createElement(Harness)); });
  return () => value!;
}

function cancelling() {
  let key = 0;
  const cancel = vi.fn(async (request: { idempotencyKey: string }) => ({ planId: "plan-1", replay: false, key: request.idempotencyKey }) as never);
  return { cancel, newKey: () => `cancel-${++key}`, reportFailure: () => false, onCancelled: vi.fn() };
}

function correcting() {
  let key = 0;
  const correct = vi.fn(async (_request: unknown) => ({ replay: false }) as never);
  return { correct, newKey: () => `fix-${++key}`, reportFailure: () => false, onCorrected: vi.fn() };
}

test("a Cancel plan handler kept before the reason was typed sends the reason the screen shows", async () => {
  const api = cancelling();
  const form = await hook(() => useRecoveryCancel({ workspaceId: "workspace", plan }, api));
  const kept = form().submit;
  await act(async () => { form().onReason("  Paid it off  "); });
  await act(async () => { await kept(); });
  expect(api.cancel.mock.calls.map(([request]) => request)).toEqual([
    { workspaceId: "workspace", planId: "plan-1", reason: "Paid it off", idempotencyKey: "cancel-1" },
  ]);
});

test("a Cancel plan resend after a lost reply is the held request, whatever kept handlers type since", async () => {
  const api = cancelling();
  api.cancel.mockRejectedValueOnce(new Error("lost acknowledgement"));
  const form = await hook(() => useRecoveryCancel({ workspaceId: "workspace", plan }, api));
  await act(async () => { form().onReason("Paid it off"); });
  const kept = { submit: form().submit, reason: form().onReason };
  await act(async () => { await kept.submit(); });
  await act(async () => { kept.reason("Changed my mind"); });
  expect(form().reason).toBe("Paid it off");
  await act(async () => { await kept.submit(); });
  const held = { workspaceId: "workspace", planId: "plan-1", reason: "Paid it off", idempotencyKey: "cancel-1" };
  expect(api.cancel.mock.calls.map(([request]) => request)).toEqual([held, held]);
});

test("a Back handler kept from before a lost reply does not close a plan cancellation whose outcome is unknown", async () => {
  const api = cancelling();
  api.cancel.mockRejectedValueOnce(new Error("lost acknowledgement"));
  const close = vi.fn();
  const form = await hook(() => useRecoveryCancel({ workspaceId: "workspace", plan }, api));
  const kept = form().dismiss;
  await act(async () => { await form().submit(); });
  expect(form().canDismiss).toBe(false);
  kept(close);
  expect(close).not.toHaveBeenCalled();
});

test("a Fix attribution handler kept before the target changed sends the target the screen shows", async () => {
  const api = correcting();
  const form = await hook(() => useRecoveryCorrection({ workspaceId: "workspace", plan, plans: [plan, other], contribution }, api));
  await act(async () => { form().onTarget({ kind: "plan", planId: "plan-2" }); form().onReason("Wrong plan"); });
  const kept = form().submit;
  await act(async () => { form().onTarget({ kind: "remove" }); form().onReason("Not a recovery"); });
  await act(async () => { await kept(); });
  expect(api.correct.mock.calls.map(([request]) => request)).toEqual([
    { workspaceId: "workspace", contributionId: "c1", reason: "Not a recovery", idempotencyKey: "fix-1" },
  ]);
});

test("a Fix attribution resend after a lost reply is the held request, whatever kept handlers chose since", async () => {
  const api = correcting();
  api.correct.mockRejectedValueOnce(new Error("lost acknowledgement"));
  const form = await hook(() => useRecoveryCorrection({ workspaceId: "workspace", plan, plans: [plan, other], contribution }, api));
  await act(async () => { form().onTarget({ kind: "plan", planId: "plan-2" }); form().onReason("Wrong plan"); });
  const kept = { submit: form().submit, target: form().onTarget, reason: form().onReason };
  await act(async () => { await kept.submit(); });
  await act(async () => { kept.target({ kind: "remove" }); kept.reason("Changed"); });
  expect(form()).toMatchObject({ target: { kind: "plan", planId: "plan-2" }, reason: "Wrong plan" });
  await act(async () => { await kept.submit(); });
  const held = { workspaceId: "workspace", contributionId: "c1", reason: "Wrong plan", targetPlanId: "plan-2", idempotencyKey: "fix-1" };
  expect(api.correct.mock.calls.map(([request]) => request)).toEqual([held, held]);
});
