import { expect, test, vi } from "vitest";
import { createTranslator } from "../../../../../src/i18n";
vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
import type { NativeCapture } from "../../../modules/notification-intake";
import { changedFields } from "../../../../../src/notificationIntake/policy";
import type { ConfirmCandidateInput, ConfirmCandidateResult } from "../../../../../src/notificationIntake/types";
import { createCandidateBinding } from "./postingBinding";
import { confirmReadyCandidates } from "./confirmReady";
import { viewInbox } from "./candidates";
import { factsFromCandidate } from "./facts";
import { evidenceFor, parseState, projectCandidate, serializeState } from "./durableState";
import { IntakeService } from "./service";
import { capture, fixture, mapping, now } from "./service.testSupport";

const partials: NativeCapture[] = [
  { ...capture, direction: "in", amountMinorUnits: null, currency: null, description: "", parserVersion: "generic-v2" },
  { ...capture, direction: null, amountMinorUnits: 45000, currency: "COP", description: "Market", parserVersion: "generic-v2" },
  { ...capture, direction: "out", amountMinorUnits: null, currency: null, description: "Market", parserVersion: "generic-v2" },
];
function rowOf(service: IntakeService) {
  const row = service.read(capture.captureId);
  if (!row) throw new Error("Missing Candidate");
  return row;
}
function resultFor(command: ConfirmCandidateInput): ConfirmCandidateResult {
  return { posted: { id: "journal", description: command.confirmed.description, amount: command.confirmed.amount, replay: false },
    receipt: { id: "receipt", workspaceId: command.workspaceId, journalEntryId: "journal", idempotencyKey: `intake:${command.candidateId}`,
      suggestion: command.suggestion, changedFields: changedFields(command.suggestion, command.confirmed),
      parserVersion: command.parserVersion, consentVersion: command.consentVersion, actorId: "owner", confirmedAt: now }, replay: false };
}

test.each(partials)("partial facts %j persist once before ack and remain Needs review across replay and reopen", async (partial) => {
  const f = fixture(); f.setPages([{ captures: [partial], nextCursor: null }]); f.failAck();
  await expect(f.service.refresh()).rejects.toThrow("ack lost");
  const original = rowOf(f.service);
  expect(original.origin).toEqual({ kind: "native", capture: partial, mapping, accountingDate: "2026-10-23" });
  expect(f.events.indexOf("write")).toBeLessThan(f.events.indexOf("ack"));
  const edited = { ...original.review, description: "Reviewed market", userCategoryIds: ["food"] };
  await f.service.updateReview(original.id, 0, edited);
  const reopened = new IntakeService(f.deps);
  await expect(reopened.refresh()).rejects.toThrow("ack lost");
  expect(f.state().records).toHaveLength(1);
  const saved = f.state().records[0];
  expect(saved).toMatchObject({ review: edited, originalSuggestion: original.originalSuggestion, expiresAt: capture.expiresAt });
  await f.service.refresh().catch(() => {});
  const view = viewInbox({ v: 1, candidates: f.service.candidates() }, mapping.workspaceId, now, "COP");
  expect(view.ready).toEqual([]); expect(view.now.map((row) => row.id)).toEqual([capture.captureId]);
  const dispatch = vi.fn();
  await expect(confirmReadyCandidates(f.service, f.service.candidates(), dispatch)).rejects.toThrow();
  expect(dispatch).not.toHaveBeenCalled();
  expect(f.state().records[0]).toMatchObject({ status: { kind: "review" } });
});

