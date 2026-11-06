import { expect, test, vi } from "vitest";
vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
import { emptyState, ingest, parseState, serializeState, terminal, utf8Bytes } from "./durableState";
import { IntakeService } from "./service";
import { fixture, now, mapping, capture, hash } from "./service.testSupport";

test("persists the stable capture before acknowledgement and freezes the workspace date", async () => {
  const f = fixture();
  expect(await f.service.refresh()).toEqual({ saved: 1, unresolved: 0, conflicts: 0 });
  expect(f.events).toEqual(["write", "page:0", "write", "ack"]);
  expect(f.service.read("capture-1")?.review).toEqual({ direction: "out", description: "Market", amountMinorUnits: 45000,
    accountingDate: "2026-10-23", financialAccountProfileId: "account-1", userCategoryIds: [], primaryUserCategoryId: null });
  expect(f.service.read("capture-1")?.expiresAt).toBe(1_794_095_999_900);
});

test("a failure before persistence does not acknowledge or create a Candidate", async () => {
  const f = fixture(); f.failWrite();
  await expect(f.service.refresh()).rejects.toThrow("disk full");
  expect(f.events).toEqual(["write"]); expect(f.state().records).toEqual([]);
});

test("after-save before-ack failure replays without losing edited review or refreshing expiry", async () => {
  const f = fixture(); f.failAck();
  await expect(f.service.refresh()).rejects.toThrow("ack lost");
  const row = f.service.read("capture-1");
  if (!row) throw new Error("missing saved row");
  await f.service.updateReview(row.id, row.recordRevision, { ...row.review, description: "Edited market" });
  f.setClock(now + 1000);
  await expect(f.service.refresh()).rejects.toThrow("ack lost");
  expect(f.service.read("capture-1")?.review.description).toBe("Edited market");
  expect(f.service.read("capture-1")?.originalSuggestion.description).toBe("Market");
  expect(f.service.read("capture-1")?.expiresAt).toBe(1_794_095_999_900);
});

test("deleted replay retains only content-free terminal metadata and changed envelope remains unacked", async () => {
  const f = fixture(); await f.service.refresh(); await f.service.deleteCandidate("capture-1", 0);
  expect(f.state().records[0]).toEqual({ kind: "terminal", id: "capture-1", digest: await hash(JSON.stringify(capture)),
    recordRevision: 1, expiresAt: 1_794_095_999_900, reason: "deleted" });
  await f.service.refresh(); expect(f.service.read("capture-1")).toBeNull();
  f.setPages([{ captures: [{ ...capture, amountMinorUnits: 999 }], nextCursor: null }]);
  const ackCount = f.events.filter((e) => e === "ack").length;
  expect(await f.service.refresh()).toEqual({ saved: 0, unresolved: 0, conflicts: 1 });
  expect(f.events.filter((e) => e === "ack")).toHaveLength(ackCount);
  expect(f.raw()).not.toContain("Market"); expect(f.raw()).not.toContain("45000");
});

test("all bounded pages advance past missing mappings and include another workspace", async () => {
  const f = fixture();
  f.setValue(serializeState({ ...emptyState(), mappings: [mapping, { ...mapping, sourceSelectionId: "retired", workspaceId: "workspace-2" }] }));
  f.setPages([{ captures: [{ ...capture, captureId: "unresolved", sourceSelectionId: "missing-retired" }], nextCursor: "1" },
    { captures: [{ ...capture, sourceSelectionId: "retired" }], nextCursor: null }]);
  expect(await f.service.refresh()).toEqual({ saved: 1, unresolved: 1, conflicts: 0 });
  expect(f.service.read("capture-1")?.workspaceId).toBe("workspace-2");
  expect(f.events).toContain("page:1");
});

test("mapping validation rejection leaves capture pending", async () => {
  const f = fixture(); f.deps.validateMapping = async () => false;
  expect(await f.service.refresh()).toEqual({ saved: 0, unresolved: 1, conflicts: 0 });
  expect(f.events).not.toContain("ack");
});

