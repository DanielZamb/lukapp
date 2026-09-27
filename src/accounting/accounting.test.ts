import { expect, test } from "vitest";
import { AccountingError, createMemoryAccountingCore } from "./accounting";

test("owner can create a Personal Workspace and open it", async () => {
  const core = createMemoryAccountingCore();
  const actor = { userId: "owner-1" };

  const workspace = await core.createPersonalWorkspace({
    actor,
    functionalCurrency: "COP",
  });
  const opened = await core.openWorkspace({
    actor,
    workspaceId: workspace.id,
  });

  expect(opened.id).toBe(workspace.id);
  expect(opened.kind).toBe("Personal");
  expect(opened.functionalCurrency).toBe("COP");
});

test("a Personal Workspace opens with the current Accounting Period", async () => {
  const core = createMemoryAccountingCore({
    now: () => new Date("2026-09-24T15:00:00.000Z"),
  });
  const actor = { userId: "owner-1" };
  const workspace = await core.createPersonalWorkspace({
    actor,
    functionalCurrency: "COP",
  });
  const opened = await core.openWorkspace({
    actor,
    workspaceId: workspace.id,
  });

  expect(workspace.currentAccountingPeriod).toEqual({
    year: 2026,
    month: 9,
    status: "open",
  });
  expect(opened.currentAccountingPeriod).toEqual({
    year: 2026,
    month: 9,
    status: "open",
  });
});

test("a later month stays not opened until a cash expense posts into it", async () => {
  let now = new Date("2026-09-24T15:00:00.000Z");
  const core = createMemoryAccountingCore({ now: () => now });
  const actor = { userId: "owner-1" };
  const workspace = await core.createPersonalWorkspace({
    actor,
    functionalCurrency: "COP",
  });

  now = new Date("2026-10-02T12:00:00.000Z");
  const opened = await core.openWorkspace({
    actor,
    workspaceId: workspace.id,
  });

  expect(opened.currentAccountingPeriod).toEqual({
    year: 2026,
    month: 10,
    status: "not_opened",
  });

  const daily = await core.createFinancialAccountProfile({
    actor,
    workspaceId: workspace.id,
    name: "Daily",
  });
  const posted = await core.recordCashExpense({
    actor,
    workspaceId: workspace.id,
    financialAccountProfileId: daily.id,
    amount: { currency: "COP", minorUnits: 150000 },
    accountingDate: "2026-10-02",
    description: "Groceries",
    idempotencyKey: "oct-groceries",
  });
  const reopened = await core.openWorkspace({
    actor,
    workspaceId: workspace.id,
  });

  expect(posted.accountingPeriod).toEqual({ year: 2026, month: 10, status: "open" });
  expect(reopened.currentAccountingPeriod).toEqual({
    year: 2026,
    month: 10,
    status: "open",
  });
});

test("a stranger cannot open another person's Workspace", async () => {
  const core = createMemoryAccountingCore();
  const workspace = await core.createPersonalWorkspace({
    actor: { userId: "owner-1" },
    functionalCurrency: "COP",
  });

  await expect(
    core.openWorkspace({
      actor: { userId: "stranger-2" },
      workspaceId: workspace.id,
    }),
  ).rejects.toThrow("Workspace Membership required");
});

test("owner can create and list a Financial Account Profile", async () => {
  const core = createMemoryAccountingCore();
  const actor = { userId: "owner-1" };
  const workspace = await core.createPersonalWorkspace({
    actor,
    functionalCurrency: "COP",
  });

  const profile = await core.createFinancialAccountProfile({
    actor,
    workspaceId: workspace.id,
    name: "Daily",
  });
  const profiles = await core.listFinancialAccountProfiles({
    actor,
    workspaceId: workspace.id,
  });

  expect(profile.name).toBe("Daily");
  expect(profile.workspaceId).toBe(workspace.id);
  expect(profiles).toEqual([profile]);
});