test("the Candidate binding starts with an empty amount, persists edits and freezes complete facts with honest evidence", async () => {
  const f = fixture(); const partial = partials[0];
  f.setPages([{ captures: [partial], nextCursor: null }]); await f.service.refresh();
  const dispatch = vi.fn(async (command: ConfirmCandidateInput) => resultFor(command));
  const binding = createCandidateBinding({ service: f.service, candidateId: capture.captureId, workspaceId: mapping.workspaceId, dispatch, translator: createTranslator("en") });
  expect(binding.facts.amountText).toBe("");
  expect(binding.originalSuggestion).toMatchObject({ direction: "in", amount: { currency: null, minorUnits: null } });
  await binding.persistReview({ ...binding.facts, amountText: "-12,30", description: "Reviewed market" });
  const saved = rowOf(f.service);
  expect(saved.review).toMatchObject({ direction: "out", amountMinorUnits: 1230 });
  expect(factsFromCandidate(projectCandidate(saved)).amountText).toBe("-12,30");
  expect(evidenceFor(saved)).toEqual(binding.originalSuggestion);
  await expect(f.service.beginConfirmation(saved.id, saved.recordRevision)).rejects.toThrow("Review unresolved currency");
  const confirmed = { ...binding.originalSuggestion, direction: "out" as const, description: "Reviewed market", amount: { currency: "COP" as const, minorUnits: 1230 } };
  await binding.confirm(confirmed);
  expect(dispatch).toHaveBeenCalledOnce();
  expect(dispatch.mock.calls[0]?.[0]).toMatchObject({ confirmed, suggestion: binding.originalSuggestion });
  await f.service.refresh(); expect(f.service.candidates()).toEqual([]);
  expect(f.state().records[0]).toMatchObject({ kind: "terminal", reason: "confirmed", expiresAt: capture.expiresAt });
  expect(f.raw()).not.toContain("Reviewed market");
});

test("partial confirmation retries use the exact frozen command and reject dishonest receipt evidence", async () => {
  const f = fixture(); f.setPages([{ captures: [partials[2]], nextCursor: null }]); await f.service.refresh();
  const original = rowOf(f.service);
  await f.service.updateReview(original.id, 0, { ...original.review, amountMinorUnits: 300, direction: "out" }, { currencyReviewed: true });
  const command = await f.service.beginConfirmation(original.id, 1);
  const reopened = new IntakeService(f.deps); await reopened.refresh();
  expect(await reopened.beginConfirmation(original.id, 0)).toEqual(command);
  const dishonest = resultFor(command); dishonest.receipt.suggestion = command.confirmed;
  await expect(reopened.recordOutcomes([{ candidateId: original.id, ok: true, result: dishonest }])).rejects.toThrow("OUTCOME_MISMATCH");
  expect(rowOf(reopened).status.kind).toBe("submitting");
  await reopened.recordOutcomes([{ candidateId: original.id, ok: true, result: resultFor(command) }]);
  await reopened.applyRecordedOutcomes(); await reopened.refresh();
  expect(reopened.candidates()).toEqual([]);
});

test("deleted partial captures do not resurrect through document migration or replay", async () => {
  const f = fixture(); f.setPages([{ captures: [partials[0]], nextCursor: null }]); await f.service.refresh();
  await f.service.deleteCandidate(capture.captureId, 0);
  const state = f.state();
  f.setValue(JSON.stringify({ ...state, v: 2 }));
  const reopened = new IntakeService(f.deps); await reopened.refresh();
  expect(f.state().v).toBe(3); expect(reopened.candidates()).toEqual([]);
  expect(f.state().records[0]).toMatchObject({ kind: "terminal", reason: "deleted" });
  f.setPages([{ captures: [{ ...partials[0], amountMinorUnits: 99 }], nextCursor: null }]);
  const acks = f.events.filter((event) => event === "ack").length;
  expect(await reopened.refresh()).toMatchObject({ conflicts: 1, saved: 0 });
  expect(f.events.filter((event) => event === "ack")).toHaveLength(acks);
  await reopened.disableAndWipe();
  await expect(reopened.refresh()).rejects.toThrow("Intake admission ended");
  const afterWipe = new IntakeService(f.deps); await afterWipe.refresh(); expect(afterWipe.candidates()).toEqual([]);
});

test("v2 active reviews and frozen commands migrate without replacing original evidence or saved edits", async () => {
  const f = fixture(); await f.service.refresh(); const original = rowOf(f.service);
  await f.service.updateReview(original.id, 0, { ...original.review, description: "Saved before upgrade" });
  const command = await f.service.beginConfirmation(original.id, 1);
  const current = f.state();
  const old = { ...current, v: 2, records: current.records.map((record) => {
    if (record.kind !== "active") return record;
    const { currency, ...suggestion } = record.originalSuggestion;
    return { ...record, originalSuggestion: suggestion };
  }) };
  f.setValue(JSON.stringify(old));
  const reopened = new IntakeService(f.deps); await reopened.refresh();
  expect(await reopened.beginConfirmation(original.id, 0)).toEqual(command);
  expect(rowOf(reopened).review.description).toBe("Saved before upgrade");
  expect(serializeState(parseState(JSON.stringify(old)))).toBe(f.raw());
  const persisted = f.raw(); await reopened.refresh(); expect(f.raw()).toBe(persisted);
});

