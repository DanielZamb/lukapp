import type { FunctionArgs } from "convex/server";
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
  const args = {
    functionalCurrency: "COP",
    startingMinorUnits: 0,
    timeZone: "America/Bogota",
  };
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
        timeZone: "America/Bogota",
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
  ).toMatchObject([{ policy: "start-tracking@1" }]);
});

test("invalid setup and conflicting retries cannot leave partial or duplicate records", async () => {
  const t = await convexAccounting(modules);
  for (const args of [
    { functionalCurrency: "XXX", startingMinorUnits: 0, timeZone: "America/Bogota" },
    { functionalCurrency: "COP", startingMinorUnits: -1, timeZone: "America/Bogota" },
    { functionalCurrency: "COP", startingMinorUnits: 1.5, timeZone: "America/Bogota" },
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
    timeZone: "America/Bogota",
  });
  await expect(
    t.action(api.accounting.ensurePersonalDefaults, {
      functionalCurrency: "USD",
      startingMinorUnits: 0,
      timeZone: "America/Bogota",
    }),
  ).rejects.toMatchObject({ data: { code: "setup_conflict" } });
  await expect(
    t.action(api.accounting.ensurePersonalDefaults, {
      functionalCurrency: "COP",
      startingMinorUnits: 1,
      timeZone: "America/Bogota",
    }),
  ).rejects.toMatchObject({ data: { code: "setup_conflict" } });
});

