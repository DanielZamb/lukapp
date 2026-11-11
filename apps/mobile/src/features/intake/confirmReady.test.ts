import { ConvexError } from "convex/values";
import { expect, test, vi } from "vitest";
vi.mock("expo", () => ({ requireOptionalNativeModule: () => null }));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
import {
  chunkReady,
  confirmReadyBatches,
  confirmReadyCandidates,
  handleReadyBatchError,
} from "./confirmReady";
import { viewInbox } from "./candidates";
import { capture, fixture, mapping, now } from "./service.testSupport";
import { accountingErrorMessages } from "../../../../../src/accounting/errors";
import { changedFields } from "../../../../../src/notificationIntake/policy";
import type { ConfirmCandidateInput, ConfirmCandidateResult } from "../../../../../src/notificationIntake/types";

function item(candidateId: string): ConfirmCandidateInput {
  return {
    workspaceId: "workspace",
    candidateId,
    confirmed: {
      direction: "out",
      description: "Coffee",
      amount: { currency: "COP", minorUnits: 14800 },
      accountingDate: "2026-10-17",
      financialAccountProfileId: "daily",
      userCategoryIds: [],
      primaryUserCategoryId: null,
    },
    suggestion: {
      direction: "out",
      description: "Coffee",
      amount: { currency: "COP", minorUnits: 14800 },
      accountingDate: "2026-10-17",
      financialAccountProfileId: "daily",
      userCategoryIds: [],
      primaryUserCategoryId: null,
    },
    parserVersion: "parser@1",
    consentVersion: "consent@1",
  };
}

test("Confirm all Ready sends chunks of 50 and applies each chunk", async () => {
  const items = Array.from({ length: 51 }, (_, index) => item(`c${index}`));
  expect(chunkReady(items).map((chunk) => chunk.length)).toEqual([50, 1]);
  const confirm = vi.fn(async (chunk: ConfirmCandidateInput[]) => ({
    results: chunk.map((row) => ({
      candidateId: row.candidateId,
      ok: true as const,
      result: {
        posted: {
          id: `je-${row.candidateId}`,
          description: "Coffee",
          amount: { currency: "COP", minorUnits: 14800 },
          replay: false,
        },
        receipt: {
          id: `r-${row.candidateId}`,
          workspaceId: "workspace",
          journalEntryId: `je-${row.candidateId}`,
          idempotencyKey: `intake:${row.candidateId}`,
          suggestion: row.suggestion,
          changedFields: [],
          parserVersion: "parser@1",
          consentVersion: "consent@1",
          actorId: "owner",
          confirmedAt: 1,
        },
        replay: false,
      },
    })),
  }));
  const apply = vi.fn(async () => {});
  await confirmReadyBatches(items, confirm, apply);
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(confirm.mock.calls[0]?.[0]).toHaveLength(50);
  expect(confirm.mock.calls[1]?.[0]).toHaveLength(1);
  expect(apply).toHaveBeenCalledTimes(2);
});

test("a wipe-bearing batch error is reported and not swallowed", async () => {
  const report = vi.fn(() => true);
  const refresh = vi.fn(async () => {});
  const error = new ConvexError({
    code: "device_revoked",
    wipeLocalInput: true,
  });
  expect(handleReadyBatchError(error, report, refresh)).toBe("wiped");
  expect(report).toHaveBeenCalledWith(error);
  expect(refresh).not.toHaveBeenCalled();
});

function postedFor(command: ConfirmCandidateInput): ConfirmCandidateResult {
  return { posted: { id: "journal", description: command.confirmed.description, amount: command.confirmed.amount, replay: true },
    receipt: { id: "receipt", workspaceId: command.workspaceId, journalEntryId: "journal", idempotencyKey: `intake:${command.candidateId}`,
      suggestion: command.suggestion, changedFields: changedFields(command.suggestion, command.confirmed),
      parserVersion: command.parserVersion, consentVersion: command.consentVersion, actorId: "owner", confirmedAt: now }, replay: true };
}

async function lostThenAnswered(error: string) {
  const f = fixture();
  await f.service.refresh();
  const ready = () => viewInbox({ v: 1, candidates: f.service.candidates() }, mapping.workspaceId, now, "COP").ready;
  const confirm = vi.fn(async (items: ConfirmCandidateInput[]) => ({
    results: items.map((command) => ({ candidateId: command.candidateId, ok: true as const, result: postedFor(command) })),
  }));
  confirm.mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ results: [{ candidateId: capture.captureId, ok: false, error }] });
  await expect(confirmReadyCandidates(f.service, ready(), confirm)).rejects.toThrow("offline");
  await confirmReadyCandidates(f.service, ready(), confirm);
  return { f, ready, confirm };
}

test.each(["session_verification_required", "device_registration_required", "permission_denied"])(
  "after a lost Confirm all reply, a retry turned away per item with %s keeps the Candidate frozen and sends it again unchanged",
  async (error) => {
    const { f, ready, confirm } = await lostThenAnswered(error);
    expect(f.service.read(capture.captureId)?.status.kind).toBe("submitting");
    expect(await confirmReadyCandidates(f.service, ready(), confirm)).toBe(1);
    const first = confirm.mock.calls[0]![0];
    expect(first).toEqual([expect.objectContaining({
      candidateId: "capture-1", confirmed: expect.objectContaining({ description: "Market", amount: { currency: "COP", minorUnits: 45000 } }),
    })]);
    expect(confirm.mock.calls.map(([items]) => items)).toEqual([first, first, first]);
  },
);

test("after a lost Confirm all reply, a retry refused per item by accounting reopens the Candidate for review", async () => {
  const { f } = await lostThenAnswered(accountingErrorMessages.locked_period);
  expect(f.service.read(capture.captureId)?.status).toMatchObject({ kind: "review", error: "Locked Period" });
});
