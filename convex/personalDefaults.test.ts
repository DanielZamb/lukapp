import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  convexAccounting,
  groceries,
  createOwnedWorkspace,
  createDaily,
  lock,
} from "../src/accounting/convexHarness";

const modules = import.meta.glob([
  "./**/*.{js,ts}",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

test("concurrent setup and retries return one canonical Personal workspace and zero-balance cash profile", async () => {
  const t = await convexAccounting(modules);
  expect(await t.query(api.accounting.personalDefaults, {})).toBeNull();
  const args = { functionalCurrency: "COP", startingMinorUnits: 0 };
  const first = await t.action(api.accounting.ensurePersonalDefaults, args);
  const retries = await Promise.all(
    Array.from({ length: 5 }, () =>
      t.action(api.accounting.ensurePersonalDefaults, args),
    ),
  );
  expect(retries).toEqual(Array(5).fill(first));
  const state = await t.run(async (ctx) => ({
    workspaces: await ctx.db.query("workspaces").collect(),
    memberships: await ctx.db.query("workspaceMemberships").collect(),
    profiles: await ctx.db.query("financialAccountProfiles").collect(),
    defaults: await ctx.db.query("personalDefaults").collect(),
    entries: await ctx.db.query("journalEntries").collect(),
  }));
  expect(state.workspaces).toHaveLength(1);
  expect(state.memberships).toHaveLength(1);
  expect(state.profiles).toHaveLength(1);
  expect(state.defaults).toHaveLength(1);
  expect(state.entries).toEqual([]);
  expect(first.financialAccountProfile).toMatchObject({
    name: "My money",
    productKind: "cash",
    workspaceId: first.workspace.id,
  });
  expect(await t.query(api.accounting.personalDefaults, {})).toEqual(first);
  expect(
    await t.query(api.accounting.balances, { workspaceId: first.workspace.id }),
  ).toMatchObject([{ balance: { currency: "COP", minorUnits: 0 } }]);
});

test("first concurrent setup converges, including its one opening entry", async () => {
  const t = await convexAccounting(modules);
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      t.action(api.accounting.ensurePersonalDefaults, {
        functionalCurrency: "COP",
        startingMinorUnits: 1000000,
      }),
    ),
  );
  expect(results[1]).toEqual(results[0]);
  expect(results[2]).toEqual(results[0]);
  const workspaceId = results[0].workspace.id;
  const activity = await t.query(api.accounting.postedActivity, {
    workspaceId,
    month: "2026-09",
  });
  expect(activity.accounts[0].balance).toEqual({
    currency: "COP",
    minorUnits: 1000000,
  });
  expect(activity.monthSpendMinorUnits).toBe(0);
  expect(activity.rows).toMatchObject([
    { detail: "Starting amount", amount: { minorUnits: 1000000 } },
  ]);
  expect(
    await t.query(api.accounting.listJournalEntries, { workspaceId }),
  ).toHaveLength(1);
});

test("invalid setup and conflicting retries cannot leave partial or duplicate records", async () => {
  const t = await convexAccounting(modules);
  for (const args of [
    { functionalCurrency: "XXX", startingMinorUnits: 0 },
    { functionalCurrency: "COP", startingMinorUnits: -1 },
    { functionalCurrency: "COP", startingMinorUnits: 1.5 },
  ]) {
    await expect(
      t.action(api.accounting.ensurePersonalDefaults, args),
    ).rejects.toThrow();
    expect(await t.query(api.accounting.personalDefaults, {})).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("workspaces").collect())).toEqual(
      [],
    );
  }
  await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP",
    startingMinorUnits: 0,
  });
  await expect(
    t.action(api.accounting.ensurePersonalDefaults, {
      functionalCurrency: "USD",
      startingMinorUnits: 0,
    }),
  ).rejects.toMatchObject({ data: { code: "setup_conflict" } });
  await expect(
    t.action(api.accounting.ensurePersonalDefaults, {
      functionalCurrency: "COP",
      startingMinorUnits: 1,
    }),
  ).rejects.toMatchObject({ data: { code: "setup_conflict" } });
});

test("first expense reloads from the ledger, replays once, rejects changed payloads and hides reversal rows", async () => {
  const t = await convexAccounting(modules);
  const defaults = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP",
    startingMinorUnits: 0,
  });
  const workspaceId = defaults.workspace.id;
  const payload = groceries(workspaceId, defaults.financialAccountProfile.id);
  const first = await t.action(api.accounting.recordCashExpense, payload);
  expect(first.postedBy).toBe("owner-1");
  expect(
    await t.action(api.accounting.recordCashExpense, payload),
  ).toMatchObject({ id: first.id, replay: true });
  await expect(
    t.action(api.accounting.recordCashExpense, {
      ...payload,
      description: "Changed",
    }),
  ).rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
  const reloaded = await t.query(api.accounting.postedActivity, {
    workspaceId,
    month: "2026-09",
  });
  expect(reloaded.accounts[0].balance).toEqual({
    currency: "COP",
    minorUnits: -150000,
  });
  expect(reloaded.monthSpendMinorUnits).toBe(150000);
  expect(reloaded.rows).toMatchObject([
    {
      title: "Groceries",
      amount: { currency: "COP", minorUnits: -150000 },
      reversed: false,
    },
  ]);
  await t.action(api.accounting.reversePostedEntry, {
    workspaceId,
    journalEntryId: first.id,
    idempotencyKey: "reverse",
  });
  const reversed = await t.query(api.accounting.postedActivity, {
    workspaceId,
    month: "2026-09",
  });
  expect(reversed.accounts[0].balance.minorUnits).toBe(0);
  expect(reversed.monthSpendMinorUnits).toBe(0);
  expect(reversed.rows).toMatchObject([{ id: first.id, reversed: true }]);
  expect(reversed.rows).toHaveLength(1);
});

test("ordinary expense rejects foreign IDs, invalid amounts, dates, currency and a locked period without posting", async () => {
  const t = await convexAccounting(modules);
  const defaults = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP",
    startingMinorUnits: 0,
  });
  const foreign = await createOwnedWorkspace(t);
  const other = await createDaily(t, foreign.id);
  const payload = groceries(
    defaults.workspace.id,
    defaults.financialAccountProfile.id,
  );
  for (const bad of [
    { ...payload, workspaceId: "foreign" },
    { ...payload, financialAccountProfileId: other.id },
    { ...payload, amount: { currency: "USD", minorUnits: 100 } },
    ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1].map((minorUnits) => ({
      ...payload,
      amount: { currency: "COP", minorUnits },
    })),
    { ...payload, accountingDate: "2026-02-30" },
  ])
    await expect(
      t.action(api.accounting.recordCashExpense, bad),
    ).rejects.toThrow();
  await lock(t, defaults.workspace.id, { year: 2026, month: 9 });
  await expect(
    t.action(api.accounting.recordCashExpense, payload),
  ).rejects.toMatchObject({ data: { code: "locked_period" } });
  expect(
    await t.query(api.accounting.listJournalEntries, {
      workspaceId: defaults.workspace.id,
    }),
  ).toEqual([]);
});
