/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  convexAccounting,
  createDaily,
  createOwnedWorkspace,
  lock,
} from "../src/accounting/convexHarness";

const modules = import.meta.glob([
  "./**/*.{js,ts}",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

function testdb() {
  return convexAccounting(modules);
}

function item(
  workspaceId: string,
  profileId: string,
  candidateId: string,
  extra?: { accountingDate?: string; description?: string },
) {
  const suggestion = {
    direction: "out" as const,
    description: extra?.description ?? "Groceries",
    amount: { currency: "COP" as const, minorUnits: 126400 },
    accountingDate: extra?.accountingDate ?? "2026-09-24",
    financialAccountProfileId: profileId,
    userCategoryIds: [] as string[],
    primaryUserCategoryId: null,
  };
  return {
    workspaceId,
    candidateId,
    confirmed: suggestion,
    suggestion,
    parserVersion: "parser@1",
    consentVersion: "consent@1",
  };
}

test("confirming a Candidate posts the ordinary expense and one Receipt", async () => {
  const t = await testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  const first = await t.action(
    api.notificationIntake.confirmOne,
    item(workspace.id, daily.id, "candidate-groceries"),
  );
  const second = await t.action(
    api.notificationIntake.confirmOne,
    item(workspace.id, daily.id, "candidate-groceries"),
  );
  const entries = await t.query(api.accounting.listJournalEntries, {
    workspaceId: workspace.id,
  });
  expect(first.replay).toBe(false);
  expect(second.replay).toBe(true);
  expect(second.receipt.id).toBe(first.receipt.id);
  expect(first.receipt.idempotencyKey).toBe("intake:candidate-groceries");
  expect(entries).toHaveLength(1);
  expect(entries[0]?.id).toBe(first.posted.id);
});

test("a partial batch keeps only the failed Candidate", async () => {
  const t = await testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  await lock(t, workspace.id, { year: 2026, month: 9 });
  const batch = await t.action(api.notificationIntake.confirmCandidates, {
    workspaceId: workspace.id,
    items: [
      item(workspace.id, daily.id, "sept", { accountingDate: "2026-09-24" }),
      item(workspace.id, daily.id, "oct", {
        accountingDate: "2026-10-02",
        description: "Coffee",
      }),
    ],
  });
  expect(batch.results.map((row) => [row.candidateId, row.ok])).toEqual([
    ["sept", false],
    ["oct", true],
  ]);
  const entries = await t.query(api.accounting.listJournalEntries, {
    workspaceId: workspace.id,
  });
  expect(entries).toHaveLength(1);
  expect(entries[0]?.description).toBe("Coffee");
});
