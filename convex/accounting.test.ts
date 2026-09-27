/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob([
  "./**/*.{js,ts}",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

function accountingDate(period: { year: number; month: number }) {
  return `${period.year}-${String(period.month).padStart(2, "0")}-15`;
}

test("Convex persists a posted cash expense, its profile, and its balances", async () => {
  const t = convexTest(schema, modules);
  const workspace = await t.mutation(api.accounting.createPersonalWorkspace, {
    userId: "owner-1",
    functionalCurrency: "COP",
  });
  const opened = await t.query(api.accounting.openWorkspace, {
    userId: "owner-1",
    workspaceId: workspace.id,
    now: Date.UTC(workspace.currentAccountingPeriod.year, workspace.currentAccountingPeriod.month - 1, 15),
  });
  expect(opened.currentAccountingPeriod).toEqual(workspace.currentAccountingPeriod);

  const daily = await t.mutation(api.accounting.createFinancialAccountProfile, {
    userId: "owner-1",
    workspaceId: workspace.id,
    name: "Daily",
  });
  const profiles = await t.query(api.accounting.listFinancialAccountProfiles, {
    userId: "owner-1",
    workspaceId: workspace.id,
  });
  expect(profiles).toEqual([daily]);

  const posted = await t.mutation(api.accounting.recordCashExpense, {
    userId: "owner-1",
    workspaceId: workspace.id,
    financialAccountProfileId: daily.id,
    amount: { currency: "COP", minorUnits: 150000 },
    accountingDate: accountingDate(workspace.currentAccountingPeriod),
    description: "Groceries",
    idempotencyKey: "groceries-1",
  });
  const again = await t.mutation(api.accounting.recordCashExpense, {
    userId: "owner-1",
    workspaceId: workspace.id,
    financialAccountProfileId: daily.id,
    amount: { currency: "COP", minorUnits: 150000 },
    accountingDate: accountingDate(workspace.currentAccountingPeriod),
    description: "Groceries",
    idempotencyKey: "groceries-1",
  });
  const activity = await t.query(api.accounting.listPostedCashExpenses, {
    userId: "owner-1",
    workspaceId: workspace.id,
  });
  const balances = await t.query(api.accounting.balances, {
    userId: "owner-1",
    workspaceId: workspace.id,
  });
  const trial = await t.query(api.accounting.trialBalance, {
    userId: "owner-1",
    workspaceId: workspace.id,
  });

  expect(again).toEqual({ ...posted, replay: true });
  expect(activity).toEqual([posted]);
  expect(posted.replay).toBe(false);
  expect(posted.financialAccountProfileName).toBe("Daily");
  expect(posted.lines.map((line) => line.name)).toEqual(["Expenses", "Daily"]);
  expect(balances).toEqual([
    {
      financialAccountProfileId: daily.id,
      name: "Daily",
      debitMinusCredit: { currency: "COP", minorUnits: -150000 },
    },
  ]);
  expect(
    trial.reduce((sum, row) => sum + row.debitMinorUnits - row.creditMinorUnits, 0),
  ).toBe(0);
});

test("Convex rejects a cash expense in a Locked Period and keeps live status", async () => {
  const t = convexTest(schema, modules);
  const workspace = await t.mutation(api.accounting.createPersonalWorkspace, {
    userId: "owner-1",
    functionalCurrency: "COP",
  });
  const daily = await t.mutation(api.accounting.createFinancialAccountProfile, {
    userId: "owner-1",
    workspaceId: workspace.id,
    name: "Daily",
  });
  const posted = await t.mutation(api.accounting.recordCashExpense, {
    userId: "owner-1",
    workspaceId: workspace.id,
    financialAccountProfileId: daily.id,
    amount: { currency: "COP", minorUnits: 100 },
    accountingDate: accountingDate(workspace.currentAccountingPeriod),
    description: "Coffee",
    idempotencyKey: "coffee",
  });
  await t.mutation(api.accounting.lockAccountingPeriod, {
    userId: "owner-1",
    workspaceId: workspace.id,
    period: {
      year: workspace.currentAccountingPeriod.year,
      month: workspace.currentAccountingPeriod.month,
    },
  });

  const lockedError = await t
    .mutation(api.accounting.recordCashExpense, {
      userId: "owner-1",
      workspaceId: workspace.id,
      financialAccountProfileId: daily.id,
      amount: { currency: "COP", minorUnits: 150000 },
      accountingDate: accountingDate(workspace.currentAccountingPeriod),
      description: "Groceries",
      idempotencyKey: "groceries",
    })
    .catch((error: unknown) => error);

  expect(lockedError).toMatchObject({
    data: { code: "locked_period", message: "Locked Period" },
  });

  const activity = await t.query(api.accounting.listPostedCashExpenses, {
    userId: "owner-1",
    workspaceId: workspace.id,
  });
  expect(activity).toEqual([
    {
      ...posted,
      accountingPeriod: {
        ...posted.accountingPeriod,
        status: "locked",
      },
    },
  ]);
});
