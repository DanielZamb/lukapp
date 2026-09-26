import { expect, test } from "vitest";
import { createMemoryAccountingCore } from "./accounting";

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

  expect(workspace.currentAccountingPeriod).toEqual({ year: 2026, month: 9 });
  expect(opened.currentAccountingPeriod).toEqual({ year: 2026, month: 9 });
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

test("owner can create a Financial Account Profile on their Workspace", async () => {
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
    productKind: "checking",
  });

  expect(profile.name).toBe("Daily");
  expect(profile.workspaceId).toBe(workspace.id);
});

test("a posted cash expense can be read back", async () => {
  const core = createMemoryAccountingCore();
  const actor = { userId: "owner-1" };
  const workspace = await core.createPersonalWorkspace({
    actor,
    functionalCurrency: "COP",
  });
  const daily = await core.createFinancialAccountProfile({
    actor,
    workspaceId: workspace.id,
    name: "Daily",
    productKind: "checking",
  });

  const posted = await core.recordCashExpense({
    actor,
    workspaceId: workspace.id,
    financialAccountProfileId: daily.id,
    amount: { currency: "COP", minorUnits: 150000 },
    accountingDate: "2026-09-24",
    description: "Groceries",
  });
  const activity = await core.listPostedActivity({
    actor,
    workspaceId: workspace.id,
  });

  expect(activity).toEqual([
    {
      id: posted.id,
      description: "Groceries",
      accountingDate: "2026-09-24",
      amount: { currency: "COP", minorUnits: 150000 },
    },
  ]);
});

test("a posted cash expense is balanced in Functional Currency", async () => {
  const core = createMemoryAccountingCore();
  const actor = { userId: "owner-1" };
  const workspace = await core.createPersonalWorkspace({
    actor,
    functionalCurrency: "COP",
  });
  const daily = await core.createFinancialAccountProfile({
    actor,
    workspaceId: workspace.id,
    name: "Daily",
    productKind: "checking",
  });

  await core.recordCashExpense({
    actor,
    workspaceId: workspace.id,
    financialAccountProfileId: daily.id,
    amount: { currency: "COP", minorUnits: 150000 },
    accountingDate: "2026-09-24",
    description: "Groceries",
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
  const core = createMemoryAccountingCore();
  const actor = { userId: "owner-1" };
  const workspace = await core.createPersonalWorkspace({
    actor,
    functionalCurrency: "COP",
  });
  const daily = await core.createFinancialAccountProfile({
    actor,
    workspaceId: workspace.id,
    name: "Daily",
    productKind: "checking",
  });

  expect(await core.balances({ actor, workspaceId: workspace.id })).toEqual([
    {
      financialAccountProfileId: daily.id,
      amount: { currency: "COP", minorUnits: 0 },
    },
  ]);

  await core.recordCashExpense({
    actor,
    workspaceId: workspace.id,
    financialAccountProfileId: daily.id,
    amount: { currency: "COP", minorUnits: 150000 },
    accountingDate: "2026-09-24",
    description: "Groceries",
  });

  expect(await core.balances({ actor, workspaceId: workspace.id })).toEqual([
    {
      financialAccountProfileId: daily.id,
      amount: { currency: "COP", minorUnits: -150000 },
    },
  ]);
});

test("a zero-amount cash expense cannot become Posted", async () => {
  const core = createMemoryAccountingCore();
  const actor = { userId: "owner-1" };
  const workspace = await core.createPersonalWorkspace({
    actor,
    functionalCurrency: "COP",
  });
  const daily = await core.createFinancialAccountProfile({
    actor,
    workspaceId: workspace.id,
    name: "Daily",
    productKind: "checking",
  });

  await expect(
    core.recordCashExpense({
      actor,
      workspaceId: workspace.id,
      financialAccountProfileId: daily.id,
      amount: { currency: "COP", minorUnits: 0 },
      accountingDate: "2026-09-24",
      description: "Groceries",
    }),
  ).rejects.toThrow("amount must be positive");

  expect(await core.listPostedActivity({ actor, workspaceId: workspace.id })).toEqual(
    [],
  );
  expect(await core.balances({ actor, workspaceId: workspace.id })).toEqual([
    {
      financialAccountProfileId: daily.id,
      amount: { currency: "COP", minorUnits: 0 },
    },
  ]);
});

test("a cash expense must use the Workspace Functional Currency", async () => {
  const core = createMemoryAccountingCore();
  const actor = { userId: "owner-1" };
  const workspace = await core.createPersonalWorkspace({
    actor,
    functionalCurrency: "COP",
  });
  const daily = await core.createFinancialAccountProfile({
    actor,
    workspaceId: workspace.id,
    name: "Daily",
    productKind: "checking",
  });

  await expect(
    core.recordCashExpense({
      actor,
      workspaceId: workspace.id,
      financialAccountProfileId: daily.id,
      amount: { currency: "USD", minorUnits: 100 },
      accountingDate: "2026-09-24",
      description: "Groceries",
    }),
  ).rejects.toThrow("Functional Currency required");

  expect(await core.listPostedActivity({ actor, workspaceId: workspace.id })).toEqual(
    [],
  );
});