test("first expense reloads from the ledger, replays once, rejects changed payloads and hides reversal rows", async () => {
  const t = await convexAccounting(modules);
  const defaults = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP",
    startingMinorUnits: 0,
    timeZone: "America/Bogota",
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

test("first setup requires a timezone and does not silently assume Bogotá", async () => {
  const t = await convexAccounting(modules);
  await expect(
    t.action(api.accounting.ensurePersonalDefaults, {
      functionalCurrency: "COP",
      startingMinorUnits: 0,
    } as never),
  ).rejects.toThrow();
  await expect(
    t.action(api.accounting.ensurePersonalDefaults, {
      functionalCurrency: "COP",
      startingMinorUnits: 0,
      timeZone: "",
    }),
  ).rejects.toThrow();
  expect(await t.query(api.accounting.personalDefaults, {})).toBeNull();
});

test("ordinary expense rejects foreign IDs, invalid amounts, dates, currency and a locked period without posting", async () => {
  const t = await convexAccounting(modules);
  const defaults = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP",
    startingMinorUnits: 0,
    timeZone: "America/Bogota",
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

test("first-run persists consent, budget shortcut, first chosen category and all look colors across retries", async () => {
  const t = await convexAccounting(modules);
  const args = {
    functionalCurrency: "EUR",
    startingMinorUnits: 150025,
    timeZone: "Europe/Madrid",
    purchaseAlertsConsent: true,
    wantsBudgets: true,
    categories: [
      {
        kind: "custom",
        name: "Weekend",
        answer: "spend",
        style: { emoji: "🎉", tone: "primary", color: "h30" },
      },
      {
        kind: "preset",
        presetId: "groceries",
        style: { emoji: "🛒", tone: "primary", color: "h150" },
      },
    ],
  } satisfies FunctionArgs<typeof api.accounting.ensurePersonalDefaults>;
  const first = await t.action(api.accounting.ensurePersonalDefaults, args);
  expect(first).toMatchObject({
    purchaseAlertsConsent: true,
    wantsBudgets: true,
  });
  const categories = await t.query(api.accounting.listUserCategories, {
    workspaceId: first.workspace.id,
  });
  expect(
    categories.find((category) => category.name === "Weekend"),
  ).toMatchObject({
    id: first.firstCategoryId,
    nature: "Expense",
    style: { emoji: "🎉", tone: "primary", color: "h30" },
  });
  expect(await t.action(api.accounting.ensurePersonalDefaults, args)).toEqual(
    first,
  );
  expect(await t.query(api.accounting.personalDefaults, {})).toEqual(first);
  for (const changed of [
    { purchaseAlertsConsent: false },
    { wantsBudgets: false },
    {
      categories: [
        {
          ...args.categories[0],
          style: { ...args.categories[0].style, color: "h45" },
        },
        args.categories[1],
      ],
    },
  ]) {
    await expect(
      t.action(api.accounting.ensurePersonalDefaults, { ...args, ...changed }),
    ).rejects.toMatchObject({ data: { code: "setup_conflict" } });
  }
  expect(
    await t.run((ctx) => ctx.db.query("journalEntries").collect()),
  ).toHaveLength(1);
  expect(
    await t.run((ctx) => ctx.db.query("financialAccountProfiles").collect()),
  ).toHaveLength(1);
});

test("legacy setup stays readable and retryable without the additive preferences or colors", async () => {
  const t = await convexAccounting(modules);
  const args = {
    functionalCurrency: "COP",
    startingMinorUnits: 0,
    timeZone: "America/Bogota",
  };
  const first = await t.action(api.accounting.ensurePersonalDefaults, args);
  await t.run(async (ctx) => {
    const defaults = await ctx.db.query("personalDefaults").unique();
    if (!defaults) throw new Error("Missing defaults");
    await ctx.db.patch(defaults._id, {
      purchaseAlertsConsent: undefined,
      wantsBudgets: undefined,
    });
  });
  expect(await t.action(api.accounting.ensurePersonalDefaults, args)).toEqual(
    first,
  );
  expect(await t.query(api.accounting.personalDefaults, {})).toMatchObject({
    purchaseAlertsConsent: false,
    wantsBudgets: false,
  });
});

test("more than twelve setup categories fails atomically", async () => {
  const t = await convexAccounting(modules);
  await expect(
    t.action(api.accounting.ensurePersonalDefaults, {
      functionalCurrency: "COP",
      startingMinorUnits: 0,
      timeZone: "America/Bogota",
      categories: Array.from(
        { length: 13 },
        (
          _,
          index,
        ): NonNullable<
          FunctionArgs<
            typeof api.accounting.ensurePersonalDefaults
          >["categories"]
        >[number] => ({
          kind: "custom",
          name: `Category ${index}`,
          answer: "spend",
          style: { emoji: "✨", tone: "primary" },
        }),
      ),
    }),
  ).rejects.toMatchObject({ data: { code: "setup_category_limit" } });
  expect(await t.query(api.accounting.personalDefaults, {})).toBeNull();
  expect(await t.run((ctx) => ctx.db.query("workspaces").collect())).toEqual(
    [],
  );
});

test("zero-balance setup rejects activity before its tracking date without creating an opening journal", async () => {
  const t = await convexAccounting(modules);
  const defaults = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP", startingMinorUnits: 0, timeZone: "America/Bogota",
  });
  const payload = groceries(defaults.workspace.id, defaults.financialAccountProfile.id);
  await expect(t.action(api.accounting.recordCashExpense, {
    ...payload, accountingDate: "2026-09-23",
  })).rejects.toMatchObject({ data: { code: "activity_before_opening" } });
  expect(await t.query(api.accounting.listJournalEntries, { workspaceId: defaults.workspace.id })).toEqual([]);
  await expect(t.action(api.accounting.recordCashExpense, payload)).resolves.toMatchObject({ accountingDate: "2026-09-24" });
  expect(await t.run((ctx) => ctx.db.query("financialAccountOpenings").collect())).toHaveLength(1);
});


test.each([["JPY", 100], ["BHD", 1234]] satisfies [string, number][])(
  "%s setup stores its opening amount in the supplied minor units", async (functionalCurrency, startingMinorUnits) => {
    const t = await convexAccounting(modules);
    const defaults = await t.action(api.accounting.ensurePersonalDefaults, {
      functionalCurrency, startingMinorUnits, timeZone: "America/Bogota",
    });
    expect(await t.query(api.accounting.balances, { workspaceId: defaults.workspace.id }))
      .toMatchObject([{ balance: { currency: functionalCurrency, minorUnits: startingMinorUnits } }]);
  },
);