test("a posted cash expense can be read back with its profile and lines", async () => {
  const core = createMemoryAccountingCore({
    now: () => new Date("2026-09-24T15:00:00.000Z"),
  });
  const actor = { userId: "owner-1" };
  const workspace = await core.createPersonalWorkspace({
    actor,
    functionalCurrency: "COP",
  });
  const daily = await core.createFinancialAccountProfile({
    actor,
    workspaceId: workspace.id,
    name: "Daily",
  });

  const posted = await core.recordCashExpense({
    actor,
    workspaceId: workspace.id,
    financialAccountProfileId: daily.id,
    amount: { currency: "COP", minorUnits: 150000 },
    accountingDate: "2026-09-24",
    description: "Groceries",
    idempotencyKey: "groceries-1",
  });
  const activity = await core.listPostedCashExpenses({
    actor,
    workspaceId: workspace.id,
  });

  expect(activity).toEqual([posted]);
  expect(posted.financialAccountProfileName).toBe("Daily");
  expect(posted.replay).toBe(false);
  expect(posted.lines.map((line) => line.name)).toEqual(["Expenses", "Daily"]);
  expect(posted.lines.map((line) => line.journalEntryId)).toEqual([
    posted.id,
    posted.id,
  ]);
  expect(
    posted.lines.reduce((sum, line) => sum + line.debitMinorUnits, 0),
  ).toBe(posted.lines.reduce((sum, line) => sum + line.creditMinorUnits, 0));
});

test("a posted cash expense is recognized in the Accounting Period of its Accounting Date", async () => {
  const core = createMemoryAccountingCore({
    now: () => new Date("2026-10-02T12:00:00.000Z"),
  });
  const actor = { userId: "owner-1" };
  const workspace = await core.createPersonalWorkspace({
    actor,
    functionalCurrency: "COP",
  });
  const daily = await core.createFinancialAccountProfile({
    actor,
    workspaceId: workspace.id,
    name: "Daily",
  });

  const posted = await core.recordCashExpense({
    actor,
    workspaceId: workspace.id,
    financialAccountProfileId: daily.id,
    amount: { currency: "COP", minorUnits: 150000 },
    accountingDate: "2026-09-24",
    description: "Groceries",
    idempotencyKey: "sept-groceries",
  });

  expect(posted.accountingPeriod).toEqual({ year: 2026, month: 9, status: "open" });
  expect(workspace.currentAccountingPeriod).toEqual({
    year: 2026,
    month: 10,
    status: "open",
  });
});

test("a posted cash expense reports the live Accounting Period status", async () => {
  const core = createMemoryAccountingCore({
    now: () => new Date("2026-09-24T15:00:00.000Z"),
  });
  const actor = { userId: "owner-1" };
  const workspace = await core.createPersonalWorkspace({
    actor,
    functionalCurrency: "COP",
  });
  const daily = await core.createFinancialAccountProfile({
    actor,
    workspaceId: workspace.id,
    name: "Daily",
  });
  await core.recordCashExpense({
    actor,
    workspaceId: workspace.id,
    financialAccountProfileId: daily.id,
    amount: { currency: "COP", minorUnits: 150000 },
    accountingDate: "2026-09-24",
    description: "Groceries",
    idempotencyKey: "groceries-1",
  });
  await core.lockAccountingPeriod({
    actor,
    workspaceId: workspace.id,
    period: { year: 2026, month: 9 },
  });

  const [posted] = await core.listPostedCashExpenses({
    actor,
    workspaceId: workspace.id,
  });

  expect(posted?.accountingPeriod).toEqual({
    year: 2026,
    month: 9,
    status: "locked",
  });
});

test("repeating an idempotency key posts the cash expense once", async () => {
  const core = createMemoryAccountingCore({
    now: () => new Date("2026-09-24T15:00:00.000Z"),
  });
  const actor = { userId: "owner-1" };
  const workspace = await core.createPersonalWorkspace({
    actor,
    functionalCurrency: "COP",
  });
  const daily = await core.createFinancialAccountProfile({
    actor,
    workspaceId: workspace.id,
    name: "Daily",
  });
  const input = {
    actor,
    workspaceId: workspace.id,
    financialAccountProfileId: daily.id,
    amount: { currency: "COP", minorUnits: 150000 },
    accountingDate: "2026-09-24",
    description: "Groceries",
    idempotencyKey: "groceries-1",
  };

  const first = await core.recordCashExpense(input);
  const second = await core.recordCashExpense(input);

  expect(first.replay).toBe(false);
  expect(second).toEqual({ ...first, replay: true });
  expect(
    await core.listPostedCashExpenses({ actor, workspaceId: workspace.id }),
  ).toEqual([first]);
  expect(await core.balances({ actor, workspaceId: workspace.id })).toEqual([
    {
      financialAccountProfileId: daily.id,
      name: "Daily",
      debitMinusCredit: { currency: "COP", minorUnits: -150000 },
    },
  ]);
});