test("incompatible Android API keeps cleanup pending until a matching binary is available", async () => {
  const f = fixture(); f.setLegacy({ retained: true });
  const status = vi.spyOn(f.native, "getStatus").mockResolvedValue({ supported: false, reason: "native_api_incompatible" });
  await expect(f.service.disableAndWipe()).rejects.toMatchObject({ code: "NATIVE_WIPE_REQUIRED" });
  expect(f.wipeIntent()).toEqual({ kind: "native_required" }); expect(f.legacy()).toEqual({ retained: true });
  status.mockRestore(); await new IntakeService(f.deps).refresh();
  expect(f.legacy()).toBeNull(); expect(f.wipeIntent()).toBeNull(); expect(f.state().records).toEqual([]);
});

test("upgrading retains a formerly frozen incomplete v2 command while new incomplete reviews cannot freeze", async () => {
  const f = fixture(); await f.service.refresh(); const original = rowOf(f.service);
  const command = await f.service.beginConfirmation(original.id, 0);
  const current = f.state();
  const old = { ...current, v: 2, records: current.records.map((record) => {
    if (record.kind !== "active") return record;
    const { currency, ...suggestion } = record.originalSuggestion;
    return { ...record, originalSuggestion: suggestion,
      status: { kind: "submitting", startedAt: now, command: { ...command, confirmed: { ...command.confirmed, description: "" } } } };
  }) };
  f.setValue(JSON.stringify(old));
  const reopened = new IntakeService(f.deps); await reopened.refresh();
  expect((await reopened.beginConfirmation(original.id, 0)).confirmed.description).toBe("");
  expect(rowOf(reopened).status.kind).toBe("submitting");
  const fresh = fixture(); fresh.setPages([{ captures: [{ ...capture, description: "" }], nextCursor: null }]); await fresh.service.refresh();
  await expect(fresh.service.beginConfirmation(capture.captureId, 0)).rejects.toThrow();
  expect(rowOf(fresh.service).status.kind).toBe("review");
});

test("a late raw-diagnostic read cannot return after lock or owner admission ends", async () => {
  const f = fixture(); await f.service.refresh();
  vi.spyOn(f.native, "listDiagnostics").mockImplementation(async () => {
    f.service.stop();
    return { health: { enabled: true, state: "healthy", recordCount: 0, byteCount: 0, overflowCount: 0, errorCount: 0 }, records: [] };
  });
  await expect(f.service.listDiagnostics()).rejects.toThrow("Intake admission ended");
  const read = vi.spyOn(f.native, "readDiagnostic");
  await expect(f.service.readDiagnostic("arrival")).rejects.toThrow("Intake admission ended"); expect(read).not.toHaveBeenCalled();
});

test("the review note is one sentence per language around the stored source, amount and currency", async () => {
  const { formatDateTime } = await import("../../../../../src/i18n/format");
  const noteFor = async (partial: NativeCapture, language: "en" | "es") => {
    const f = fixture(); f.setPages([{ captures: [partial], nextCursor: null }]); await f.service.refresh();
    return createCandidateBinding({ service: f.service, candidateId: capture.captureId, workspaceId: mapping.workspaceId,
      dispatch: vi.fn(), translator: createTranslator(language) }).reviewNote;
  };
  const complete = { ...capture, amountMinorUnits: 4512345, currency: "COP" as const, direction: "out" as const };
  expect(await noteFor(complete, "en")).toBe(`Source ${mapping.packageName}. Captured ${formatDateTime("en", capture.capturedAt)}. `
    + "Original amount 45123.45 COP. Original direction out. Review currency COP.");
  expect(await noteFor(complete, "es")).toBe(`Fuente ${mapping.packageName}. Leída el ${formatDateTime("es", capture.capturedAt)}. `
    + "Monto original 45123,45 COP. Según la notificación, la plata sale. Moneda a revisar: COP.");
  expect(await noteFor(partials[0]!, "es")).toContain("No pudimos leer el monto. Según la notificación, la plata entra.");
  expect(await noteFor(partials[1]!, "es")).toContain("No se sabe si la plata entra o sale. Escribe el monto con signo.");
});
