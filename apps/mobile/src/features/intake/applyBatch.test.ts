import { expect, test, vi } from "vitest";
import { applyBatchResults, readyTotalMinorUnits } from "./applyBatch";
import type { CandidateConfirmResult } from "../../../../../src/notificationIntake/types";
import type { IntakeCandidate } from "./candidates";

function posted(candidateId: string): CandidateConfirmResult {
  return {
    candidateId,
    ok: true,
    result: {
      posted: {
        id: `je-${candidateId}`,
        description: "Groceries",
        amount: { currency: "COP", minorUnits: 126400 },
        replay: false,
      },
      receipt: {
        id: `r-${candidateId}`,
        workspaceId: "workspace",
        journalEntryId: `je-${candidateId}`,
        idempotencyKey: `intake:${candidateId}`,
        suggestion: {
          direction: "out",
          description: "Groceries",
          amount: { currency: "COP", minorUnits: 126400 },
          accountingDate: "2026-10-17",
          financialAccountProfileId: "daily",
          userCategoryIds: [],
          primaryUserCategoryId: null,
        },
        changedFields: [],
        parserVersion: "parser@1",
        consentVersion: "consent@1",
        actorId: "owner",
        confirmedAt: 1,
      },
      replay: false,
    },
  };
}

test("a partial batch consumes successes and keeps failures with their error", async () => {
  const consume = vi.fn(async () => {});
  const fail = vi.fn(async () => {});
  const leftover = await applyBatchResults(
    [
      posted("ready"),
      { candidateId: "locked", ok: false, error: "Locked Period" },
      posted("later"),
    ],
    consume,
    fail,
  );
  expect(consume).toHaveBeenCalledTimes(2);
  expect(consume).toHaveBeenNthCalledWith(1, "ready");
  expect(consume).toHaveBeenNthCalledWith(2, "later");
  expect(fail).toHaveBeenCalledExactlyOnceWith("locked", "Locked Period");
  expect(leftover).toEqual([
    { candidateId: "locked", ok: false, error: "Locked Period" },
  ]);
});

test("ready total is the unsigned sum of Ready Candidates", () => {
  const row = {
    id: "c1",
    createdAt: 1,
    expiresAt: 2,
    workspaceId: "workspace",
    currency: "COP",
    suggestion: {
      direction: "out" as const,
      description: "Groceries",
      amountMinorUnits: 126400,
      accountingDate: "2026-10-17",
      financialAccountProfileId: "daily",
      userCategoryIds: [],
      primaryUserCategoryId: null,
    },
    parserVersion: "parser@1",
    consentVersion: "consent@1",
  } satisfies IntakeCandidate;
  expect(readyTotalMinorUnits([row, { ...row, id: "c2" }])).toBe(252800);
});
