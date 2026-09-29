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

test("a Personal Workspace starts from the sparse PUC Chart of Accounts in Spanish", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);

  const accounts = await reader(t, workspace.id).ledgerAccounts();

  expect(workspace.chartOfAccountsTemplate).toBe("co-puc-personal@1");
  expect(accounts.map(({ code, name, nature, normalSide }) => ({ code, name, nature, normalSide }))).toEqual([
    { code: "11100501", name: "Daily", nature: "Asset", normalSide: "Debit" },
    { code: "313001", name: "Patrimonio de apertura", nature: "Equity", normalSide: "Credit" },
    { code: "42959595", name: "Otros ingresos", nature: "Revenue", normalSide: "Credit" },
    { code: "51959595", name: "Otros gastos personales", nature: "Expense", normalSide: "Debit" },
  ]);
  expect(accounts[0]).toEqual({
    id: daily.ledgerAccountId,
    code: "11100501",
    name: "Daily",
    nature: "Asset",
    normalSide: "Debit",
    role: "Posting",
    financialAccountProfileId: daily.id,
  });
});

test("a cash expense posts to the chosen PUC expense account, activated once", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);

  const fee = await t.mutation(api.accounting.recordCashExpense, {
    ...groceries(workspace.id, daily.id, { amount: 1490000, description: "Cuota de manejo" }),
    ledgerAccountCode: "530505",
  });
  await t.mutation(api.accounting.recordCashExpense, {
    ...groceries(workspace.id, daily.id, { amount: 600000, idempotencyKey: "fee-2" }),
    ledgerAccountCode: "530505",
  });
  const accounts = await reader(t, workspace.id).ledgerAccounts();

  expect(fee.lines.map(({ code, name, nature, debitMinorUnits, creditMinorUnits }) => ({
    code, name, nature, debitMinorUnits, creditMinorUnits,
  }))).toEqual([
    { code: "530505", name: "Gastos bancarios", nature: "Expense", debitMinorUnits: 1490000, creditMinorUnits: 0 },
    { code: "11100501", name: "Daily", nature: "Asset", debitMinorUnits: 0, creditMinorUnits: 1490000 },
  ]);
  expect(accounts.filter((account) => account.code === "530505")).toEqual([
    { id: fee.lines[0]?.ledgerAccountId, code: "530505", name: "Gastos bancarios", nature: "Expense", normalSide: "Debit", role: "Posting" },
  ]);
});

test("a cash expense without a code posts to Otros gastos personales", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);

  const posted = await t.mutation(api.accounting.recordCashExpense, groceries(workspace.id, daily.id));

  expect(posted.lines[0]).toMatchObject({ code: "51959595", name: "Otros gastos personales" });
});

test("a cash expense only reaches accounts the template allows for cash expenses", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  const before = await reader(t, workspace.id).ledgerAccounts();

  const attempts = await Promise.all(
    ["137010", "516005", "421005", "313001", "999999", "11100501", ""].map((ledgerAccountCode) =>
      caught(
        t.mutation(api.accounting.recordCashExpense, {
          ...groceries(workspace.id, daily.id, { idempotencyKey: `bad-${ledgerAccountCode}` }),
          ledgerAccountCode,
        }),
      ),
    ),
  );

  expect(attempts.map((error) => (error as { data: { code: string } }).data.code)).toEqual([
    "cash_expense_account_invalid",
    "cash_expense_account_invalid",
    "cash_expense_account_invalid",
    "cash_expense_account_invalid",
    "ledger_account_code_unknown",
    "ledger_account_code_unknown",
    "ledger_account_code_unknown",
  ]);
  expect(await reader(t, workspace.id).entries()).toEqual([]);
  expect(await reader(t, workspace.id).ledgerAccounts()).toEqual(before);
});

