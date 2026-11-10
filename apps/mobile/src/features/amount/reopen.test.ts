import { createElement, useMemo, useSyncExternalStore } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, test, vi } from "vitest";
vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
import { createTranslator } from "../../../../../src/i18n";
import type { ConfirmCandidateInput, ConfirmCandidateResult } from "../../../../../src/notificationIntake/types";
import { changedFields } from "../../../../../src/notificationIntake/policy";
import { parseLocalEntryDocument, type LocalEntryDraft, type LocalEntryDraftsPort, type OpenDraft } from "../localEntryDrafts";
import type { PendingPosting } from "../posting/pendingPostingSchema";
import { usePostingEditor, type PostingTransport } from "../posting/usePostingEditor";
import { createCandidateBinding } from "../intake/postingBinding";
import { emptyState, ingest, serializeState, type ActiveCandidate } from "../intake/durableState";
import { capture, fixture, mapping, now } from "../intake/service.testSupport";
import { openAmount } from "./session";

let root: ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });

function transport() {
  let key = 0;
  const posted: PendingPosting[] = [];
  const api: PostingTransport = {
    load: async () => ({ kind: "none" }),
    save: async (command, draftId) => ({ id: draftId ?? "saved", command }),
    post: async (command) => { posted.push(command); return { description: "", amount: command.payload.amount }; },
    clear: async () => {}, abort: async () => {}, newKey: () => `key-${++key}`,
  };
  return { api, posted };
}

function port(drafts: LocalEntryDraft[]) {
  const kept: OpenDraft[] = [];
  const value: LocalEntryDraftsPort = {
    keep: async ({ draftId, facts }) => {
      const id = draftId ?? "new";
      const row: OpenDraft = { id, createdAt: 1, expiresAt: 2, status: "open", facts };
      kept.push(row);
      const index = drafts.findIndex((draft) => draft.id === id);
      if (index >= 0) drafts[index] = row; else drafts.push(row);
      return id;
    },
    read: async (id) => drafts.find((draft) => draft.id === id) ?? null,
    discard: async () => "discarded",
  };
  return { value, kept };
}

type Props = { currency: string; drafts?: LocalEntryDraftsPort; draftId?: string; api: PostingTransport };
async function openEditor(initial: Props) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let editor: ReturnType<typeof usePostingEditor> | undefined;
  function Harness(props: Props) {
    editor = usePostingEditor({ workspaceId: "workspace", financialAccountProfileId: "cash", currency: props.currency, timeZone: "America/Bogota" },
      props.api, { drafts: props.drafts, draftId: props.draftId });
    return null;
  }
  await act(async () => { root = create(createElement(Harness, initial)); });
  return {
    editor: () => { if (!editor) throw new Error("Editor not mounted"); return editor; },
    rerender: async (next: Props) => { await act(async () => root!.update(createElement(Harness, next))); },
  };
}

const savedBefore = (currency: string, amountText: string) => parseLocalEntryDocument({
  v: 1,
  drafts: [{ id: "old", createdAt: now, expiresAt: now + 1000, status: "open", facts: {
    workspaceId: "workspace", currency, entryType: "normal", amountText, accountingDate: "2026-11-01",
    description: "Lunch", profileId: "cash", destinationId: null, categories: { ids: [], primaryId: null } } }],
}, now).document.drafts;

test.each([
  ["COP", "-1.234,50", "-1.234,50", null],
  ["USD", "-1.234,50", "-1,234.50", { kind: "converted", previous: "-1.234,50" }],
  ["USD", "-1.234", "-1,234.00", { kind: "converted", previous: "-1.234" }],
])("a %s Draft saved before the update as %s reopens as %s with the same money", async (currency, saved, shown, notice) => {
  const { api, posted } = transport();
  const { value } = port(savedBefore(currency, saved));
  const { editor } = await openEditor({ currency, drafts: value, draftId: "old", api });
  expect(editor().amount.editor.text).toBe(shown);
  expect(editor().amountNotice).toEqual(notice);
  expect(editor().unsaved).toBe(false);
  await act(async () => { await editor().submit(); });
  expect(posted.map((command) => [command.kind, command.payload.amount])).toEqual([
    ["expense", { currency, minorUnits: saved === "-1.234" ? 123400 : 123450 }],
  ]);
});