test("CAS conflict retries against fresh state", async () => {
  const f = fixture();
  f.afterWrite(() => { f.conflict(); f.afterWrite(() => {}); });
  await f.service.refresh();
  expect(f.service.candidates().map((c) => c.id)).toEqual(["capture-1"]);
  expect(f.events.filter((e) => e === "write")).toHaveLength(3);
});

test("owner conflict fails closed and a mismatched lease cannot construct a service", async () => {
  const f = fixture(); f.wrongOwner();
  await expect(f.service.refresh()).rejects.toMatchObject({ code: "OWNER_MISMATCH" });
  expect(f.events).toEqual([]);
  expect(() => new IntakeService({ ...f.deps, subject: "other" })).toThrow("OWNER_MISMATCH");
});

test("generation ending during a read prevents persistence", async () => {
  const f = fixture(); f.beforeRead(() => f.service.stop());
  await expect(f.service.refresh()).rejects.toThrow("Intake admission ended"); expect(f.events).toEqual([]);
});

test("a denied lease during a read prevents the next write", async () => {
  const f = fixture(); f.beforeRead(() => f.lease.deny());
  await expect(f.service.refresh()).rejects.toThrow("Local input admission ended"); expect(f.events).toEqual([]);
});

test("an admitted atomic write may finish after lock but acknowledgement cannot begin", async () => {
  const f = fixture(); let writes = 0;
  f.afterWrite(() => { writes += 1; if (writes === 2) f.service.stop(); });
  await expect(f.service.refresh()).rejects.toThrow("Intake admission ended");
  expect(f.state().records.map((r) => r.id)).toEqual(["capture-1"]); expect(f.events).not.toContain("ack");
});

test("epoch rotation after persistence prevents stale acknowledgement", async () => {
  const f = fixture(); let writes = 0;
  f.afterWrite(() => { writes += 1; if (writes === 2) f.rotate(); });
  await expect(f.service.refresh()).rejects.toMatchObject({ code: "EPOCH_MISMATCH" });
  expect(f.events).not.toContain("ack");
});

test("corrupt JSON and malformed state are never converted to empty", async () => {
  for (const value of ["{broken", '{"v":2}', "null"]) {
    const f = fixture(); f.setValue(value);
    await expect(f.service.refresh()).rejects.toThrow(); expect(f.raw()).toBe(value); expect(f.events).toEqual([]);
  }
});

test("native state wins over legacy rows", async () => {
  const f = fixture(); f.setLegacy({ invalid: true }); await f.service.refresh();
  expect(f.legacy()).toEqual({ invalid: true }); expect(f.events).not.toContain("delete-legacy");
});

function legacyRow() {
  return { id: "legacy-1", createdAt: now - 200, expiresAt: now + 10000, workspaceId: "workspace-1", currency: "COP",
    suggestion: { direction: "out", description: "Legacy", amountMinorUnits: 400, accountingDate: "2026-10-23",
      financialAccountProfileId: "account-1", userCategoryIds: [], primaryUserCategoryId: null }, parserVersion: "v1", consentVersion: "v1" };
}
test("revision zero migration reads back exact bytes before deleting legacy and fabricates no capture", async () => {
  const f = fixture(); f.setValue(null, 0); f.setLegacy({ v: 1, candidates: [legacyRow()] });
  await f.service.refresh();
  expect(f.legacy()).toBeNull(); expect(f.events.slice(0, 2)).toEqual(["write", "delete-legacy"]);
  expect(f.service.read("legacy-1")?.origin).toEqual({ kind: "legacy" });
  expect(f.service.read("legacy-1")?.expiresAt).toBe(now + 10000);
});

