import { ConvexError } from "convex/values";
import { expect, test, vi } from "vitest";
import {
  chunkReady,
  confirmReadyBatches,
  handleReadyBatchError,
} from "./confirmReady";
import type { ConfirmCandidateInput } from "../../../../../src/notificationIntake/types";

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