test("a Draft the old grammar cannot read asks for re-entry, keeps its text when kept untouched, and is never guessed", async () => {
  const { api, posted } = transport();
  const store = port(savedBefore("USD", "-12.34"));
  const { editor } = await openEditor({ currency: "USD", drafts: store.value, draftId: "old", api });
  expect(editor().amount.editor.text).toBe("-");
  expect(editor().amountNotice).toEqual({ kind: "reenter", previous: "-12.34" });
  expect(editor().canSubmit).toBe(false);
  await act(async () => { await editor().submit(); });
  expect(posted).toEqual([]);
  await act(async () => { editor().setDescription("Lunch out"); });
  await act(async () => { await editor().keepDraft(); });
  expect(store.kept.at(-1)?.facts).toMatchObject({ amountText: "-12.34", amountFormat: "pre-currency", description: "Lunch out" });
  await act(async () => { editor().setAmount(openAmount("USD", "-12.34")); });
  await act(async () => { await editor().keepDraft(); });
  expect(store.kept.at(-1)?.facts).toMatchObject({ amountText: "-12.34", amountFormat: "usd/1" });
  expect(editor().amountNotice).toBeNull();
  await act(async () => { await editor().submit(); });
  expect(posted.map((command) => command.payload.amount)).toEqual([{ currency: "USD", minorUnits: 1234 }]);
});

test.each([["COP", "-1.234,5", 123450], ["USD", "-1,234.5", 123450]])("a new %s Draft saves %s with its format and reopens with the same money", async (currency, typed, minorUnits) => {
  const { api } = transport();
  const store = port([]);
  const first = await openEditor({ currency, drafts: store.value, api });
  await act(async () => { first.editor().setAmount(openAmount(currency, typed)); first.editor().setDescription("Lunch"); });
  await act(async () => { await first.editor().keepDraft(); });
  expect(store.kept[0]?.facts).toMatchObject({ amountText: typed, amountFormat: currency === "COP" ? "cop/1" : "usd/1" });
  await act(async () => root?.unmount()); root = undefined;
  const { api: second, posted } = transport();
  const reopened = await openEditor({ currency, drafts: store.value, draftId: "new", api: second });
  expect(reopened.editor().amount.editor.text).toBe(typed);
  await act(async () => { await reopened.editor().submit(); });
  expect(posted.map((command) => command.payload.amount)).toEqual([{ currency, minorUnits }]);
});

test.each([["COP", "-1.234,50"], ["USD", "-1,234.50"]])("a %s batch row reopens from its stored command as %s and keeps its minor units", async (currency, shown) => {
  const { api } = transport();
  const { editor } = await openEditor({ currency, api });
  const command: PendingPosting = { kind: "expense", payload: { workspaceId: "workspace", financialAccountProfileId: "cash",
    amount: { currency, minorUnits: 123450 }, accountingDate: "2026-11-01", description: "Row", idempotencyKey: "row-key" } };
  await act(async () => { editor().editBatchDraft({ command, draftId: "row" }); });
  expect(editor().amount.editor.text).toBe(shown);
  expect(editor().captureForBatch()?.command.payload.amount).toEqual({ currency, minorUnits: 123450 });
});

test("a workspace currency change while an amount is typed starts a blank session in the new currency", async () => {
  const { api } = transport();
  const editor = await openEditor({ currency: "COP", api });
  await act(async () => { editor.editor().setAmount(openAmount("COP", "-1.234,5")); });
  await editor.rerender({ currency: "USD", api });
  expect(editor.editor().amount.currency).toBe("USD");
  expect(editor.editor().amount.editor.text).toBe("-");
  expect(editor.editor().amount.editor.format.convention.decimal).toBe(".");
  await act(async () => { editor.editor().setAmount(openAmount("COP", "-1.234,5")); });
  expect(editor.editor().amount.editor.text).toBe("-");
});