test("migration interruption after write preserves the old key and newer native data on reopen", async () => {
  const f = fixture(); f.setValue(null, 0); f.setLegacy({ v: 1, candidates: [legacyRow()] });
  f.afterWrite(() => f.service.stop());
  await expect(f.service.refresh()).rejects.toThrow("Intake admission ended");
  expect(f.legacy()).not.toBeNull();
  const reopened = new IntakeService(f.deps); f.afterWrite(() => {}); await reopened.refresh();
  expect(reopened.read("legacy-1")?.review.description).toBe("Legacy");
  expect(f.legacy()).toBeNull();
});

test("review persists across restart while original evidence is immutable and uncertain command stays exact", async () => {
  const f = fixture(); await f.service.refresh();
  const row = f.service.read("capture-1"); if (!row) throw new Error("missing row");
  await f.service.updateReview(row.id, 0, { ...row.review, description: "Reviewed", amountMinorUnits: 50000 });
  const command = await f.service.beginConfirmation(row.id, 1);
  expect(command.confirmed.description).toBe("Reviewed"); expect(command.confirmed.amount.minorUnits).toBe(50000);
  expect(command.suggestion.description).toBe("Market"); expect(command.suggestion.amount.minorUnits).toBe(45000);
  const reopened = new IntakeService(f.deps); await reopened.refresh();
  expect(await reopened.beginConfirmation(row.id, 0)).toEqual(command);
  await expect(reopened.updateReview(row.id, 2, { ...row.review, description: "Changed after timeout" })).rejects.toThrow("Confirmation frozen");
  expect(reopened.read(row.id)?.status.kind).toBe("submitting");
});

test("a failed batch outcome write leaves every command frozen for exact retry", async () => {
  const f = fixture(); f.setPages([{ captures: [capture, { ...capture, captureId: "capture-2" }], nextCursor: null }]);
  await f.service.refresh(); await f.service.beginConfirmation("capture-1", 0); await f.service.beginConfirmation("capture-2", 0);
  f.failWrite();
  const outcomes = [{ candidateId: "capture-1", ok: false, error: "Locked Period" },
    { candidateId: "capture-2", ok: false, error: "idempotency_key_conflict" }] satisfies Parameters<IntakeService["recordOutcomes"]>[0];
  await expect(f.service.recordOutcomes(outcomes)).rejects.toThrow("disk full");
  expect(f.state().records.map((r) => r.kind === "active" ? r.status.kind : r.kind)).toEqual(["submitting", "submitting"]);
  f.allowWrite(); await f.service.recordOutcomes(outcomes); await f.service.applyRecordedOutcomes(); await f.service.applyRecordedOutcomes();
  expect(f.service.candidates().map((c) => c.error)).toEqual(["Locked Period", "idempotency_key_conflict"]);
});

test("unknown currency requires explicit review before confirmation", async () => {
  const f = fixture(); f.setPages([{ captures: [{ ...capture, currency: null }], nextCursor: null }]); await f.service.refresh();
  await expect(f.service.beginConfirmation("capture-1", 0)).rejects.toThrow("Review unresolved currency");
  const row = f.service.read("capture-1"); if (!row) throw new Error("missing row");
  await f.service.updateReview(row.id, 0, row.review, { currencyReviewed: true });
  expect((await f.service.beginConfirmation(row.id, 1)).confirmed.amount.currency).toBe("COP");
});

test("configuration persists mapping and frozen mutation before a lost response, then retries exactly", async () => {
  const f = fixture(); f.loseConfigure();
  const next = { ...mapping, sourceSelectionId: "selection-2" };
  await expect(f.service.configure([next], "v1")).rejects.toThrow("timeout");
  expect(f.state().activeSelectionIds).toEqual(["selection-1"]);
  expect(f.state().pendingConfigure?.expectedEpoch).toBe("a".repeat(22));
  expect(f.state().mappings.map((m) => m.sourceSelectionId)).toEqual(["selection-1", "selection-2"]);
  await f.service.retryConfigure();
  expect(f.events).toEqual(["write", "configure", "write"]);
  expect(f.state().activeSelectionIds).toEqual(["selection-2"]); expect(f.state().pendingConfigure).toBeNull();
});

