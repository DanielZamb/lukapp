/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { IntakeSuggestion } from "../src/notificationIntake/types";
import {
  accountingFixture,
  convexAccounting,
  createDaily,
  createOwnedWorkspace,
  lock,
  type AccountingTest,
} from "../src/accounting/convexHarness";

const modules = import.meta.glob([
  "./**/*.{js,ts}",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

function testdb() {
  return convexAccounting(modules);
}

async function intakeSnapshot(t: AccountingTest) {
  return t.run(async (ctx) => ({
    receipts: await ctx.db.query("notificationIntakeReceipts").collect(),
    entries: await ctx.db.query("journalEntries").collect(),
    lines: await ctx.db.query("journalLines").collect(),
    totals: await ctx.db.query("ledgerAccountTotals").collect(),
    history: await ctx.db.query("journalEntryProfiles").collect(),
  }));
}

async function categorizedCandidate() {
  const t = await testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  const other = await createDaily(t, workspace.id);
  const categories = [];
  for (const presetId of ["groceries", "dining"]) {
    const result = await t.action(api.accounting.createUserCategory, { workspaceId: workspace.id,
      selection: { kind: "preset", presetId, style: { emoji: "🍽️", tone: "primary" } } });
    if (result.kind !== "category") throw new Error("Expected category");
    categories.push(result.category.id);
  }
  const [food, dining] = categories;
  if (!food || !dining) throw new Error("Expected two categories");
  const original = item(workspace.id, daily.id, "sen-99-facts");
  const request = { ...original, confirmed: { ...original.confirmed,
    userCategoryIds: [food, dining], primaryUserCategoryId: food } };
  const accepted = await t.action(api.notificationIntake.confirmOne, request);
  return { t, workspace, daily, other, food, dining, request, accepted };
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
  const snapshot = () => intakeSnapshot(t);
  const before = await snapshot();
  await expect(t.action(api.notificationIntake.confirmOne, { ...original,
    confirmed: { ...original.confirmed, amount: { currency: "COP", minorUnits: 45_000_000 } },
  })).rejects.toMatchObject({ data: { kind: "intake", code: "candidate_confirmation_conflict",
    message: "This notification was already confirmed with different details. Review the original entry." } });
  expect(await snapshot()).toEqual(before);
  expect(await t.action(api.notificationIntake.confirmOne, original))
    .toEqual({ ...accepted, replay: true, posted: { ...accepted.posted, replay: true } });
});

test.each(["direction", "description", "accountingDate", "profile", "categories", "primary"] as const)(
  "changing confirmed %s conflicts against the original journal without changing its receipt", async (field) => {
    const s = await categorizedCandidate();
    const confirmed: IntakeSuggestion = { ...s.request.confirmed };
    switch (field) {
      case "direction":
        confirmed.direction = "in";
        confirmed.userCategoryIds = [];
        confirmed.primaryUserCategoryId = null;
        break;
      case "description": confirmed.description = "Changed confirmation"; break;
      case "accountingDate": confirmed.accountingDate = "2026-09-25"; break;
      case "profile": confirmed.financialAccountProfileId = s.other.id; break;
      case "categories": confirmed.userCategoryIds = [s.food]; break;
      case "primary": confirmed.primaryUserCategoryId = s.dining; break;
    }
    const before = await intakeSnapshot(s.t);
    await expect(s.t.action(api.notificationIntake.confirmOne, { ...s.request, confirmed }))
      .rejects.toMatchObject({ data: { kind: "intake", code: "candidate_confirmation_conflict" } });
    expect(await intakeSnapshot(s.t)).toEqual(before);
    expect(await s.t.action(api.notificationIntake.confirmOne, s.request))
      .toEqual({ ...s.accepted, replay: true, posted: { ...s.accepted.posted, replay: true } });
  },
);

test("normalized confirmation replay preserves the original suggestion and audit metadata", async () => {
  const s = await categorizedCandidate();
  const before = await intakeSnapshot(s.t);
  const replay = await s.t.action(api.notificationIntake.confirmOne, { ...s.request,
    confirmed: { ...s.request.confirmed, description: `  ${s.request.confirmed.description}  `,
      userCategoryIds: [s.dining, s.food] },
    suggestion: { ...s.request.suggestion, amount: { currency: "COP", minorUnits: 45_000_000 } },
    parserVersion: "parser@2", consentVersion: "consent@2",
  });
  expect(replay).toEqual({ ...s.accepted, replay: true, posted: { ...s.accepted.posted, replay: true } });
  expect(await intakeSnapshot(s.t)).toEqual(before);
  expect(replay.receipt.changedFields).toEqual(["userCategoryIds", "primaryUserCategoryId"]);
});

test("exact confirmation replays after category retirement and period lock, while a changed amount still conflicts", async () => {
  const s = await categorizedCandidate();
  await s.t.action(api.accounting.deleteUserCategory, { workspaceId: s.workspace.id, categoryId: s.food });
  await lock(s.t, s.workspace.id, { year: 2026, month: 9 });
  const before = await intakeSnapshot(s.t);
  expect(await s.t.action(api.notificationIntake.confirmOne, s.request))
    .toEqual({ ...s.accepted, replay: true, posted: { ...s.accepted.posted, replay: true } });
  await expect(s.t.action(api.notificationIntake.confirmOne, { ...s.request, confirmed: { ...s.request.confirmed,
    amount: { currency: "COP", minorUnits: 45_000_000 } } }))
    .rejects.toMatchObject({ data: { code: "candidate_confirmation_conflict" } });
  expect(await intakeSnapshot(s.t)).toEqual(before);
});

test("concurrent exact confirmations return one original receipt and one journal", async () => {
  const t = await testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  const request = item(workspace.id, daily.id, "sen-99-concurrent");
  const results = await Promise.all([t.action(api.notificationIntake.confirmOne, request),
    t.action(api.notificationIntake.confirmOne, request)]);
  expect(results.map((result) => result.replay).sort()).toEqual([false, true]);
  expect(results[0]?.receipt).toEqual(results[1]?.receipt);
  const state = await intakeSnapshot(t);
  expect(state.receipts).toHaveLength(1);
  expect(state.entries).toHaveLength(1);
  expect(state.lines).toHaveLength(2);
});

test("batch confirmation reports the conflict and still returns an exact replay", async () => {
  const s = await categorizedCandidate();
  const before = await intakeSnapshot(s.t);
  const batch = await s.t.action(api.notificationIntake.confirmCandidates, { workspaceId: s.workspace.id,
    items: [{ ...s.request, confirmed: { ...s.request.confirmed, amount: { currency: "COP", minorUnits: 45_000_000 } } }, s.request] });
  expect(batch.results).toEqual([
    { candidateId: s.request.candidateId, ok: false,
      error: "This notification was already confirmed with different details. Review the original entry." },
    { candidateId: s.request.candidateId, ok: true,
      result: { ...s.accepted, replay: true, posted: { ...s.accepted.posted, replay: true } } },
  ]);
  expect(await intakeSnapshot(s.t)).toEqual(before);
});

test("an existing journal recovers a missing receipt only for its exact confirmation", async () => {
  const s = await categorizedCandidate();
  await s.t.run(async (ctx) => {
    for (const receipt of await ctx.db.query("notificationIntakeReceipts").collect())
      await ctx.db.delete(receipt._id);
  });
  const before = await intakeSnapshot(s.t);
  await expect(s.t.action(api.notificationIntake.confirmOne, { ...s.request,
    confirmed: { ...s.request.confirmed, description: "Different" } }))
    .rejects.toMatchObject({ data: { code: "candidate_confirmation_conflict" } });
  expect(await intakeSnapshot(s.t)).toEqual(before);
  const recovered = await s.t.action(api.notificationIntake.confirmOne, s.request);
  expect(recovered.posted).toEqual({ ...s.accepted.posted, replay: true });
  expect(recovered.replay).toBe(true);
  expect((await intakeSnapshot(s.t)).receipts).toHaveLength(1);
  expect((await intakeSnapshot(s.t)).entries).toEqual(before.entries);
});

test("a receipt whose original journal is missing cannot be replayed as a new posting", async () => {
  const s = await categorizedCandidate();
  await s.t.run(async (ctx) => {
    const id = ctx.db.normalizeId("journalEntries", s.accepted.posted.id);
    if (!id) throw new Error("Missing journal ID");
    await ctx.db.delete(id);
  });
  const before = await intakeSnapshot(s.t);
  await expect(s.t.action(api.notificationIntake.confirmOne, s.request))
    .rejects.toMatchObject({ data: { kind: "intake", code: "journal_entry_not_found" } });
  expect(await intakeSnapshot(s.t)).toEqual(before);
});

test("invalid changed facts retain their validation error and never return the old success receipt", async () => {
  const s = await categorizedCandidate();
  const before = await intakeSnapshot(s.t);
  for (const [amount, code] of [
    [{ currency: "USD", minorUnits: 126400 }, "currency_mismatch"],
    [{ currency: "COP", minorUnits: 0 }, "amount_must_be_positive"],
  ] as const) {
    await expect(s.t.action(api.notificationIntake.confirmOne, { ...s.request,
      confirmed: { ...s.request.confirmed, amount } }))
      .rejects.toMatchObject({ data: { kind: "accounting", code } });
    expect(await intakeSnapshot(s.t)).toEqual(before);
  }
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
  const request = item(workspace.id, daily.id, "revoked-retry");
  await t.action(api.notificationIntake.confirmOne, request);
  const before = await intakeSnapshot(t);
  await t.action(api.deviceAccess.revoke, { deviceId });
  await expect(t.action(api.notificationIntake.confirmOne, request)).rejects.toMatchObject({
    data: { code: "device_revoked", wipeLocalInput: true },
  });
  await expect(
    t.action(api.notificationIntake.confirmCandidates, {
      workspaceId: workspace.id,
      items: [item(workspace.id, daily.id, "c1")],
    }),
  ).rejects.toMatchObject({
    data: { code: "device_revoked", wipeLocalInput: true },
  });
  expect(await intakeSnapshot(t)).toEqual(before);
});