test("cash income posts to the chosen PUC income account and refuses expense accounts", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const nu = await createProfile(t, workspace.id, "Nu", "bankAccount");

  const interest = await t.mutation(api.accounting.recordCashIncome, {
    ...groceries(workspace.id, nu.id, { amount: 40909663, description: "Rendimientos Nu" }),
    ledgerAccountCode: "421005",
  });
  const salary = await t.mutation(api.accounting.recordCashIncome, {
    ...groceries(workspace.id, nu.id, { idempotencyKey: "salary" }),
    ledgerAccountCode: "42959501",
  });
  const wrong = await caught(
    t.mutation(api.accounting.recordCashIncome, {
      ...groceries(workspace.id, nu.id, { idempotencyKey: "wrong" }),
      ledgerAccountCode: "530520",
    }),
  );

  expect(interest.lines.map(({ code, name, nature }) => ({ code, name, nature }))).toEqual([
    { code: "11100501", name: "Nu", nature: "Asset" },
    { code: "421005", name: "Intereses", nature: "Revenue" },
  ]);
  expect(salary.lines[1]).toMatchObject({ code: "42959501", name: "Salario", creditMinorUnits: 150000 });
  expect(wrong).toMatchObject({ data: { code: "cash_income_account_invalid" } });
});

test("each profile gets the next auxiliary account under its PUC parent", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);

  const profiles = [
    await createProfile(t, workspace.id, "Nu", "savingsAccount"),
    await createProfile(t, workspace.id, "Davivienda", "bankAccount"),
    await createProfile(t, workspace.id, "Bancolombia ahorros", "savingsAccount"),
    await createProfile(t, workspace.id, "Efectivo", "cash"),
    await createProfile(t, workspace.id, "TDC Banco de Bogotá", "creditCard"),
    await createProfile(t, workspace.id, "Crédito hipotecario", "loan"),
  ];
  const accounts = await reader(t, workspace.id).ledgerAccounts();

  expect(profiles.map((profile) => {
    const account = accounts.find((candidate) => candidate.id === profile.ledgerAccountId);
    return [account?.code, account?.name, account?.nature, account?.normalSide];
  })).toEqual([
    ["11200501", "Nu", "Asset", "Debit"],
    ["11100501", "Davivienda", "Asset", "Debit"],
    ["11200502", "Bancolombia ahorros", "Asset", "Debit"],
    ["11050501", "Efectivo", "Asset", "Debit"],
    ["21051001", "TDC Banco de Bogotá", "Liability", "Credit"],
    ["21051002", "Crédito hipotecario", "Liability", "Credit"],
  ]);
});

test("a PUC parent holds at most 99 auxiliary accounts", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  for (let index = 1; index <= 99; index += 1) {
    await createProfile(t, workspace.id, `Caja ${index}`, "cash");
  }

  const full = await caught(createProfile(t, workspace.id, "Caja 100", "cash"));
  const accounts = await reader(t, workspace.id).ledgerAccounts();

  expect(full).toMatchObject({ data: { code: "auxiliary_accounts_exhausted" } });
  expect(accounts.map((account) => account.code)).toContain("11050599");
  expect(accounts).toHaveLength(102);
});

test("the catalog lists template accounts with their PUC levels, nature, and activation", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const accounts = await reader(t, workspace.id).ledgerAccounts();

  const catalog = await t.query(api.accounting.listCatalogAccounts, {
    userId: "owner-1",
    workspaceId: workspace.id,
  });

  expect(catalog.find((account) => account.code === "51959501")).toEqual({
    code: "51959501",
    name: "Mercado y alimentos del hogar",
    nature: "Expense",
    normalSide: "Debit",
    use: "expense",
    ancestors: [
      { code: "5", name: "Gastos" },
      { code: "51", name: "Operacionales de administración" },
      { code: "5195", name: "Diversos" },
      { code: "519595", name: "Otros" },
    ],
  });
  expect(catalog.find((account) => account.code === "159235")).toMatchObject({
    nature: "Asset",
    normalSide: "Credit",
    use: "general",
  });
  expect(catalog.find((account) => account.code === "51959595")?.ledgerAccountId).toBe(
    accounts.find((account) => account.code === "51959595")?.id,
  );
});