test("configuration cannot reuse or replace an immutable source id", async () => {
  const f = fixture(); await expect(f.service.configure([{ ...mapping, workspaceId: "other" }], "v1")).rejects.toThrow("Source selection requires a new id");
  expect(f.events).not.toContain("configure"); expect(f.state().mappings).toEqual([mapping]);
});

test("expiry deletes active and terminal rows at original expiry", async () => {
  const f = fixture(); await f.service.refresh(); await f.service.deleteCandidate("capture-1", 0);
  f.setClock(capture.expiresAt); await f.service.refresh(); expect(f.state().records).toEqual([]);
});

test("record count and UTF-8 bounds reject without eviction", async () => {
  const state = ingest(emptyState(), capture, mapping, await hash(JSON.stringify(capture)));
  const row = state.records[0]; if (!row || row.kind !== "active") throw new Error("missing row");
  const full = { ...state, records: Array.from({ length: 512 }, (_, i) => ({ ...terminal(row, "deleted"), id: `terminal-${i}` })) };
  expect(parseState(serializeState(full)).records).toHaveLength(512);
  expect(() => ingest(full, capture, mapping, "0".repeat(64))).toThrow(); expect(full.records).toHaveLength(512);
  expect(utf8Bytes("é😀")).toBe(6);
  expect(() => serializeState({ ...state, records: Array.from({ length: 512 }, (_, i) => ({ ...row, id: `row-${i}`, review: { ...row.review, description: "😀".repeat(512) } })) })).toThrow("CAPACITY_EXCEEDED");
});


test("acknowledged success terminalizes without financial content and identical replay stays terminal", async () => {
  const f = fixture(); await f.service.refresh();
  const command = await f.service.beginConfirmation("capture-1", 0);
  await f.service.recordOutcomes([{ candidateId: "capture-1", ok: true, result: {
    posted: { id: "journal-1", description: "Market", amount: { currency: "COP", minorUnits: 45000 }, replay: false },
    receipt: { id: "receipt-1", workspaceId: "workspace-1", journalEntryId: "journal-1", idempotencyKey: "intake:capture-1",
      suggestion: command.suggestion, changedFields: [], parserVersion: "generic-v1", consentVersion: "v1", actorId: "actor-1", confirmedAt: now }, replay: false,
  } }]);
  expect(f.service.read("capture-1")?.status.kind).toBe("outcome");
  await f.service.applyRecordedOutcomes(); await f.service.applyRecordedOutcomes(); await f.service.refresh();
  expect(f.service.read("capture-1")).toBeNull();
  expect(f.state().records[0]).toEqual({ kind: "terminal", id: "capture-1", digest: await hash(JSON.stringify(capture)),
    recordRevision: 3, expiresAt: 1_794_095_999_900, reason: "confirmed" });
  expect(f.raw()).not.toContain("Market"); expect(f.raw()).not.toContain("journal-1");
});

test("wipe clears native and legacy state and rejects queued producers from the old service", async () => {
  const f = fixture(); await f.service.refresh(); f.setLegacy({ private: true });
  const wiped = f.service.disableAndWipe();
  const late = f.service.configure([{ ...mapping, sourceSelectionId: "late" }], "v1");
  await wiped; await expect(late).rejects.toThrow("Intake admission ended");
  expect(f.raw()).toBeNull(); expect(f.legacy()).toBeNull(); expect(f.events).not.toContain("configure");
});

test("migration readback mismatch never deletes the legacy key", async () => {
  const f = fixture(); f.setValue(null, 0); f.setLegacy({ v: 1, candidates: [legacyRow()] });
  f.afterWrite(() => f.setValue(serializeState(emptyState()), 2));
  await expect(f.service.refresh()).rejects.toThrow("Migration readback differs");
  expect(f.legacy()).not.toBeNull(); expect(f.events).not.toContain("delete-legacy");
});

