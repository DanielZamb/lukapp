/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  convexAccounting,
  createDaily,
  createOwnedWorkspace,
  caught,
  groceries,
  lock,
  octNow,
  owner,
  septNow,
} from "../src/accounting/convexHarness";

const modules = import.meta.glob([
  "./**/*.{js,ts}",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);

function testdb() {
  return convexAccounting(modules);
}

test("a later month stays not opened until a cash expense posts into it", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t, septNow);
  const opened = await t.query(api.accounting.openWorkspace, {
    userId: owner.userId,
    workspaceId: workspace.id,
    now: octNow,
  });
  const daily = await createDaily(t, workspace.id);
  const posted = await t.mutation(
    api.accounting.recordCashExpense,
    groceries(workspace.id, daily.id, {
      accountingDate: "2026-10-02",
      idempotencyKey: "oct-groceries",
    }),
  );
  const reopened = await t.query(api.accounting.openWorkspace, {
    userId: owner.userId,
    workspaceId: workspace.id,
    now: octNow,
  });

  expect(opened.currentAccountingPeriod).toEqual({
    year: 2026,
    month: 10,
    status: "not_opened",
  });
  expect(posted.accountingPeriod).toEqual({
    year: 2026,
    month: 10,
    status: "open",
  });
  expect(reopened.currentAccountingPeriod).toEqual({
    year: 2026,
    month: 10,
    status: "open",
  });
});

test("a posted cash expense is recognized in the Accounting Period of its Accounting Date", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t, octNow);
  const daily = await createDaily(t, workspace.id);
  const posted = await t.mutation(
    api.accounting.recordCashExpense,
    groceries(workspace.id, daily.id, { idempotencyKey: "sept-groceries" }),
  );

  expect(posted.accountingPeriod).toEqual({
    year: 2026,
    month: 9,
    status: "open",
  });
  expect(workspace.currentAccountingPeriod).toEqual({
    year: 2026,
    month: 10,
    status: "open",
  });
});

test("a posted cash expense reports the live Accounting Period status", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  await t.mutation(
    api.accounting.recordCashExpense,
    groceries(workspace.id, daily.id),
  );
  await t.mutation(api.accounting.lockAccountingPeriod, {
    userId: owner.userId,
    workspaceId: workspace.id,
    period: { year: 2026, month: 9 },
  });
  const [posted] = await t.query(api.accounting.listJournalEntries, {
    userId: owner.userId,
    workspaceId: workspace.id,
  });

  expect(posted?.accountingPeriod).toEqual({
    year: 2026,
    month: 9,
    status: "locked",
  });
});

test("a cash expense cannot become Posted in a Locked Period", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  await t.mutation(api.accounting.lockAccountingPeriod, {
    userId: owner.userId,
    workspaceId: workspace.id,
    period: { year: 2026, month: 9 },
  });
  const error = await t
    .mutation(
      api.accounting.recordCashExpense,
      groceries(workspace.id, daily.id),
    )
    .catch((caught: unknown) => caught);
  const activity = await t.query(api.accounting.listJournalEntries, {
    userId: owner.userId,
    workspaceId: workspace.id,
  });
  const balances = await t.query(api.accounting.balances, {
    userId: owner.userId,
    workspaceId: workspace.id,
  });

  expect(error).toMatchObject({ data: { code: "locked_period" } });
  expect(activity).toEqual([]);
  expect(balances).toEqual([
    {
      financialAccountProfileId: daily.id,
      name: "Daily",
      nature: "Asset",
      debitMinorUnits: 0,
      creditMinorUnits: 0,
      balance: { currency: "COP", minorUnits: 0 },
    },
  ]);
});

test("two cash expenses in one month share one Accounting Period", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  await t.mutation(
    api.accounting.recordCashExpense,
    groceries(workspace.id, daily.id, {
      amount: 100,
      accountingDate: "2026-09-01",
      description: "Coffee",
      idempotencyKey: "coffee",
    }),
  );
  await t.mutation(
    api.accounting.recordCashExpense,
    groceries(workspace.id, daily.id, {
      amount: 200,
      accountingDate: "2026-09-02",
      description: "Tea",
      idempotencyKey: "tea",
    }),
  );
  await t.mutation(api.accounting.lockAccountingPeriod, {
    userId: owner.userId,
    workspaceId: workspace.id,
    period: { year: 2026, month: 9 },
  });
  const error = await t
    .mutation(
      api.accounting.recordCashExpense,
      groceries(workspace.id, daily.id, {
        amount: 300,
        accountingDate: "2026-09-03",
        description: "Milk",
        idempotencyKey: "milk",
      }),
    )
    .catch((caught: unknown) => caught);

  expect(error).toMatchObject({ data: { code: "locked_period" } });
});

test("a quiet month can be locked before anything posts into it", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);

  const locked = await lock(t, workspace.id, { year: 2026, month: 10 });
  const error = await caught(
    t.mutation(
      api.accounting.recordCashExpense,
      groceries(workspace.id, daily.id, {
        accountingDate: "2026-10-01",
        idempotencyKey: "oct",
      }),
    ),
  );

  expect(locked).toEqual({ year: 2026, month: 10, status: "locked" });
  expect(error).toMatchObject({ data: { code: "locked_period" } });
});

test("a lock appends one Period Control Decision with actor, time, and reason", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);

  await lock(t, workspace.id, { year: 2026, month: 9 }, "  September reviewed ");
  await lock(t, workspace.id, { year: 2026, month: 9 }, "again");
  await lock(t, workspace.id, { year: 2026, month: 8 });
  const decisions = await t.run((ctx) =>
    ctx.db.query("periodControlDecisions").collect(),
  );

  expect(
    decisions.map(({ year, month, action, decidedBy, reason }) => ({
      year,
      month,
      action,
      decidedBy,
      reason,
    })),
  ).toEqual([
    { year: 2026, month: 9, action: "Lock", decidedBy: owner.userId, reason: "September reviewed" },
    { year: 2026, month: 8, action: "Lock", decidedBy: owner.userId, reason: undefined },
  ]);
  expect(decisions.every((decision) => Number.isFinite(decision.decidedAt))).toBe(true);
});

test("a lock needs a real month", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);

  const error = await caught(lock(t, workspace.id, { year: 2026, month: 13 }));

  expect(error).toMatchObject({ data: { code: "accounting_period_invalid" } });
});

test("a posted expense replays under its key after its period locks", async () => {
  const t = testdb();
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  const first = await t.mutation(
    api.accounting.recordCashExpense,
    groceries(workspace.id, daily.id),
  );

  await lock(t, workspace.id, { year: 2026, month: 9 });
  const again = await t.mutation(
    api.accounting.recordCashExpense,
    groceries(workspace.id, daily.id),
  );

  expect(again).toMatchObject({ id: first.id, replay: true });
});
