/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  convexAccounting,
  createDaily,
  createOwnedWorkspace,
  groceries,
  owner,
} from "../src/accounting/convexHarness";

const modules = import.meta.glob([
  "./**/*.{js,ts}",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

function testdb() {
  return convexAccounting(modules);
}

test("a posted cash expense can be read back with its profile and lines", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  const posted = await t.mutation(
    api.accounting.recordCashExpense,
    groceries(workspace.id, daily.id),
  );
  const activity = await t.query(api.accounting.listPostedCashExpenses, {
    userId: owner.userId,
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

test("repeating an idempotency key posts the cash expense once", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  const input = groceries(workspace.id, daily.id);

  const first = await t.mutation(api.accounting.recordCashExpense, input);
  const second = await t.mutation(api.accounting.recordCashExpense, input);
  const activity = await t.query(api.accounting.listPostedCashExpenses, {
    userId: owner.userId,
    workspaceId: workspace.id,
  });
  const balances = await t.query(api.accounting.balances, {
    userId: owner.userId,
    workspaceId: workspace.id,
  });

  expect(first.replay).toBe(false);
  expect(second).toEqual({ ...first, replay: true });
  expect(activity).toEqual([first]);
  expect(balances).toEqual([
    {
      financialAccountProfileId: daily.id,
      name: "Daily",
      debitMinusCredit: { currency: "COP", minorUnits: -150000 },
    },
  ]);
});

test("an idempotency key cannot replay a different currency", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  await t.mutation(
    api.accounting.recordCashExpense,
    groceries(workspace.id, daily.id),
  );

  const error = await t
    .mutation(api.accounting.recordCashExpense, {
      ...groceries(workspace.id, daily.id),
      amount: { currency: "USD", minorUnits: 150000 },
    })
    .catch((caught: unknown) => caught);

  expect(error).toMatchObject({ data: { code: "idempotency_key_conflict" } });
});

test("an idempotency key cannot post a different cash expense", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  await t.mutation(
    api.accounting.recordCashExpense,
    groceries(workspace.id, daily.id),
  );

  const error = await t
    .mutation(
      api.accounting.recordCashExpense,
      groceries(workspace.id, daily.id, {
        amount: 1,
        accountingDate: "2026-09-20",
        description: "Rent",
      }),
    )
    .catch((caught: unknown) => caught);

  expect(error).toMatchObject({ data: { code: "idempotency_key_conflict" } });
});

test("a posted cash expense is balanced in Functional Currency", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  await t.mutation(
    api.accounting.recordCashExpense,
    groceries(workspace.id, daily.id),
  );
  const trial = await t.query(api.accounting.trialBalance, {
    userId: owner.userId,
    workspaceId: workspace.id,
  });

  expect(
    trial.reduce((sum, row) => sum + row.debitMinorUnits - row.creditMinorUnits, 0),
  ).toBe(0);
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
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  const empty = await t.query(api.accounting.balances, {
    userId: owner.userId,
    workspaceId: workspace.id,
  });
  await t.mutation(
    api.accounting.recordCashExpense,
    groceries(workspace.id, daily.id),
  );
  const after = await t.query(api.accounting.balances, {
    userId: owner.userId,
    workspaceId: workspace.id,
  });

  expect(empty).toEqual([
    {
      financialAccountProfileId: daily.id,
      name: "Daily",
      debitMinusCredit: { currency: "COP", minorUnits: 0 },
    },
  ]);
  expect(after).toEqual([
    {
      financialAccountProfileId: daily.id,
      name: "Daily",
      debitMinusCredit: { currency: "COP", minorUnits: -150000 },
    },
  ]);
});

test("a non-finite or fractional amount cannot become Posted", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);

  const infinite = await t
    .mutation(api.accounting.recordCashExpense, {
      ...groceries(workspace.id, daily.id, { idempotencyKey: "infinite" }),
      amount: { currency: "COP", minorUnits: Number.POSITIVE_INFINITY },
    })
    .catch((caught: unknown) => caught);
  const fractional = await t
    .mutation(api.accounting.recordCashExpense, {
      ...groceries(workspace.id, daily.id, { idempotencyKey: "fractional" }),
      amount: { currency: "COP", minorUnits: 1.5 },
    })
    .catch((caught: unknown) => caught);
  const activity = await t.query(api.accounting.listPostedCashExpenses, {
    userId: owner.userId,
    workspaceId: workspace.id,
  });

  expect(infinite).toMatchObject({ data: { code: "amount_must_be_positive" } });
  expect(fractional).toMatchObject({ data: { code: "amount_must_be_positive" } });
  expect(activity).toEqual([]);
});

test("a zero-amount cash expense cannot become Posted", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  const error = await t
    .mutation(
      api.accounting.recordCashExpense,
      groceries(workspace.id, daily.id, {
        amount: 0,
        idempotencyKey: "groceries-0",
      }),
    )
    .catch((caught: unknown) => caught);
  const activity = await t.query(api.accounting.listPostedCashExpenses, {
    userId: owner.userId,
    workspaceId: workspace.id,
  });

  expect(error).toMatchObject({ data: { code: "amount_must_be_positive" } });
  expect(activity).toEqual([]);
});

test("an invalid Accounting Date cannot become Posted", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  const error = await t
    .mutation(
      api.accounting.recordCashExpense,
      groceries(workspace.id, daily.id, {
        accountingDate: "2026-09-31",
        idempotencyKey: "bad-date",
      }),
    )
    .catch((caught: unknown) => caught);

  expect(error).toMatchObject({ data: { code: "accounting_date_required" } });
});

test("a cash expense must use the Workspace Functional Currency", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  const error = await t
    .mutation(api.accounting.recordCashExpense, {
      ...groceries(workspace.id, daily.id, { idempotencyKey: "usd" }),
      amount: { currency: "USD", minorUnits: 100 },
    })
    .catch((caught: unknown) => caught);

  expect(error).toMatchObject({ data: { code: "functional_currency_required" } });
});