test("invalid legacy data fails closed instead of starting empty", async () => {
  const f = fixture(); f.setValue(null, 0); f.setLegacy({ v: 1, candidates: [{ id: "broken" }] });
  await expect(f.service.refresh()).rejects.toThrow(); expect(f.raw()).toBeNull(); expect(f.events).toEqual([]);
});

test("missing native support is explicit and never creates a synthetic Candidate", async () => {
  const f = fixture(); vi.spyOn(f.native, "getStatus").mockResolvedValue({ supported: false, reason: "native_module_missing" });
  await expect(f.service.refresh()).rejects.toThrow("UNSUPPORTED");
  expect(f.service.getSnapshot().status).toEqual({ supported: false, reason: "native_module_missing" });
  expect(f.service.candidates()).toEqual([]); expect(f.events).toEqual([]);
});

test("mapping and active-source bounds preserve existing settings on failure", async () => {
  const f = fixture();
  await expect(f.service.configure(Array.from({ length: 17 }, (_, i) => ({ ...mapping, sourceSelectionId: `new-${i}` })), "v1")).rejects.toThrow();
  expect(f.state().mappings).toEqual([mapping]); expect(f.events).not.toContain("configure");
  const state = { ...emptyState(), mappings: Array.from({ length: 64 }, (_, i) => ({ ...mapping, sourceSelectionId: `retired-${i}` })) };
  f.setValue(serializeState(state));
  await expect(f.service.configure([{ ...mapping, sourceSelectionId: "new-65" }], "v1")).rejects.toThrow();
  expect(f.state().mappings).toHaveLength(64); expect(f.events).not.toContain("configure");
});


test("editing a description does not implicitly review unresolved currency", async () => {
  const f = fixture(); f.setPages([{ captures: [{ ...capture, currency: null }], nextCursor: null }]); await f.service.refresh();
  const row = f.service.read("capture-1"); if (!row) throw new Error("missing row");
  await f.service.updateReview(row.id, 0, { ...row.review, description: "Reviewed merchant" });
  await expect(f.service.beginConfirmation(row.id, 1)).rejects.toThrow("Review unresolved currency");
  expect(f.service.read(row.id)?.review.description).toBe("Reviewed merchant");
});

test("a capture with unsupported workspace currency cannot begin confirmation", async () => {
  const f = fixture(); f.setPages([{ captures: [{ ...capture, currency: "USD" }], nextCursor: null }]); await f.service.refresh();
  await expect(f.service.beginConfirmation("capture-1", 0)).rejects.toThrow("Unsupported workspace currency");
  expect(f.service.read("capture-1")?.status.kind).toBe("review");
});


test("lost wipe response cannot resurrect legacy rows after reopen and exact retry", async () => {
  const f = fixture(); f.setLegacy({ v: 1, candidates: [legacyRow()] }); f.loseWipe();
  await expect(f.service.disableAndWipe()).rejects.toThrow("wipe response lost");
  expect(f.raw()).toBeNull(); expect(f.legacy()).not.toBeNull();
  expect(f.wipeIntent()).toEqual({ expectedEpoch: "a".repeat(22), mutationId: "00000000-0000-4000-8000-000000000001" });
  const reopened = new IntakeService(f.deps); await reopened.refresh();
  expect(f.legacy()).toBeNull(); expect(f.wipeIntent()).toBeNull(); expect(f.raw()).toBeNull();
  expect(reopened.candidates()).toEqual([]); expect(f.events.filter((e) => e === "wipe")).toHaveLength(1);
});


test("a committed native wipe never reimports surviving SecureStore rows", async () => {
  const f = fixture(); f.setLegacy({ v: 1, candidates: [legacyRow()] }); f.loseWipe();
  await expect(f.service.disableAndWipe()).rejects.toThrow("wipe response lost");
  const reopened = new IntakeService(f.deps); await reopened.refresh();
  expect(reopened.candidates()).toEqual([]);
  expect(f.raw()).toBeNull(); expect(f.legacy()).toBeNull();
});

