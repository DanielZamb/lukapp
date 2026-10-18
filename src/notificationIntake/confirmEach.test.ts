import { expect, test } from "vitest";
import { confirmEach, leftoverFailures } from "./confirmEach";
import type { ConfirmCandidateInput, ConfirmCandidateResult, IntakeSuggestion } from "./types";

const suggestion: IntakeSuggestion = {
  direction: "out",
  description: "Coffee",
  amount: { currency: "COP", minorUnits: 14800 },
  accountingDate: "2026-10-17",
  financialAccountProfileId: "daily",
  userCategoryIds: [],
  primaryUserCategoryId: null,
};

function item(candidateId: string): ConfirmCandidateInput {
  return {
    workspaceId: "workspace",
    candidateId,
    confirmed: suggestion,
    suggestion,
    parserVersion: "parser@1",
    consentVersion: "consent@1",
  };
}

function ok(candidateId: string): ConfirmCandidateResult {
  return {
    posted: {
      id: `je-${candidateId}`,
      description: "Coffee",
      amount: suggestion.amount,
      replay: false,
    },
    receipt: {
      id: `r-${candidateId}`,
      workspaceId: "workspace",
      journalEntryId: `je-${candidateId}`,
      idempotencyKey: `intake:${candidateId}`,
      suggestion,
      changedFields: [],
      parserVersion: "parser@1",
      consentVersion: "consent@1",
      actorId: "owner",
      confirmedAt: 1,
    },
    replay: false,
  };
}

test("a partial batch keeps only the failures", async () => {
  const results = await confirmEach(
    [item("ready"), item("locked"), item("later")],
    async (body) => {
      if (body.candidateId === "locked") throw new Error("Locked Period");
      return ok(body.candidateId);
    },
  );
  expect(results.map((row) => [row.candidateId, row.ok])).toEqual([
    ["ready", true],
    ["locked", false],
    ["later", true],
  ]);
  expect(leftoverFailures(results)).toEqual([
    { candidateId: "locked", ok: false, error: "Locked Period" },
  ]);
});