test("an idempotency key cannot post a different cash expense", async () => {
  const core = createMemoryAccountingCore({
    now: () => new Date("2026-09-24T15:00:00.000Z"),
  });
  const actor = { userId: "owner-1" };
  const workspace = await core.createPersonalWorkspace({
    actor,
    functionalCurrency: "COP",
  });
  const daily = await core.createFinancialAccountProfile({
    actor,
    workspaceId: workspace.id,
    name: "Daily",
  });
  await core.recordCashExpense({
    actor,
    workspaceId: workspace.id,
    financialAccountProfileId: daily.id,
    amount: { currency: "COP", minorUnits: 150000 },
    accountingDate: "2026-09-24",
    description: "Groceries",
    idempotencyKey: "groceries-1",
  });

  await expect(
    core.recordCashExpense({
      actor,
      workspaceId: workspace.id,
      financialAccountProfileId: daily.id,
      amount: { currency: "COP", minorUnits: 1 },
      accountingDate: "2026-09-20",
      description: "Rent",
      idempotencyKey: "groceries-1",
    }),
  ).rejects.toMatchObject({ code: "idempotency_key_conflict" });
});

test("a posted cash expense is balanced in Functional Currency", async () => {
  const core = createMemoryAccountingCore({
    now: () => new Date("2026-09-24T15:00:00.000Z"),
  });
  const actor = { userId: "owner-1" };
  const workspace = await core.createPersonalWorkspace({
    actor,
    functionalCurrency: "COP",
  });
  const daily = await core.createFinancialAccountProfile({
    actor,
    workspaceId: workspace.id,
    name: "Daily",
  });

  await core.recordCashExpense({
    actor,
    workspaceId: workspace.id,
    financialAccountProfileId: daily.id,
    amount: { currency: "COP", minorUnits: 150000 },
    accountingDate: "2026-09-24",
    description: "Groceries",
    idempotencyKey: "groceries-1",
  });

  const trial = await core.trialBalance({ actor, workspaceId: workspace.id });
  const net = trial.reduce(
    (sum, row) => sum + row.debitMinorUnits - row.creditMinorUnits,
    0,
  );

  expect(net).toBe(0);
  expect(trial).toContainEqual({
    name: "Expenses",
    debitMinorUnits: 150000,
    creditMinorUnits: 0,
  });
  expect(trial).toContainEqual({
    name: "Daily",
    debitMinorUnits: 0,
    creditMinorUnits: 150000,
  });
});

test("balances move only after a cash expense is posted", async () => {
  const core = createMemoryAccountingCore({
    now: () => new Date("2026-09-24T15:00:00.000Z"),
  });
  const actor = { userId: "owner-1" };
  const workspace = await core.createPersonalWorkspace({
    actor,
    functionalCurrency: "COP",
  });
  const daily = await core.createFinancialAccountProfile({
    actor,
    workspaceId: workspace.id,
    name: "Daily",
  });

  expect(await core.balances({ actor, workspaceId: workspace.id })).toEqual([
    {
      financialAccountProfileId: daily.id,
      name: "Daily",
      debitMinusCredit: { currency: "COP", minorUnits: 0 },
    },
  ]);

  await core.recordCashExpense({
    actor,
    workspaceId: workspace.id,
    financialAccountProfileId: daily.id,
    amount: { currency: "COP", minorUnits: 150000 },
    accountingDate: "2026-09-24",
    description: "Groceries",
    idempotencyKey: "groceries-1",
  });

  expect(await core.balances({ actor, workspaceId: workspace.id })).toEqual([
    {
      financialAccountProfileId: daily.id,
      name: "Daily",
      debitMinusCredit: { currency: "COP", minorUnits: -150000 },
    },
  ]);
});

test("a zero-amount cash expense cannot become Posted", async () => {
  const core = createMemoryAccountingCore({
    now: () => new Date("2026-09-24T15:00:00.000Z"),
  });
  const actor = { userId: "owner-1" };
  const workspace = await core.createPersonalWorkspace({
    actor,
    functionalCurrency: "COP",
  });
  const daily = await core.createFinancialAccountProfile({
    actor,
    workspaceId: workspace.id,
    name: "Daily",
  });

  await expect(
    core.recordCashExpense({
      actor,
      workspaceId: workspace.id,
      financialAccountProfileId: daily.id,
      amount: { currency: "COP", minorUnits: 0 },
      accountingDate: "2026-09-24",
      description: "Groceries",
      idempotencyKey: "groceries-0",
    }),
  ).rejects.toMatchObject({ code: "amount_must_be_positive" });

  expect(
    await core.listPostedCashExpenses({ actor, workspaceId: workspace.id }),
  ).toEqual([]);
});

