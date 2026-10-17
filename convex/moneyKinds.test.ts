import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  convexAccounting,
  createOwnedWorkspace,
  createProfile,
  groceries,
  lock,
  reader,
  reverse,
} from "../src/accounting/convexHarness";

const modules = import.meta.glob([
  "./**/*.{js,ts}",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);
async function fixture() {
  const t = await convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  const bank = await createProfile(t, workspace.id, "Bank", "bankAccount");
  const card = await createProfile(t, workspace.id, "Card", "creditCard");
  const loan = await createProfile(t, workspace.id, "Loan", "loan");
  return {
    t,
    workspaceId: workspace.id,
    bank,
    card,
    loan,
    read: reader(t, workspace.id),
  };
}
function opening(
  workspaceId: string,
  profileId: string,
  amount = 10000,
  date = "2026-09-20",
) {
  return {
    ...groceries(workspaceId, profileId),
    amount: { currency: "COP", minorUnits: amount },
    accountingDate: date,
    description: "Starting amount",
    idempotencyKey: `opening-${profileId}`,
  };
}
function transfer(
  workspaceId: string,
  source: string,
  destination: string,
  amount = 2500,
) {
  return {
    workspaceId,
    sourceFinancialAccountProfileId: source,
    destinationFinancialAccountProfileId: destination,
    amount: { currency: "COP", minorUnits: amount },
    accountingDate: "2026-09-24",
    description: "Card payment",
    idempotencyKey: `transfer-${source}-${destination}`,
  };
}

test("income, card payment and loan payment share Posting, move normal balances once and leave spending unchanged", async () => {
  const { t, workspaceId, bank, card, loan, read } = await fixture();
  await t.action(
    api.accounting.recordOpeningPosition,
    opening(workspaceId, bank.id, 100000),
  );
  await t.action(
    api.accounting.recordOpeningPosition,
    opening(workspaceId, card.id, 10000),
  );
  await t.action(
    api.accounting.recordOpeningPosition,
    opening(workspaceId, loan.id, 20000),
  );
  const salary = await t.action(api.accounting.createUserCategory, {
    workspaceId,
    selection: {
      kind: "preset",
      presetId: "salary",
      style: { emoji: "💼", tone: "primary" },
    },
  });
  if (salary.kind !== "category") throw new Error("Expected Income category");
  const income = await t.action(api.accounting.recordCashIncome, {
    ...groceries(workspaceId, bank.id, {
      amount: 50000,
      idempotencyKey: "salary",
      description: "Salary",
    }),
    userCategoryIds: [salary.category.id],
  });
  expect(income.policy).toBe("cash-income@1");
  expect(income.lines.flatMap((line) => line.userCategories)).toEqual([
    { id: salary.category.id, name: "Salary" },
  ]);
  expect(
    income.lines.map((line) => [
      line.nature,
      line.debitMinorUnits,
      line.creditMinorUnits,
    ]),
  ).toEqual([
    ["Asset", 50000, 0],
    ["Revenue", 0, 50000],
  ]);
  const payload = transfer(workspaceId, bank.id, card.id);
  const posted = await t.action(api.accounting.recordAccountTransfer, payload);
  expect(posted).toMatchObject({
    policy: "account-transfer@1",
    financialAccountProfileId: bank.id,
  });
  expect(
    posted.lines.map((line) => [
      line.ledgerAccountId,
      line.debitMinorUnits,
      line.creditMinorUnits,
    ]),
  ).toEqual([
    [card.ledgerAccountId, 2500, 0],
    [bank.ledgerAccountId, 0, 2500],
  ]);
  expect(await t.action(api.accounting.recordAccountTransfer, payload)).toEqual(
    { ...posted, replay: true },
  );
  await t.action(
    api.accounting.recordAccountTransfer,
    transfer(workspaceId, bank.id, loan.id, 5000),
  );
  expect(
    (await read.balances()).map((balance) => [
      balance.name,
      balance.balance.minorUnits,
    ]),
  ).toEqual([
    ["Bank", 142500],
    ["Card", 7500],
    ["Loan", 15000],
  ]);
  const activity = await t.query(api.accounting.postedActivity, {
    workspaceId,
    month: "2026-09",
  });
  expect(activity.monthSpendMinorUnits).toBe(0);
  expect(activity.rows.find((row) => row.id === posted.id)).toMatchObject({
    detail: "Account Transfer",
    amount: { minorUnits: -2500 },
  });
  const history = await t.query(api.accounting.postedHistory, {
    workspaceId,
    paginationOpts: { cursor: null, numItems: 50 },
  });
  expect(history.page.find((row) => row.id === posted.id)).toMatchObject({
    detail: "Account Transfer",
    amount: { minorUnits: -2500 },
  });
  expect(await read.entries()).toHaveLength(6);
  const trial = await read.trialBalance();
  expect(
    trial.reduce(
      (sum, row) => sum + row.debitMinorUnits - row.creditMinorUnits,
      0,
    ),
  ).toBe(0);
  const correction = await reverse(t, workspaceId, posted.id);
  expect(
    correction.lines.map((line) => [
      line.ledgerAccountId,
      line.debitMinorUnits,
      line.creditMinorUnits,
    ]),
  ).toEqual([
    [card.ledgerAccountId, 0, 2500],
    [bank.ledgerAccountId, 2500, 0],
  ]);
  expect(
    (await read.balances()).map((balance) => balance.balance.minorUnits),
  ).toEqual([145000, 10000, 15000]);
});

test("opening posts on each account's normal side; retry, correction and one active opening are enforced", async () => {
  const { t, workspaceId, bank, card, read } = await fixture();
  const first = await t.action(
    api.accounting.recordOpeningPosition,
    opening(workspaceId, bank.id),
  );
  expect(first).toMatchObject({
    policy: "opening-position@1",
    description: "Starting amount",
  });
  expect(
    first?.lines.map((line) => [
      line.nature,
      line.debitMinorUnits,
      line.creditMinorUnits,
    ]),
  ).toEqual([
    ["Asset", 10000, 0],
    ["Equity", 0, 10000],
  ]);
  expect(
    await t.action(
      api.accounting.recordOpeningPosition,
      opening(workspaceId, bank.id),
    ),
  ).toEqual({ ...first, replay: true });
  await expect(
    t.action(api.accounting.recordOpeningPosition, {
      ...opening(workspaceId, bank.id),
      idempotencyKey: "another-opening",
    }),
  ).rejects.toMatchObject({ data: { code: "opening_already_exists" } });
  const owed = await t.action(
    api.accounting.recordOpeningPosition,
    opening(workspaceId, card.id),
  );
  expect(
    owed?.lines.map((line) => [
      line.nature,
      line.debitMinorUnits,
      line.creditMinorUnits,
    ]),
  ).toEqual([
    ["Liability", 0, 10000],
    ["Equity", 10000, 0],
  ]);
  if (!first) throw new Error("Missing opening");
  await reverse(t, workspaceId, first.id);
  await t.action(api.accounting.recordOpeningPosition, {
    ...opening(workspaceId, bank.id, 12000),
    idempotencyKey: "correct-opening",
  });
  expect(
    (await read.balances()).map((balance) => balance.balance.minorUnits),
  ).toEqual([12000, 10000, 0]);
  expect(await read.entries()).toHaveLength(4);
});

test("opening-date control checks income, expense, both transfer lines and reversals through shared Posting", async () => {
  const { t, workspaceId, bank, card, read } = await fixture();
  await t.action(
    api.accounting.recordOpeningPosition,
    opening(workspaceId, bank.id, 100000, "2026-09-22"),
  );
  const posted = await t.action(
    api.accounting.recordOpeningPosition,
    opening(workspaceId, card.id, 20000, "2026-09-23"),
  );
  const before = await read.entries();
  for (const method of [
    api.accounting.recordCashExpense,
    api.accounting.recordCashIncome,
  ])
    await expect(
      t.action(
        method,
        groceries(workspaceId, bank.id, { accountingDate: "2026-09-21" }),
      ),
    ).rejects.toMatchObject({ data: { code: "activity_before_opening" } });
  for (const [source, destination] of [
    [bank.id, card.id],
    [card.id, bank.id],
  ])
    await expect(
      t.action(api.accounting.recordAccountTransfer, {
        ...transfer(workspaceId, source, destination),
        accountingDate: "2026-09-22",
      }),
    ).rejects.toMatchObject({ data: { code: "activity_before_opening" } });
  if (!posted) throw new Error("Missing opening");
  await expect(
    reverse(t, workspaceId, posted.id, { accountingDate: "2026-09-22" }),
  ).rejects.toMatchObject({ data: { code: "reversal_date_before_original" } });
  expect(await read.entries()).toEqual(before);
  await t.action(
    api.accounting.recordCashIncome,
    groceries(workspaceId, bank.id, { accountingDate: "2026-09-22" }),
  );
  await t.action(api.accounting.recordAccountTransfer, {
    ...transfer(workspaceId, bank.id, card.id),
    accountingDate: "2026-09-23",
  });
});

test("new transfers reject same, missing and foreign profiles, invalid money/dates, changed retries and locked periods without effects", async () => {
  const { t, workspaceId, bank, card, read } = await fixture();
  const other = await createOwnedWorkspace(t);
  const foreign = await createProfile(t, other.id, "Foreign", "cash");
  const args = transfer(workspaceId, bank.id, card.id);
  for (const [patch, code] of [
    [
      { destinationFinancialAccountProfileId: bank.id },
      "transfer_profiles_must_differ",
    ],
    [
      { sourceFinancialAccountProfileId: "missing" },
      "financial_account_profile_not_found",
    ],
    [
      { destinationFinancialAccountProfileId: foreign.id },
      "financial_account_profile_not_found",
    ],
    [
      { sourceFinancialAccountProfileId: foreign.id },
      "financial_account_profile_not_found",
    ],
    [{ amount: { currency: "USD", minorUnits: 100 } }, "currency_mismatch"],
    [{ accountingDate: "2026-02-30" }, "accounting_date_required"],
    ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1].map(
      (minorUnits) =>
        [
          { amount: { currency: "COP", minorUnits } },
          "amount_must_be_positive",
        ] as const,
    ),
  ] as const)
    await expect(
      t.action(api.accounting.recordAccountTransfer, { ...args, ...patch }),
    ).rejects.toMatchObject({ data: { code } });
  expect(await read.entries()).toEqual([]);
  const first = await t.action(api.accounting.recordAccountTransfer, args);
  for (const patch of [
    { description: "Changed" },
    { destinationFinancialAccountProfileId: foreign.id },
    { accountingDate: "2026-09-25" },
    { amount: { currency: "COP", minorUnits: 3000 } },
  ])
    await expect(
      t.action(api.accounting.recordAccountTransfer, { ...args, ...patch }),
    ).rejects.toThrow();
  await lock(t, workspaceId, { year: 2026, month: 9 });
  expect(await t.action(api.accounting.recordAccountTransfer, args)).toEqual({
    ...first,
    accountingPeriod: { year: 2026, month: 9, status: "locked" },
    replay: true,
  });
  await expect(
    t.action(api.accounting.recordAccountTransfer, {
      ...args,
      idempotencyKey: "new-locked",
    }),
  ).rejects.toMatchObject({ data: { code: "locked_period" } });
  expect(await read.entries()).toHaveLength(1);
});

