/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  accountingFixture,
  convexAccounting,
  createDaily,
  createOwnedWorkspace,
  createProfile,
  lock,
} from "../src/accounting/convexHarness";
import type { ConfirmCandidateInput, IntakeSuggestion } from "../src/notificationIntake/types";

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

async function storedIntake(t: Awaited<ReturnType<typeof testdb>>) {
  return t.run(async (ctx) => ({
    entries: await ctx.db.query("journalEntries").collect(),
    lines: await ctx.db.query("journalLines").collect(),
    receipts: await ctx.db.query("notificationIntakeReceipts").collect(),
  }));
}

const changedValues = [
  ["direction", { direction: "in" }, "idempotency_key_conflict"],
  ["currency", { amount: { currency: "USD", minorUnits: 126400 } }, "currency_mismatch"],
  ["amount", { amount: { currency: "COP", minorUnits: 126401 } }, "idempotency_key_conflict"],
  ["date", { accountingDate: "2026-09-25" }, "idempotency_key_conflict"],
  ["description", { description: "Different purchase" }, "idempotency_key_conflict"],
] satisfies [string, Partial<IntakeSuggestion>, string][];

test.each(changedValues)("a changed confirmed %s cannot replay", async (_name, change, code) => {
  const t = await testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  const original = item(workspace.id, daily.id, "bound-payload");
  const first = await t.action(api.notificationIntake.confirmOne, original);
  const before = await storedIntake(t);
  await expect(t.action(api.notificationIntake.confirmOne, {
    ...original, confirmed: { ...original.confirmed, ...change },
  })).rejects.toMatchObject({ data: { code } });
  expect(await storedIntake(t)).toEqual(before);
  const retry = await t.action(api.notificationIntake.confirmOne, original);
  expect(retry).toEqual({ ...first, replay: true, posted: { ...first.posted, replay: true } });
});

async function categorizedItem() {
  const t = await testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  const other = await createProfile(t, workspace.id, "Other", "bankAccount");
  async function createCategory(name: string) {
    const result = await t.action(api.accounting.createUserCategory, {
      workspaceId: workspace.id,
      selection: {
        kind: "custom", name, answer: "spend",
        style: { emoji: "🍎", tone: "primary", color: "olive" },
      },
    });
    if (result.kind !== "category") throw new Error("Expected category");
    return result.category.id;
  }
  const ids = [
    await createCategory("Food"),
    await createCategory("Family"),
    await createCategory("Travel"),
  ] satisfies [string, string, string];
  const original: ConfirmCandidateInput & { suggestion: IntakeSuggestion } = item(workspace.id, daily.id, "categorized");
  original.suggestion = { ...original.suggestion, userCategoryIds: ids.slice(0, 2), primaryUserCategoryId: ids[0] };
  original.confirmed = { ...original.suggestion, description: "Edited groceries" };
  return { t, original, other, ids };
}

test("account, categories and primary changes retain the original posting and receipt", async () => {
  const { t, original, other, ids } = await categorizedItem();
  await t.action(api.notificationIntake.confirmOne, original);
  const before = await storedIntake(t);
  for (const change of [
    { financialAccountProfileId: other.id },
    { userCategoryIds: [ids[0], ids[2]] },
    { primaryUserCategoryId: ids[1] },
  ]) {
    await expect(t.action(api.notificationIntake.confirmOne, {
      ...original, confirmed: { ...original.confirmed, ...change },
    })).rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
    expect(await storedIntake(t)).toEqual(before);
  }
});

test("original suggestion fields, category order, parser and consent evidence are immutable", async () => {
  const { t, original, other, ids } = await categorizedItem();
  const first = await t.action(api.notificationIntake.confirmOne, original);
  const before = await storedIntake(t);
  const changes: Partial<ConfirmCandidateInput>[] = [
    ...changedValues.map(([, change]) => ({ suggestion: { ...original.suggestion, ...change } })),
    { suggestion: { ...original.suggestion, financialAccountProfileId: other.id } },
    { suggestion: { ...original.suggestion, userCategoryIds: [ids[0], ids[2]] } },
    { suggestion: { ...original.suggestion, userCategoryIds: [...original.suggestion.userCategoryIds].reverse() } },
    { suggestion: { ...original.suggestion, primaryUserCategoryId: ids[1] } },
    { parserVersion: "parser@2" },
    { consentVersion: "consent@2" },
  ];
  for (const change of changes) {
    await expect(t.action(api.notificationIntake.confirmOne, { ...original, ...change }))
      .rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
    expect(await storedIntake(t)).toEqual(before);
  }
  const { direction, ...rest } = original.suggestion;
  const retry = await t.action(api.notificationIntake.confirmOne, {
    ...original, suggestion: { ...rest, direction },
  });
  expect(retry.receipt).toEqual(first.receipt);
  expect(retry.posted.id).toBe(first.posted.id);
});

test("an exact retry after period locking preserves the original edited receipt", async () => {
  const { t, original } = await categorizedItem();
  const first = await t.action(api.notificationIntake.confirmOne, original);
  const before = await storedIntake(t);
  await lock(t, original.workspaceId, { year: 2026, month: 9 });
  const retry = await t.action(api.notificationIntake.confirmOne, original);
  expect(retry).toEqual({ ...first, replay: true, posted: { ...first.posted, replay: true } });
  expect(retry.receipt.changedFields).toEqual(["description"]);
  expect(await storedIntake(t)).toEqual(before);
});