test("a cash expense cannot become Posted in a Locked Period", async () => {
  const core = createMemoryAccountingCore({
    now: () => new Date("2026-09-24T15:00:00.000Z"),
  });
  const actor = { userId: "owner-1" };
  const workspace = await core.createPersonalWorkspace({
    actor,
    functionalCurrency: "COP",
  });
  const daily = await core.createFinancialAccountProfile({
    actor,
    workspaceId: workspace.id,
    name: "Daily",
  });

  await core.lockAccountingPeriod({
    actor,
    workspaceId: workspace.id,
    period: { year: 2026, month: 9 },
  });

  const error = await core
    .recordCashExpense({
      actor,
      workspaceId: workspace.id,
      financialAccountProfileId: daily.id,
      amount: { currency: "COP", minorUnits: 150000 },
      accountingDate: "2026-09-24",
      description: "Groceries",
      idempotencyKey: "groceries-1",
    })
    .catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(AccountingError);
  expect(error).toMatchObject({ code: "locked_period" });
  expect(
    await core.listPostedCashExpenses({ actor, workspaceId: workspace.id }),
  ).toEqual([]);
  expect(await core.balances({ actor, workspaceId: workspace.id })).toEqual([
    {
      financialAccountProfileId: daily.id,
      name: "Daily",
      debitMinusCredit: { currency: "COP", minorUnits: 0 },
    },
  ]);
});

test("an invalid Accounting Date cannot become Posted", async () => {
  const core = createMemoryAccountingCore({
    now: () => new Date("2026-09-24T15:00:00.000Z"),
  });
  const actor = { userId: "owner-1" };
  const workspace = await core.createPersonalWorkspace({
    actor,
    functionalCurrency: "COP",
  });
  const daily = await core.createFinancialAccountProfile({
    actor,
    workspaceId: workspace.id,
    name: "Daily",
  });

  await expect(
    core.recordCashExpense({
      actor,
      workspaceId: workspace.id,
      financialAccountProfileId: daily.id,
      amount: { currency: "COP", minorUnits: 150000 },
      accountingDate: "2026-09-31",
      description: "Groceries",
      idempotencyKey: "bad-date",
    }),
  ).rejects.toMatchObject({ code: "accounting_date_required" });
});

test("a cash expense must use the Workspace Functional Currency", async () => {
  const core = createMemoryAccountingCore({
    now: () => new Date("2026-09-24T15:00:00.000Z"),
  });
  const actor = { userId: "owner-1" };
  const workspace = await core.createPersonalWorkspace({
    actor,
    functionalCurrency: "COP",
  });
  const daily = await core.createFinancialAccountProfile({
    actor,
    workspaceId: workspace.id,
    name: "Daily",
  });

  await expect(
    core.recordCashExpense({
      actor,
      workspaceId: workspace.id,
      financialAccountProfileId: daily.id,
      amount: { currency: "USD", minorUnits: 100 },
      accountingDate: "2026-09-24",
      description: "Groceries",
      idempotencyKey: "usd",
    }),
  ).rejects.toThrow("Functional Currency required");
});

test("two cash expenses in one month share one Accounting Period", async () => {
  const core = createMemoryAccountingCore({
    now: () => new Date("2026-09-24T15:00:00.000Z"),
  });
  const actor = { userId: "owner-1" };
  const workspace = await core.createPersonalWorkspace({
    actor,
    functionalCurrency: "COP",
  });
  const daily = await core.createFinancialAccountProfile({
    actor,
    workspaceId: workspace.id,
    name: "Daily",
  });
  await core.recordCashExpense({
    actor,
    workspaceId: workspace.id,
    financialAccountProfileId: daily.id,
    amount: { currency: "COP", minorUnits: 100 },
    accountingDate: "2026-09-01",
    description: "Coffee",
    idempotencyKey: "coffee",
  });
  await core.recordCashExpense({
    actor,
    workspaceId: workspace.id,
    financialAccountProfileId: daily.id,
    amount: { currency: "COP", minorUnits: 200 },
    accountingDate: "2026-09-02",
    description: "Tea",
    idempotencyKey: "tea",
  });
  await core.lockAccountingPeriod({
    actor,
    workspaceId: workspace.id,
    period: { year: 2026, month: 9 },
  });

  await expect(
    core.recordCashExpense({
      actor,
      workspaceId: workspace.id,
      financialAccountProfileId: daily.id,
      amount: { currency: "COP", minorUnits: 300 },
      accountingDate: "2026-09-03",
      description: "Milk",
      idempotencyKey: "milk",
    }),
  ).rejects.toMatchObject({ code: "locked_period" });
});
