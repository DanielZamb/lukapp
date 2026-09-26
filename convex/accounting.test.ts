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

test("Convex persists a posted cash expense and its balances", async () => {
  const t = convexTest(schema, modules);
  const workspace = await t.mutation(api.accounting.createPersonalWorkspace, {
    userId: "owner-1",
    functionalCurrency: "COP",
  });
  const opened = await t.query(api.accounting.openWorkspace, {
    userId: "owner-1",
    workspaceId: workspace.id,
  });
  expect(opened.id).toBe(workspace.id);
  expect(opened.currentAccountingPeriod).toEqual(
    workspace.currentAccountingPeriod,
  );
  const daily = await t.mutation(api.accounting.createFinancialAccountProfile, {
    userId: "owner-1",
    workspaceId: workspace.id,
    name: "Daily",
    productKind: "checking",
  });
  const posted = await t.mutation(api.accounting.recordCashExpense, {
    userId: "owner-1",
    workspaceId: workspace.id,
    financialAccountProfileId: daily.id,
    amount: { currency: "COP", minorUnits: 150000 },
    accountingDate: "2026-09-24",
    description: "Groceries",
  });
  const activity = await t.query(api.accounting.listPostedActivity, {
    userId: "owner-1",
    workspaceId: workspace.id,
  });
  const balances = await t.query(api.accounting.balances, {
    userId: "owner-1",
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
  expect(balances).toEqual([
    {
      financialAccountProfileId: daily.id,
      amount: { currency: "COP", minorUnits: -150000 },
    },
  ]);
});