test("atomic account setup converges on one profile/opening, including zero, and rejects conflicting or invalid retries", async () => {
  const t = await convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  const workspaceId = workspace.id;
  const args = {
    workspaceId,
    name: "Travel card",
    productKind: "creditCard",
    amount: { currency: "COP", minorUnits: 45000 },
    accountingDate: "2026-09-20",
    idempotencyKey: "setup-card",
  } as const;
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      t.action(api.accounting.setupFinancialAccountProfile, args),
    ),
  );
  expect(
    new Set(results.map((result) => result.financialAccountProfile.id)).size,
  ).toBe(1);
  expect(new Set(results.map((result) => result.openingEntry?.id)).size).toBe(
    1,
  );
  expect(await t.query(api.accounting.balances, { workspaceId })).toMatchObject(
    [
      {
        name: "Travel card",
        nature: "Liability",
        balance: { minorUnits: 45000 },
      },
    ],
  );
  for (const patch of [
    { name: "Changed" },
    { productKind: "loan" as const },
    { amount: { currency: "COP", minorUnits: 0 } },
    { accountingDate: "2026-09-21" },
  ])
    await expect(
      t.action(api.accounting.setupFinancialAccountProfile, {
        ...args,
        ...patch,
      }),
    ).rejects.toMatchObject({ data: { code: "account_setup_conflict" } });
  for (const [patch, code] of [
    [{ amount: { currency: "COP", minorUnits: -1 } }, "opening_amount_invalid"],
    [
      { amount: { currency: "COP", minorUnits: 1.5 } },
      "opening_amount_invalid",
    ],
    [{ amount: { currency: "USD", minorUnits: 1 } }, "currency_mismatch"],
    [{ accountingDate: "invalid" }, "accounting_date_required"],
    [{ name: " " }, "name_required"],
  ] as const)
    await expect(
      t.action(api.accounting.setupFinancialAccountProfile, {
        ...args,
        idempotencyKey: "invalid-setup",
        ...patch,
      }),
    ).rejects.toMatchObject({ data: { code } });
  const zero = {
    ...args,
    name: "Empty wallet",
    productKind: "cash" as const,
    amount: { currency: "COP", minorUnits: 0 },
    idempotencyKey: "setup-zero",
  };
  const empty = await t.action(
    api.accounting.setupFinancialAccountProfile,
    zero,
  );
  expect(empty.openingEntry).toBeNull();
  expect(
    await t.action(api.accounting.setupFinancialAccountProfile, zero),
  ).toEqual({ ...empty, replay: true });
  expect(
    await t.query(api.accounting.listFinancialAccountProfiles, { workspaceId }),
  ).toHaveLength(2);
  expect(
    await t.query(api.accounting.listJournalEntries, { workspaceId }),
  ).toHaveLength(1);
  expect(
    await t.run((ctx) => ctx.db.query("financialAccountSetups").collect()),
  ).toHaveLength(2);
});

