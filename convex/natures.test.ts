/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  caught,
  convexAccounting,
  createDaily,
  createOwnedWorkspace,
  createProfile,
  groceries,
  owner,
  reader,
} from "../src/accounting/convexHarness";

const modules = import.meta.glob([
  "./**/*.{js,ts}",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

function testdb() {
  return convexAccounting(modules);
}

test("cash income debits the profile and credits Otros ingresos", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);

  const salary = await t.mutation(
    api.accounting.recordCashIncome,
    groceries(workspace.id, daily.id, {
      amount: 4000000,
      description: "Salary",
      idempotencyKey: "salary-sept",
    }),
  );
  const [balance] = await reader(t, workspace.id).balances();

  expect(salary.policy).toBe("cash-income@1");
  expect(salary.lines.map(({ name, nature, debitMinorUnits, creditMinorUnits }) => ({
    name,
    nature,
    debitMinorUnits,
    creditMinorUnits,
  }))).toEqual([
    { name: "Daily", nature: "Asset", debitMinorUnits: 4000000, creditMinorUnits: 0 },
    { name: "Otros ingresos", nature: "Revenue", debitMinorUnits: 0, creditMinorUnits: 4000000 },
  ]);
  expect(balance?.balance).toEqual({ currency: "COP", minorUnits: 4000000 });
});

test("a card purchase grows a Liability, shown as money owed", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const card = await createProfile(t, workspace.id, "Visa", "creditCard");
  const loan = await createProfile(t, workspace.id, "Car loan", "loan");

  await t.mutation(api.accounting.recordCashExpense, groceries(workspace.id, card.id));
  const balances = await reader(t, workspace.id).balances();

  expect(card.productKind).toBe("creditCard");
  expect(balances).toEqual([
    {
      financialAccountProfileId: card.id,
      name: "Visa",
      nature: "Liability",
      debitMinorUnits: 0,
      creditMinorUnits: 150000,
      balance: { currency: "COP", minorUnits: 150000 },
    },
    {
      financialAccountProfileId: loan.id,
      name: "Car loan",
      nature: "Liability",
      debitMinorUnits: 0,
      creditMinorUnits: 0,
      balance: { currency: "COP", minorUnits: 0 },
    },
  ]);
});

test("the trial balance names each account by id and nature, even with duplicate names", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const confusing = await createProfile(t, workspace.id, "Otros gastos personales", "cash");

  await t.mutation(api.accounting.recordCashExpense, groceries(workspace.id, confusing.id));
  const trial = await reader(t, workspace.id).trialBalance();

  expect(trial.map(({ code, name, nature }) => ({ code, name, nature }))).toEqual([
    { code: "11050501", name: "Otros gastos personales", nature: "Asset" },
    { code: "51959595", name: "Otros gastos personales", nature: "Expense" },
  ]);
  expect(new Set(trial.map((row) => row.ledgerAccountId)).size).toBe(2);
});

test("a profile needs a name, and names are trimmed", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);

  const blank = await caught(createProfile(t, workspace.id, "   ", "cash"));
  const wallet = await createProfile(t, workspace.id, "  Wallet ", "cash");

  expect(blank).toMatchObject({ data: { code: "name_required" } });
  expect(wallet.name).toBe("Wallet");
});

test("a Workspace needs an active ISO 4217 Functional Currency", async () => {
  const t = testdb();

  for (const functionalCurrency of ["", "cop", "PESOS", "ZZZ"]) {
    const error = await caught(
      t.mutation(api.accounting.createPersonalWorkspace, {
        userId: owner.userId,
        functionalCurrency,
        now: Date.UTC(2026, 8, 24),
      }),
    );
    expect(error).toMatchObject({ data: { code: "functional_currency_invalid" } });
  }
});

test("malformed ids read as missing rather than crashing", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);

  const profile = await caught(
    t.mutation(api.accounting.recordCashExpense, groceries(workspace.id, "not-an-id")),
  );
  const wrongTable = await caught(
    t.mutation(api.accounting.recordCashExpense, groceries(workspace.id, workspace.id)),
  );
  const noWorkspace = await caught(
    t.query(api.accounting.balances, { userId: owner.userId, workspaceId: "garbage" }),
  );

  expect(profile).toMatchObject({ data: { code: "financial_account_profile_not_found" } });
  expect(wrongTable).toMatchObject({ data: { code: "financial_account_profile_not_found" } });
  expect(noWorkspace).toMatchObject({ data: { code: "workspace_membership_required" } });
});

test("cash activity cannot use another Workspace's profile", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const other = await createOwnedWorkspace(t);
  const otherDaily = await createDaily(t, other.id);

  const error = await caught(
    t.mutation(api.accounting.recordCashIncome, groceries(workspace.id, otherDaily.id)),
  );

  expect(error).toMatchObject({ data: { code: "financial_account_profile_not_found" } });
  expect(await reader(t, workspace.id).entries()).toEqual([]);
});
