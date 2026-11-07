import { ConvexError } from "convex/values";
import { expect, test, vi } from "vitest";
vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
import type { ConfirmCandidateInput, ConfirmCandidateResult } from "../../../../../src/notificationIntake/types";
import { fixture, mapping, now } from "./service.testSupport";
import { IntakeService } from "./service";
import { serializeState } from "./durableState";

function receipt(command: ConfirmCandidateInput, changedFields: string[]): ConfirmCandidateResult {
  return {
    posted: { id: `journal-${command.candidateId}`, description: command.confirmed.description, amount: command.confirmed.amount, replay: false },
    receipt: { id: `receipt-${command.candidateId}`, workspaceId: command.workspaceId, journalEntryId: `journal-${command.candidateId}`,
      idempotencyKey: `intake:${command.candidateId}`, suggestion: command.suggestion, changedFields,
      parserVersion: command.parserVersion, consentVersion: command.consentVersion, actorId: "actor-1", confirmedAt: now }, replay: false,
  };
}

test("SEN90-R1-01 Android module absence retains durable cleanup state and retries native wipe after reopen", async () => {
  const f = fixture(); const nativeBytes = f.raw(); f.setLegacy({ private: true });
  const wiped = vi.fn(); const service = new IntakeService({ ...f.deps, onWiped: wiped });
  const status = vi.spyOn(f.native, "getStatus").mockResolvedValue({ supported: false, reason: "native_module_missing" });
  await expect(service.disableAndWipe()).rejects.toMatchObject({ code: "NATIVE_WIPE_REQUIRED" });
  expect(f.raw()).toBe(nativeBytes); expect(f.legacy()).toEqual({ private: true });
  expect(f.wipeIntent()).toEqual({ kind: "native_required" }); expect(wiped).not.toHaveBeenCalled();
  expect(service.getSnapshot().wipePending).toBe(true);
  await expect(service.configure([{ ...mapping, sourceSelectionId: "late" }], "v1")).rejects.toThrow("Intake wipe must finish");
  status.mockRestore();
  const reopened = new IntakeService({ ...f.deps, onWiped: wiped }); await reopened.refresh();
  expect(f.events.filter((event) => event === "wipe")).toEqual(["wipe"]);
  expect(f.raw()).toBeNull(); expect(f.legacy()).toBeNull(); expect(f.wipeIntent()).toBeNull(); expect(wiped).toHaveBeenCalledOnce();
});

test("SEN90-R1-01 platform unsupported retains its explicit no-Android-store cleanup contract", async () => {
  const f = fixture(); f.setLegacy({ old: true });
  vi.spyOn(f.native, "getStatus").mockResolvedValue({ supported: false, reason: "platform" });
  await f.service.disableAndWipe(); expect(f.legacy()).toBeNull(); expect(f.wipeIntent()).toBeNull();
  expect(f.events).not.toContain("wipe"); expect(f.service.getSnapshot().wipePending).toBe(false);
});

test("SEN90-R1-02 a committed review write with a lost response is proven by readback exactly once", async () => {
  const f = fixture(); await f.service.refresh(); const before = f.service.read("capture-1"); if (!before) throw new Error("Missing Candidate");
  const review = { ...before.review, description: "Committed review" };
  const writes = vi.spyOn(f.native, "writeCandidateState");
  f.afterWrite(() => { throw new Error("write response lost"); });
  await expect(f.service.updateReview(before.id, 0, review)).resolves.toBe(1);
  expect(f.service.read(before.id)?.review.description).toBe("Committed review");
  expect(f.service.read(before.id)?.recordRevision).toBe(1); expect(writes).toHaveBeenCalledOnce();
});

test("SEN90-R1-02 failure before commit remains an error and exact retry saves the edit once", async () => {
  const f = fixture(); await f.service.refresh(); const before = f.service.read("capture-1"); if (!before) throw new Error("Missing Candidate");
  const review = { ...before.review, description: "Retry review" }; f.failWrite();
  await expect(f.service.updateReview(before.id, 0, review)).rejects.toThrow("disk full");
  expect(f.service.read(before.id)?.recordRevision).toBe(0); expect(f.service.read(before.id)?.review.description).toBe("Market");
  f.allowWrite(); await expect(f.service.updateReview(before.id, 0, review)).resolves.toBe(1);
  expect(f.service.read(before.id)?.review.description).toBe("Retry review");
});

test("SEN90-R1-02 exact review replay converges after the first readback is also unavailable", async () => {
  const f = fixture(); await f.service.refresh(); const before = f.service.read("capture-1"); if (!before) throw new Error("Missing Candidate");
  const review = { ...before.review, description: "Saved while offline" };
  const reads = vi.spyOn(f.native, "readCandidateState"); const writes = vi.spyOn(f.native, "writeCandidateState");
  f.afterWrite(() => {
    reads.mockRejectedValueOnce(new Error("readback unavailable"));
    throw new Error("write response lost");
  });
  await expect(f.service.updateReview(before.id, 0, review)).rejects.toThrow();
  f.afterWrite(() => {}); reads.mockRestore();
  await expect(f.service.updateReview(before.id, 0, review)).resolves.toBe(1);
  expect(f.service.read(before.id)?.recordRevision).toBe(1); expect(f.service.read(before.id)?.review.description).toBe("Saved while offline");
  expect(writes).toHaveBeenCalledOnce();
});