function confirmed(command: ConfirmCandidateInput): ConfirmCandidateResult {
  return { posted: { id: "journal", description: command.confirmed.description, amount: command.confirmed.amount, replay: false },
    receipt: { id: "receipt", workspaceId: command.workspaceId, journalEntryId: "journal", idempotencyKey: `intake:${command.candidateId}`,
      suggestion: command.suggestion, changedFields: changedFields(command.suggestion, command.confirmed), parserVersion: command.parserVersion,
      consentVersion: command.consentVersion, actorId: "actor", confirmedAt: now }, replay: false };
}

async function candidateSavedBefore(currency: "COP" | "USD", reviewText: string, reviewMinorUnits: number) {
  const f = fixture();
  const state = ingest(emptyState(), { ...capture, currency, description: "Market" }, { ...mapping, currency }, "a".repeat(64), mapping.timeZone);
  const row = state.records[0] as ActiveCandidate;
  const { reviewAmountFormat: _format, ...versionThree } = { ...row, reviewAmountText: reviewText,
    review: { ...row.review, amountMinorUnits: reviewMinorUnits, direction: "out" as const } };
  f.setValue(JSON.stringify({ ...state, v: 3, mappings: [{ ...mapping, currency }], activeSelectionIds: [mapping.sourceSelectionId], records: [versionThree] }));
  f.setPages([{ captures: [], nextCursor: null }]);
  await f.service.refresh();
  return f;
}

async function openCandidate(service: ReturnType<typeof fixture>["service"], currency: string, dispatch: (command: ConfirmCandidateInput) => Promise<ConfirmCandidateResult>) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let editor: ReturnType<typeof usePostingEditor> | undefined;
  const { api } = transport();
  function Harness() {
    useSyncExternalStore(service.subscribe, service.getSnapshot);
    const intake = useMemo(() => createCandidateBinding({ service, candidateId: capture.captureId, workspaceId: mapping.workspaceId,
      dispatch, translator: createTranslator("en") }), []);
    editor = usePostingEditor({ workspaceId: mapping.workspaceId, financialAccountProfileId: mapping.financialAccountProfileId, currency,
      timeZone: "America/Bogota" }, api, { intake, intakeRoute: true });
    return null;
  }
  await act(async () => { root = create(createElement(Harness)); });
  return () => { if (!editor) throw new Error("No editor"); return editor; };
}

test.each([["COP", "-1.234,50"], ["USD", "-1,234.50"]] as const)("a %s Candidate edit saved before the update reopens as %s and confirms the same money", async (currency, shown) => {
  const f = await candidateSavedBefore(currency, "-1.234,50", 123450);
  const dispatch = vi.fn(async (command: ConfirmCandidateInput) => confirmed(command));
  const editor = await openCandidate(f.service, currency, dispatch);
  expect(editor().amount.editor.text).toBe(shown);
  await act(async () => { editor().setDescription("Market"); });
  await act(async () => { await editor().submit(); });
  expect(dispatch.mock.calls.map(([command]) => command.confirmed.amount)).toEqual([{ currency, minorUnits: 123450 }]);
});

test("a Candidate edit whose saved text and saved amount disagree asks for re-entry and confirms nothing", async () => {
  const f = await candidateSavedBefore("USD", "-1.234,50", 999);
  const dispatch = vi.fn(async (command: ConfirmCandidateInput) => confirmed(command));
  const editor = await openCandidate(f.service, "USD", dispatch);
  expect(editor().amount.editor.text).toBe("-");
  expect(editor().amountNotice).toEqual({ kind: "reenter", previous: "-1.234,50" });
  expect(editor().canSubmit).toBe(false);
  await act(async () => { await editor().submit(); });
  expect(dispatch).not.toHaveBeenCalled();
  expect(serializeState(f.state())).toContain("\"reviewAmountReenter\":true");
});