test("the trial balance lists accounts in PUC code order with their codes", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  await t.mutation(api.accounting.recordCashIncome, {
    ...groceries(workspace.id, daily.id, { amount: 500000, idempotencyKey: "in" }),
    ledgerAccountCode: "421005",
  });
  await t.mutation(api.accounting.recordCashExpense, {
    ...groceries(workspace.id, daily.id, { amount: 1000 }),
    ledgerAccountCode: "51159501",
  });

  const trial = await reader(t, workspace.id).trialBalance();

  expect(trial.map(({ code, debitMinorUnits, creditMinorUnits }) => [code, debitMinorUnits, creditMinorUnits])).toEqual([
    ["11100501", 500000, 1000],
    ["421005", 0, 500000],
    ["51159501", 1000, 0],
  ]);
});

test("a Workspace can start from the English US GAAP template instead", async () => {
  const t = testdb();
  const workspace = await t.mutation(api.accounting.createPersonalWorkspace, {
    userId: "owner-1",
    functionalCurrency: "USD",
    now: Date.UTC(2026, 8, 24),
    chartOfAccountsTemplate: "us-gaap-personal@1",
  });
  const checking = await createProfile(t, workspace.id, "Checking", "bankAccount");
  const card = await createProfile(t, workspace.id, "Visa", "creditCard");
  await createProfile(t, workspace.id, "High-yield savings", "savingsAccount");

  const fee = await t.mutation(api.accounting.recordCashExpense, {
    ...groceries(workspace.id, checking.id),
    amount: { currency: "USD", minorUnits: 1200 },
    ledgerAccountCode: "6010",
  });
  const pucCode = await caught(
    t.mutation(api.accounting.recordCashExpense, {
      ...groceries(workspace.id, checking.id, { idempotencyKey: "puc" }),
      amount: { currency: "USD", minorUnits: 1200 },
      ledgerAccountCode: "530505",
    }),
  );
  const accounts = await reader(t, workspace.id).ledgerAccounts();
  const catalog = await t.query(api.accounting.listCatalogAccounts, {
    userId: "owner-1",
    workspaceId: workspace.id,
  });

  expect(workspace.chartOfAccountsTemplate).toBe("us-gaap-personal@1");
  expect(accounts.map(({ code, name, nature, normalSide }) => [code, name, nature, normalSide])).toEqual([
    ["102001", "Checking", "Asset", "Debit"],
    ["103001", "High-yield savings", "Asset", "Debit"],
    ["201001", "Visa", "Liability", "Credit"],
    ["3010", "Opening balance equity", "Equity", "Credit"],
    ["4990", "Other income", "Revenue", "Credit"],
    ["5599", "Other personal expenses", "Expense", "Debit"],
    ["6010", "Bank fees", "Expense", "Debit"],
  ]);
  expect(accounts.find((account) => account.id === card.ledgerAccountId)?.code).toBe("201001");
  expect(fee.lines[0]).toMatchObject({ code: "6010", name: "Bank fees" });
  expect(pucCode).toMatchObject({ data: { code: "ledger_account_code_unknown" } });
  expect(catalog.find((account) => account.code === "6030")).toEqual({
    code: "6030",
    name: "Interest expense",
    nature: "Expense",
    normalSide: "Debit",
    use: "expense",
    reportingConcept: "us-gaap:InterestExpense",
    ancestors: [
      { code: "6", name: "Financial and other expenses" },
      { code: "60", name: "Financial costs" },
    ],
  });
});

test("a Workspace cannot start from an unknown COA Template", async () => {
  const t = testdb();

  const error = await caught(
    t.mutation(api.accounting.createPersonalWorkspace, {
      userId: "owner-1",
      functionalCurrency: "COP",
      now: Date.UTC(2026, 8, 24),
      chartOfAccountsTemplate: "personal@1",
    }),
  );

  expect(error).toMatchObject({ data: { code: "chart_of_accounts_template_unknown" } });
});