test("SEN90-R1-02 a concurrent different edit is never accepted as the lost review write", async () => {
  const f = fixture(); await f.service.refresh(); const before = f.service.read("capture-1"); if (!before) throw new Error("Missing Candidate");
  const review = { ...before.review, description: "This edit" };
  f.afterWrite(() => {
    const state = f.state();
    f.setValue(serializeState({ ...state, records: state.records.map((row) => row.kind === "active"
      ? { ...row, recordRevision: 2, review: { ...row.review, description: "Concurrent edit" } } : row) }), 100);
    throw new Error("write response lost");
  });
  await expect(f.service.updateReview(before.id, 0, review)).rejects.toThrow(); f.afterWrite(() => {});
  await expect(f.service.updateReview(before.id, 0, review)).rejects.toThrow("RECORD_REVISION_MISMATCH");
  expect(f.state().records[0]).toMatchObject({ recordRevision: 2, review: { description: "Concurrent edit" } });
});

test.each([{ fields: [] }, { fields: ["description"] }, { fields: ["financialAccountProfileId", "financialAccountProfileId"] }])(
  "SEN90-R1-03 contradictory receipt edit fields %j preserve the frozen Candidate", async ({ fields }) => {
    const f = fixture(); await f.service.refresh(); const before = f.service.read("capture-1"); if (!before) throw new Error("Missing Candidate");
    const revision = await f.service.updateReview(before.id, 0, { ...before.review, financialAccountProfileId: "account-2" });
    const command = await f.service.beginConfirmation(before.id, revision);
    await expect(f.service.recordOutcomes([{ candidateId: before.id, ok: true, result: receipt(command, fields) }])).rejects.toThrow("OUTCOME_MISMATCH");
    expect(f.service.read(before.id)?.status.kind).toBe("submitting");
    await f.service.recordOutcomes([{ candidateId: before.id, ok: true, result: receipt(command, ["financialAccountProfileId"]) }]);
    await f.service.applyRecordedOutcomes(); expect(f.service.read(before.id)).toBeNull();
  },
);

test("SEN90-R1-03 canonical field order is required and one bad receipt leaves a whole batch frozen", async () => {
  const f = fixture(); const { capture } = await import("./service.testSupport");
  f.setPages([{ captures: [capture, { ...capture, captureId: "capture-2" }], nextCursor: null }]); await f.service.refresh();
  const first = await f.service.beginConfirmation("capture-1", 0);
  const row = f.service.read("capture-2"); if (!row) throw new Error("Missing Candidate");
  const revision = await f.service.updateReview(row.id, 0, { ...row.review, description: "Edited", financialAccountProfileId: "account-2" });
  const second = await f.service.beginConfirmation(row.id, revision);
  await expect(f.service.recordOutcomes([{ candidateId: first.candidateId, ok: true, result: receipt(first, []) },
    { candidateId: second.candidateId, ok: true, result: receipt(second, ["financialAccountProfileId", "description"]) }])).rejects.toThrow("OUTCOME_MISMATCH");
  expect(f.state().records.map((row) => row.kind === "active" ? row.status.kind : row.kind)).toEqual(["submitting", "submitting"]);
  await f.service.recordOutcomes([{ candidateId: first.candidateId, ok: true, result: receipt(first, []) },
    { candidateId: second.candidateId, ok: true, result: receipt(second, ["description", "financialAccountProfileId"]) }]);
  await f.service.applyRecordedOutcomes(); expect(f.service.candidates()).toEqual([]);
});

async function pendingConfigure() {
  const f = fixture(); const configure = vi.spyOn(f.native, "configure").mockRejectedValueOnce(new Error("before native control"));
  await expect(f.service.configure([{ ...mapping, sourceSelectionId: "selection-2", packageName: "app.other" }], "v1")).rejects.toThrow("before native control");
  return { f, configure, frozen: f.state().pendingConfigure };
}

test("SEN90-R1-04 pending replay validates current mapping and later retries the identical control", async () => {
  const { f, configure, frozen } = await pendingConfigure(); const denied = vi.fn(async () => false); f.deps.validateMapping = denied;
  await expect(f.service.retryConfigure()).rejects.toThrow("Mapping unavailable");
  expect(denied).toHaveBeenCalledOnce(); expect(configure).toHaveBeenCalledOnce(); expect(f.state().pendingConfigure).toEqual(frozen);
  f.deps.validateMapping = async () => true; await f.service.retryPendingControl();
  expect(configure.mock.calls[1]?.[0]).toEqual(frozen); expect(f.state().activeSelectionIds).toEqual(["selection-2"]);
});

test("SEN90-R1-04 a missing saved mapping cannot be replayed or replaced", async () => {
  const { f, configure, frozen } = await pendingConfigure(); const state = f.state();
  f.setValue(serializeState({ ...state, mappings: state.mappings.filter((mapping) => mapping.sourceSelectionId !== "selection-2") }));
  await expect(f.service.retryConfigure()).rejects.toThrow("Mapping unavailable");
  expect(configure).toHaveBeenCalledOnce(); expect(f.state().pendingConfigure).toEqual(frozen);
});

test("SEN90-R1-04 lock during mapping revalidation prevents native replay", async () => {
  const { f, configure, frozen } = await pendingConfigure(); f.deps.validateMapping = async () => { f.service.stop(); return true; };
  await expect(f.service.retryConfigure()).rejects.toThrow("Intake admission ended");
  expect(configure).toHaveBeenCalledOnce(); expect(f.state().pendingConfigure).toEqual(frozen);
});

test("SEN90-R1-04 wipe-bearing mapping failure propagates without changing the pending command", async () => {
  const { f, configure, frozen } = await pendingConfigure(); const failure = new ConvexError({ code: "device_revoked", wipeLocalInput: true });
  f.deps.validateMapping = async () => { throw failure; };
  await expect(f.service.retryPendingControl()).rejects.toBe(failure);
  expect(configure).toHaveBeenCalledOnce(); expect(f.state().pendingConfigure).toEqual(frozen);
});