test("negative/zero openings and openings after existing activity do not change ledger or balances", async () => {
  const { t, workspaceId, bank, read } = await fixture();
  const args = opening(workspaceId, bank.id);
  await expect(
    t.action(api.accounting.recordOpeningPosition, {
      ...args,
      amount: { currency: "COP", minorUnits: -1 },
    }),
  ).rejects.toMatchObject({ data: { code: "opening_amount_invalid" } });
  expect(
    await t.action(api.accounting.recordOpeningPosition, {
      ...args,
      amount: { currency: "COP", minorUnits: 0 },
    }),
  ).toBeNull();
  expect(await read.entries()).toEqual([]);
  await t.action(
    api.accounting.recordCashExpense,
    groceries(workspaceId, bank.id),
  );
  await expect(
    t.action(
      api.accounting.recordOpeningPosition,
      opening(workspaceId, bank.id, 10000, "2026-09-25"),
    ),
  ).rejects.toMatchObject({ data: { code: "opening_after_activity" } });
  expect(await read.entries()).toHaveLength(1);
});

test("concurrent opening attempts with different keys admit only one active opening", async () => {
  const { t, workspaceId, bank, read } = await fixture();
  const attempts = await Promise.allSettled(
    ["one", "two", "three"].map((idempotencyKey) =>
      t.action(api.accounting.recordOpeningPosition, {
        ...opening(workspaceId, bank.id),
        idempotencyKey,
      }),
    ),
  );
  expect(
    attempts.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(
    attempts.filter((result) => result.status === "rejected"),
  ).toHaveLength(2);
  expect(await read.entries()).toHaveLength(1);
  expect((await read.balances())[0].balance.minorUnits).toBe(10000);
});

test("a locked opening month rolls back the complete account setup and its receipt", async () => {
  const { t, workspaceId } = await fixture();
  await lock(t, workspaceId, { year: 2026, month: 9 });
  const before = await t.run(async (ctx) => ({
    profiles: await ctx.db.query("financialAccountProfiles").collect(),
    accounts: await ctx.db.query("ledgerAccounts").collect(),
  }));
  await expect(
    t.action(api.accounting.setupFinancialAccountProfile, {
      workspaceId,
      name: "Locked card",
      productKind: "creditCard",
      amount: { currency: "COP", minorUnits: 1000 },
      accountingDate: "2026-09-24",
      idempotencyKey: "locked-setup",
    }),
  ).rejects.toMatchObject({ data: { code: "locked_period" } });
  expect(
    await t.run(async (ctx) => ({
      profiles: await ctx.db.query("financialAccountProfiles").collect(),
      accounts: await ctx.db.query("ledgerAccounts").collect(),
    })),
  ).toEqual(before);
  expect(
    await t.run((ctx) => ctx.db.query("financialAccountSetups").collect()),
  ).toEqual([]);
});