test("unfinished wipe blocks configuration and exact pending-control retry recovers", async () => {
  const f = fixture(); f.loseWipe();
  await expect(f.service.disableAndWipe()).rejects.toThrow("wipe response lost");
  await expect(f.service.configure([{ ...mapping, sourceSelectionId: "late" }], "v1")).rejects.toThrow("Intake wipe must finish");
  await f.service.retryPendingControl(); expect(f.wipeIntent()).toBeNull(); expect(f.raw()).toBeNull();
  expect(f.events).not.toContain("configure");
});

test("a corrupt-storage recovery epoch permits explicit wipe without reading the document", async () => {
  const f = fixture(); const status = await f.native.getStatus(); if (!("epoch" in status)) throw new Error("Missing status");
  vi.spyOn(f.native, "getStatus").mockResolvedValue({ ...status, storageState: "key_unavailable", enabled: false });
  const read = vi.spyOn(f.native, "readCandidateState").mockRejectedValue(Object.assign(new Error("corrupt"), { code: "CORRUPT_STATE" }));
  await f.service.disableAndWipe(); expect(read).not.toHaveBeenCalled(); expect(f.events).toContain("wipe"); expect(f.raw()).toBeNull();
});


test("current review account validation happens before freezing a new command", async () => {
  const f = fixture(); await f.service.refresh(); f.deps.validateMapping = async () => false;
  await expect(f.service.beginConfirmation("capture-1", 0)).rejects.toThrow("Candidate account mapping is unavailable");
  expect(f.service.read("capture-1")?.status.kind).toBe("review");
});

test("an unchanged active mapping survives adding another source while edits need new ids", async () => {
  const f = fixture(); const added = { ...mapping, sourceSelectionId: "selection-2", packageName: "app.other" };
  await f.service.configure([mapping, added], "v1");
  expect(f.state().activeSelectionIds).toEqual(["selection-1", "selection-2"]);
  expect(f.state().mappings).toEqual([mapping, added]);
  await expect(f.service.configure([{ ...mapping, financialAccountProfileId: "changed-account" }, added], "v1")).rejects.toThrow("Source selection requires a new id");
});

test("invalid source package fails before saving a frozen native control", async () => {
  const f = fixture(); await expect(f.service.configure([{ ...mapping, sourceSelectionId: "bad", packageName: "not a package" }], "v1")).rejects.toThrow();
  expect(f.state().pendingConfigure).toBeNull(); expect(f.events).not.toContain("configure");
});


test("a pending wipe can recover a subsequently observed corrupt-storage recovery epoch", async () => {
  const f = fixture(); f.loseWipe();
  await expect(f.service.disableAndWipe()).rejects.toThrow("wipe response lost");
  const status = await f.native.getStatus(); if (!("epoch" in status)) throw new Error("Missing status");
  vi.spyOn(f.native, "getStatus").mockResolvedValue({ ...status, epoch: "r".repeat(22), storageState: "corrupt", enabled: false });
  const wipe = vi.spyOn(f.native, "disableAndWipe").mockResolvedValue({ epoch: "s".repeat(22) });
  await f.service.retryPendingControl();
  expect(wipe).toHaveBeenCalledWith({ expectedEpoch: "r".repeat(22), mutationId: "00000000-0000-4000-8000-000000000002" });
  expect(f.wipeIntent()).toBeNull(); expect(f.legacy()).toBeNull();
});


test("a confirmed readback of pre-journal legacy rows proves cleanup without reimport", async () => {
  const f = fixture(); f.setValue(null, 0); const legacy = { v: 1, candidates: [legacyRow()] }; f.setLegacy(legacy);
  await f.service.refresh(); const migrated = f.state();
  f.setValue(serializeState({ ...migrated, legacyMigration: null })); f.setLegacy(legacy);
  const reopened = new IntakeService(f.deps); await reopened.refresh();
  expect(f.legacy()).toBeNull(); expect(reopened.read("legacy-1")?.review.description).toBe("Legacy");
});
