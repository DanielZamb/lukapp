import { createElement, useMemo, useSyncExternalStore } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ConvexError } from "convex/values";
import { afterEach, expect, test, vi } from "vitest";
import { createTranslator } from "../../../../../src/i18n";
vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
import { usePostingEditor, type PostingTransport } from "./usePostingEditor";
import type { ConfirmCandidateInput, ConfirmCandidateResult } from "../../../../../src/notificationIntake/types";
import { changedFields } from "../../../../../src/notificationIntake/policy";
import { createCandidateBinding } from "../intake/postingBinding";
import { fixture, now } from "../intake/service.testSupport";
import { IntakeService } from "../intake/service";
import { confirmReadyCandidates } from "../intake/confirmReady";

let root: ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });
function result(command: ConfirmCandidateInput): ConfirmCandidateResult {
  return { posted: { id: `journal-${command.candidateId}`, description: command.confirmed.description, amount: command.confirmed.amount, replay: false },
    receipt: { id: `receipt-${command.candidateId}`, workspaceId: command.workspaceId, journalEntryId: `journal-${command.candidateId}`, idempotencyKey: `intake:${command.candidateId}`,
      suggestion: command.suggestion, changedFields: changedFields(command.suggestion, command.confirmed), parserVersion: command.parserVersion, consentVersion: command.consentVersion,
      actorId: "actor-1", confirmedAt: now }, replay: false };
}
const transport: PostingTransport = {
  load: async () => ({ kind: "none" }), save: async () => { throw new Error("Manual storage must not run"); },
  post: async () => { throw new Error("Manual posting must not run"); }, clear: async () => {}, abort: async () => {}, newKey: () => "unused",
};
async function open(service: IntakeService, dispatch: (command: ConfirmCandidateInput) => Promise<ConfirmCandidateResult>, reportFailure?: (error: unknown) => boolean) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let value: ReturnType<typeof usePostingEditor> | undefined;
  function Harness() {
    useSyncExternalStore(service.subscribe, service.getSnapshot);
    const intake = useMemo(() => createCandidateBinding({ service, candidateId: "capture-1", workspaceId: "workspace-1", dispatch, translator: createTranslator("en") }), [service]);
    value = usePostingEditor({ workspaceId: "workspace-1", financialAccountProfileId: "account-1", currency: "COP", timeZone: "America/Bogota" },
      { ...transport, reportFailure }, { intake, intakeRoute: true });
    return null;
  }
  await act(async () => { root = create(createElement(Harness)); });
  return () => { if (!value) throw new Error("No editor"); return value; };
}

test("editor persists review before leaving and reopens edited facts while receipt evidence stays original", async () => {
  const f = fixture(); await f.service.refresh();
  const dispatch = vi.fn(async (command: ConfirmCandidateInput) => result(command));
  const editor = await open(f.service, dispatch);
  await act(async () => { editor().setDescription("Reviewed market"); editor().setAmount("-500,00"); });
  await act(async () => { await editor().saveCandidateReview(); });
  expect(f.service.read("capture-1")?.review.description).toBe("Reviewed market");
  await act(async () => root?.unmount()); root = undefined;
  const reopenedService = new IntakeService(f.deps); await reopenedService.refresh();
  const reopened = await open(reopenedService, dispatch);
  expect(reopened().description).toBe("Reviewed market"); expect(reopened().amount).toBe("-500,00");
  await act(async () => { await reopened().submit(); });
  const command = dispatch.mock.calls[0]?.[0];
  expect(command?.confirmed.description).toBe("Reviewed market"); expect(command?.confirmed.amount.minorUnits).toBe(50000);
  expect(command?.suggestion.description).toBe("Market"); expect(command?.suggestion.amount.minorUnits).toBe(45000);
  expect(reopened().posted).toEqual({ description: "Reviewed market", amount: { currency: "COP", minorUnits: -50000 } });
  expect(reopenedService.read("capture-1")).toBeNull();
});

test("incomplete amount text survives navigation and cannot become Ready or submit", async () => {
  const f = fixture(); await f.service.refresh(); const dispatch = vi.fn(async (command: ConfirmCandidateInput) => result(command));
  const editor = await open(f.service, dispatch);
  await act(async () => { editor().setAmount("-"); });
  await act(async () => { await editor().saveCandidateReview(); });
  expect(f.service.read("capture-1")?.review.amountMinorUnits).toBeNull();
  await act(async () => root?.unmount()); root = undefined;
  const reopened = await open(f.service, dispatch); expect(reopened().amount).toBe("-"); expect(reopened().canSubmit).toBe(false);
  await act(async () => { await reopened().submit(); }); expect(dispatch).not.toHaveBeenCalled();
});

test("timeout and reopen keep the exact saved command; editing a frozen command is refused", async () => {
  const f = fixture(); await f.service.refresh();
  const timeout = vi.fn(async (_command: ConfirmCandidateInput): Promise<ConfirmCandidateResult> => { throw new Error("timeout"); });
  const editor = await open(f.service, timeout);
  await act(async () => { await editor().submit(); });
  expect(editor().editable).toBe(false); expect(editor().pending).toBe(true);
  await act(async () => { editor().setDescription("Cannot change"); }); expect(editor().description).toBe("Market");
  const frozen = timeout.mock.calls[0]?.[0]; expect(frozen?.candidateId).toBe("capture-1");
  await act(async () => root?.unmount()); root = undefined;
  const reopenedService = new IntakeService(f.deps); await reopenedService.refresh();
  const retry = vi.fn(async (command: ConfirmCandidateInput) => result(command));
  const reopened = await open(reopenedService, retry); expect(reopened().editable).toBe(false);
  await act(async () => { await reopened().submit(); });
  expect(retry.mock.calls[0]?.[0]).toEqual(frozen); expect(reopened().posted?.amount.minorUnits).toBe(-45000);
});