test("a batch reports a changed-payload conflict beside an exact replay and new post", async () => {
  const t = await testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  const original = item(workspace.id, daily.id, "batch-original");
  const first = await t.action(api.notificationIntake.confirmOne, original);
  const batch = await t.action(api.notificationIntake.confirmCandidates, {
    workspaceId: workspace.id,
    items: [
      { ...original, confirmed: { ...original.confirmed, description: "Changed" } },
      original,
      item(workspace.id, daily.id, "batch-new"),
    ],
  });
  expect(batch.results[0]).toEqual({ candidateId: "batch-original", ok: false, error: "Idempotency key already used" });
  expect(batch.results[1]).toMatchObject({ ok: true, result: { replay: true, receipt: first.receipt } });
  expect(batch.results[2]).toMatchObject({ candidateId: "batch-new", ok: true, result: { replay: false } });
  const stored = await storedIntake(t);
  expect(stored.entries).toHaveLength(2);
  expect(stored.receipts).toHaveLength(2);
});

test("current revocation rejects an existing receipt replay and propagates the wipe", async () => {
  const { t, deviceId } = await accountingFixture(modules);
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  const original = item(workspace.id, daily.id, "revoked-replay");
  await t.action(api.notificationIntake.confirmOne, original);
  const before = await storedIntake(t);
  await t.action(api.deviceAccess.revoke, { deviceId });
  await expect(t.action(api.notificationIntake.confirmCandidates, {
    workspaceId: workspace.id, items: [original],
  })).rejects.toMatchObject({ data: { code: "device_revoked", wipeLocalInput: true } });
  expect(await storedIntake(t)).toEqual(before);
});

test("legacy single-category journals keep their receipt and replay after category deletion", async () => {
  const { t, original, ids } = await categorizedItem();
  original.suggestion = {
    ...original.suggestion, userCategoryIds: [ids[0]], primaryUserCategoryId: null,
  };
  original.confirmed = { ...original.suggestion, description: "Legacy groceries" };
  const posted = await t.action(api.accounting.recordCashExpense, {
    workspaceId: original.workspaceId,
    financialAccountProfileId: original.confirmed.financialAccountProfileId,
    amount: original.confirmed.amount,
    accountingDate: original.confirmed.accountingDate,
    description: original.confirmed.description,
    idempotencyKey: `intake:${original.candidateId}`,
    userCategoryId: ids[0],
  });
  await t.run(async (ctx) => {
    const workspaceId = ctx.db.normalizeId("workspaces", original.workspaceId);
    const journalEntryId = ctx.db.normalizeId("journalEntries", posted.id);
    if (!workspaceId || !journalEntryId) throw new Error("Expected existing journal");
    await ctx.db.insert("notificationIntakeReceipts", {
      workspaceId, journalEntryId,
      idempotencyKey: `intake:${original.candidateId}`,
      suggestion: original.suggestion,
      changedFields: ["description"],
      parserVersion: original.parserVersion,
      consentVersion: original.consentVersion,
      actorId: "owner-1", confirmedAt: 1,
    });
  });
  await t.action(api.accounting.deleteUserCategory, {
    workspaceId: original.workspaceId, categoryId: ids[0],
  });
  const before = await storedIntake(t);
  const retry = await t.action(api.notificationIntake.confirmOne, original);
  expect(retry.replay).toBe(true);
  expect(retry.posted.id).toBe(posted.id);
  expect(retry.receipt).toMatchObject({
    journalEntryId: posted.id, suggestion: original.suggestion,
    changedFields: ["description"], confirmedAt: 1,
  });
  expect(await storedIntake(t)).toEqual(before);
});

test.each([
  [["first\0second"], ["first", "second"]],
  [["first", "second"], ["first\0second"]],
])("colliding suggestion arrays %j and %j cannot replay", async (originalIds, changedIds) => {
  const t = await testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  const base = item(workspace.id, daily.id, "category-evidence-collision");
  const original = {
    ...base,
    suggestion: { ...base.suggestion, userCategoryIds: originalIds },
  };
  const first = await t.action(api.notificationIntake.confirmOne, original);
  const before = await storedIntake(t);
  await expect(t.action(api.notificationIntake.confirmOne, {
    ...original,
    suggestion: { ...original.suggestion, userCategoryIds: changedIds },
  })).rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
  expect(await storedIntake(t)).toEqual(before);
  const retry = await t.action(api.notificationIntake.confirmOne, original);
  expect(retry.receipt).toEqual(first.receipt);
  expect(retry.posted.id).toBe(first.posted.id);
  expect(retry.replay).toBe(true);
  expect(await storedIntake(t)).toEqual(before);
});

test("partial original evidence stays null in receipts and changed evidence cannot replay the same Candidate", async () => {
  const t = await testdb(); const workspace = await createOwnedWorkspace(t); const daily = await createDaily(t, workspace.id);
  const complete = item(workspace.id, daily.id, "partial-review");
  const input: ConfirmCandidateInput = { ...complete, parserVersion: "generic-v2",
    suggestion: { ...complete.suggestion, direction: null, description: "", amount: { currency: null, minorUnits: null } } };
  const first = await t.action(api.notificationIntake.confirmOne, input);
  expect(first.receipt.suggestion).toEqual(input.suggestion);
  expect(first.receipt.changedFields).toEqual(["direction", "description", "amount"]);
  const retry = await t.action(api.notificationIntake.confirmOne, input);
  expect(retry.replay).toBe(true); expect(retry.receipt).toEqual(first.receipt);
  for (const suggestion of [complete.suggestion, { ...input.suggestion, amount: { currency: "COP" as const, minorUnits: null } },
    { ...input.suggestion, amount: { currency: null, minorUnits: 1 } }]) {
    await expect(t.action(api.notificationIntake.confirmOne, { ...input, suggestion })).rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
  }
  const entries = await t.query(api.accounting.listJournalEntries, { workspaceId: workspace.id });
  expect(entries).toHaveLength(1);
});
