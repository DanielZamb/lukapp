/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  accountingFixture,
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
  expect(second.receipt).toEqual(first.receipt);
  expect(second.posted).toEqual({ ...first.posted, replay: true });
  expect(first.receipt.idempotencyKey).toBe("intake:candidate-groceries");
  expect(entries).toHaveLength(1);
  expect(entries[0]?.id).toBe(first.posted.id);
  expect(await t.run((ctx) => ctx.db.query("notificationIntakeReceipts").collect())).toHaveLength(1);
  expect(await t.run((ctx) => ctx.db.query("journalLines").collect())).toHaveLength(2);
});

test("changed confirmation facts for an accepted candidate conflict without changing the posting or receipt", async () => {
  const t = await testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  const original = item(workspace.id, daily.id, "sen-99-changed-amount");
  original.confirmed = { ...original.confirmed, amount: { currency: "COP", minorUnits: 500_000 } };
  const accepted = await t.action(api.notificationIntake.confirmOne, original);
  const snapshot = () => t.run(async (ctx) => ({
    receipts: await ctx.db.query("notificationIntakeReceipts").collect(),
    entries: await ctx.db.query("journalEntries").collect(),
    lines: await ctx.db.query("journalLines").collect(),
    totals: await ctx.db.query("ledgerAccountTotals").collect(),
    history: await ctx.db.query("journalEntryProfiles").collect(),
  }));
  const before = await snapshot();
  await expect(t.action(api.notificationIntake.confirmOne, { ...original,
    confirmed: { ...original.confirmed, amount: { currency: "COP", minorUnits: 45_000_000 } },
  })).rejects.toMatchObject({ data: { kind: "intake", code: "candidate_confirmation_conflict",
    message: "This notification was already confirmed with different details. Review the original entry." } });
  expect(await snapshot()).toEqual(before);
  expect(await t.action(api.notificationIntake.confirmOne, original))
    .toEqual({ ...accepted, replay: true, posted: { ...accepted.posted, replay: true } });
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

test("a wipe-bearing revocation is not reduced to a per-item string", async () => {
  const { t, deviceId } = await accountingFixture(modules);
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  await t.action(api.deviceAccess.revoke, { deviceId });
  await expect(
    t.action(api.notificationIntake.confirmCandidates, {
      workspaceId: workspace.id,
      items: [item(workspace.id, daily.id, "c1")],
    }),
  ).rejects.toMatchObject({
    data: { code: "device_revoked", wipeLocalInput: true },
  });
});