test("structured conflict returns to review and never fabricates Posted or a new capture key", async () => {
  const f = fixture(); await f.service.refresh();
  const dispatch = vi.fn(async (_command: ConfirmCandidateInput): Promise<ConfirmCandidateResult> => {
    throw new ConvexError({ kind: "intake", code: "idempotency_key_conflict", message: "idempotency_key_conflict" });
  });
  const editor = await open(f.service, dispatch);
  await act(async () => { await editor().submit(); });
  expect(editor().posted).toBeNull(); expect(editor().editable).toBe(true);
  expect(f.service.read("capture-1")?.status).toEqual({ kind: "review", currencyReviewed: true, error: "idempotency_key_conflict" });
  await act(async () => { await editor().submit(); });
  expect(dispatch.mock.calls.map(([command]) => command.candidateId)).toEqual(["capture-1", "capture-1"]);
});

test("wipe-bearing failure leaves per-item handling and reaches the app cleanup reporter", async () => {
  const f = fixture(); await f.service.refresh();
  const failure = new ConvexError({ code: "device_revoked", wipeLocalInput: true });
  const report = vi.fn(() => true);
  const editor = await open(f.service, async () => { throw failure; }, report);
  await act(async () => { await editor().submit(); });
  expect(report).toHaveBeenCalledWith(failure); expect(f.service.read("capture-1")?.status.kind).toBe("submitting");
  expect(editor().posted).toBeNull();
});

test("a Ready batch local outcome failure keeps every exact command for retry", async () => {
  const f = fixture();
  const { capture } = await import("../intake/service.testSupport");
  f.setPages([{ captures: [capture, { ...capture, captureId: "capture-2" }], nextCursor: null }]); await f.service.refresh();
  const candidates = f.service.candidates();
  const confirm = vi.fn(async (items: ConfirmCandidateInput[]) => {
    f.failWrite(); return { results: items.map((command) => ({ candidateId: command.candidateId, ok: true, result: result(command) } satisfies import("../../../../../src/notificationIntake/types").CandidateConfirmResult)) };
  });
  await expect(confirmReadyCandidates(f.service, candidates, confirm)).rejects.toThrow("disk full");
  expect(f.state().records.map((r) => r.kind === "active" ? r.status.kind : r.kind)).toEqual(["submitting", "submitting"]);
  f.allowWrite();
  const commands = confirm.mock.calls[0]?.[0]; if (!commands) throw new Error("No commands");
  await f.service.recordOutcomes(commands.map((command) => ({ candidateId: command.candidateId, ok: true, result: result(command) })));
  await f.service.applyRecordedOutcomes();
  expect(f.service.candidates()).toEqual([]); expect(f.state().records.map((r) => r.kind)).toEqual(["terminal", "terminal"]);
});


test("recording the same success with server replay flags is idempotent", async () => {
  const f = fixture(); await f.service.refresh(); const command = await f.service.beginConfirmation("capture-1", 0);
  const original = result(command); await f.service.recordOutcomes([{ candidateId: "capture-1", ok: true, result: original }]);
  await f.service.recordOutcomes([{ candidateId: "capture-1", ok: true, result: { ...original, replay: true, posted: { ...original.posted, replay: true } } }]);
  await f.service.applyRecordedOutcomes(); expect(f.service.read("capture-1")).toBeNull();
  expect(f.state().records.map((r) => r.kind)).toEqual(["terminal"]);
});

test("a receipt for a different Candidate cannot consume this frozen command", async () => {
  const f = fixture(); await f.service.refresh(); const command = await f.service.beginConfirmation("capture-1", 0);
  const other = result({ ...command, candidateId: "wrong-candidate" });
  await expect(f.service.recordOutcomes([{ candidateId: "capture-1", ok: true, result: other }])).rejects.toThrow("OUTCOME_MISMATCH");
  expect(f.service.read("capture-1")?.status.kind).toBe("submitting");
});

test("SEN90-R1-02 saving and reopening review converges after a committed write response is lost", async () => {
  const f = fixture(); await f.service.refresh();
  const editor = await open(f.service, async (command) => result(command));
  f.afterWrite(() => { f.afterWrite(() => {}); throw new Error("write response lost"); });
  await act(async () => { editor().setDescription("Saved despite lost response"); });
  await act(async () => { await editor().saveCandidateReview(); });
  expect(f.service.read("capture-1")?.recordRevision).toBe(1);
  expect(f.service.read("capture-1")?.review.description).toBe("Saved despite lost response");
  await act(async () => root?.unmount()); root = undefined;
  const reopenedService = new IntakeService(f.deps); await reopenedService.refresh();
  const reopened = await open(reopenedService, async (command) => result(command));
  expect(reopened().description).toBe("Saved despite lost response");
  await act(async () => { await reopened().saveCandidateReview(); });
  expect(reopenedService.read("capture-1")?.recordRevision).toBe(1);
});
