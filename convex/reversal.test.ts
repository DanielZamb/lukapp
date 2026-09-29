/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  caught,
  convexAccounting,
  createDaily,
  createOwnedWorkspace,
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

async function postedGroceries(extra?: Parameters<typeof groceries>[2]) {
  const t = convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  const posted = await t.mutation(
    api.accounting.recordCashExpense,
    groceries(workspace.id, daily.id, extra),
  );
  return { t, workspace, daily, posted, read: reader(t, workspace.id) };
}

test("a reversal appends a mirror entry that brings the original to zero", async () => {
  const { t, workspace, daily, posted, read } = await postedGroceries();

  const reversal = await reverse(t, workspace.id, posted.id);
  const [original, appended] = await read.entries();
  const [balance] = await read.balances();
  const trial = await read.trialBalance();

  expect(original).toEqual({ ...posted, reversedByEntryId: reversal.id });
  expect(appended).toEqual(reversal);
  expect(reversal).toMatchObject({
    policy: "reversal@1",
    reversesEntryId: posted.id,
    accountingDate: posted.accountingDate,
    description: "Reversal: Groceries",
    financialAccountProfileId: daily.id,
    amount: posted.amount,
    replay: false,
  });
  expect(reversal.lines).toEqual(
    posted.lines.map((line) => ({
      ...line,
      debitMinorUnits: line.creditMinorUnits,
      creditMinorUnits: line.debitMinorUnits,
    })),
  );
  expect(balance?.balance).toEqual({ currency: "COP", minorUnits: 0 });
  for (const row of trial) {
    expect(row.debitMinorUnits).toBe(row.creditMinorUnits);
  }
});

test("reverse then replace corrects an expense without touching the original", async () => {
  const { t, workspace, daily, posted, read } = await postedGroceries();

  await reverse(t, workspace.id, posted.id);
  await t.mutation(
    api.accounting.recordCashExpense,
    groceries(workspace.id, daily.id, { amount: 120000, idempotencyKey: "groceries-fixed" }),
  );
  const entries = await read.entries();
  const [balance] = await read.balances();

  expect(entries).toHaveLength(3);
  expect(entries[0]?.lines).toEqual(posted.lines);
  expect(balance?.balance).toEqual({ currency: "COP", minorUnits: -120000 });
});

test("repeating a reversal with its key replays it; a second reversal is refused", async () => {
  const { t, workspace, posted, read } = await postedGroceries();

  const first = await reverse(t, workspace.id, posted.id, { idempotencyKey: "undo" });
  const again = await reverse(t, workspace.id, posted.id, { idempotencyKey: "undo" });
  const twice = await caught(
    reverse(t, workspace.id, posted.id, { idempotencyKey: "undo-again" }),
  );

  expect(again).toEqual({ ...first, replay: true });
  expect(twice).toMatchObject({ data: { code: "journal_entry_already_reversed" } });
  expect(await read.entries()).toHaveLength(2);
});

test("a reversal key replays even after the period locks", async () => {
  const { t, workspace, posted } = await postedGroceries();

  const first = await reverse(t, workspace.id, posted.id, { idempotencyKey: "undo" });
  await lock(t, workspace.id, { year: 2026, month: 9 });
  const again = await reverse(t, workspace.id, posted.id, { idempotencyKey: "undo" });

  expect(again).toEqual({ ...first, accountingPeriod: again.accountingPeriod, replay: true });
  expect(again.accountingPeriod.status).toBe("locked");
});

test("reusing a reversal key for a different entry conflicts", async () => {
  const { t, workspace, daily, posted } = await postedGroceries();
  const other = await t.mutation(
    api.accounting.recordCashExpense,
    groceries(workspace.id, daily.id, { idempotencyKey: "coffee", description: "Coffee" }),
  );

  await reverse(t, workspace.id, posted.id, { idempotencyKey: "undo" });
  const error = await caught(
    reverse(t, workspace.id, other.id, { idempotencyKey: "undo" }),
  );

  expect(error).toMatchObject({ data: { code: "idempotency_key_conflict" } });
});

test("a reversal cannot itself be reversed", async () => {
  const { t, workspace, posted } = await postedGroceries();
  const reversal = await reverse(t, workspace.id, posted.id);

  const error = await caught(reverse(t, workspace.id, reversal.id));

  expect(error).toMatchObject({ data: { code: "reversal_cannot_be_reversed" } });
});

test("a reversal of an entry in a Locked Period lands on the next open month", async () => {
  const { t, workspace, posted } = await postedGroceries();
  await lock(t, workspace.id, { year: 2026, month: 9 });
  await lock(t, workspace.id, { year: 2026, month: 10 });

  const reversal = await reverse(t, workspace.id, posted.id);

  expect(reversal.accountingDate).toBe("2026-11-01");
  expect(reversal.accountingPeriod).toEqual({ year: 2026, month: 11, status: "open" });
});

test("an explicit reversal date must be postable and not precede the original", async () => {
  const { t, workspace, posted } = await postedGroceries();
  await lock(t, workspace.id, { year: 2026, month: 10 });

  const locked = await caught(
    reverse(t, workspace.id, posted.id, { accountingDate: "2026-10-05" }),
  );
  const early = await caught(
    reverse(t, workspace.id, posted.id, { accountingDate: "2026-09-01" }),
  );
  const bad = await caught(
    reverse(t, workspace.id, posted.id, { accountingDate: "2026-02-30" }),
  );
  const later = await reverse(t, workspace.id, posted.id, {
    accountingDate: "2026-11-02",
    description: "Refunded at the store",
  });

  expect(locked).toMatchObject({ data: { code: "locked_period" } });
  expect(early).toMatchObject({ data: { code: "reversal_date_before_original" } });
  expect(bad).toMatchObject({ data: { code: "accounting_date_required" } });
  expect(later).toMatchObject({
    accountingDate: "2026-11-02",
    description: "Refunded at the store",
  });
});

test("a missing, malformed, or foreign entry cannot be reversed", async () => {
  const { t, workspace, posted } = await postedGroceries();
  const other = await createOwnedWorkspace(t);

  const malformed = await caught(reverse(t, workspace.id, "not-an-id"));
  const wrongTable = await caught(reverse(t, workspace.id, workspace.id));
  const foreign = await caught(reverse(t, other.id, posted.id));

  expect(malformed).toMatchObject({ data: { code: "journal_entry_not_found" } });
  expect(wrongTable).toMatchObject({ data: { code: "journal_entry_not_found" } });
  expect(foreign).toMatchObject({ data: { code: "journal_entry_not_found" } });
});

test("replaying a reversed expense reports the reversal that offsets it", async () => {
  const { t, workspace, daily, posted } = await postedGroceries();
  const reversal = await reverse(t, workspace.id, posted.id);

  const again = await t.mutation(
    api.accounting.recordCashExpense,
    groceries(workspace.id, daily.id),
  );

  expect(again).toEqual({ ...posted, replay: true, reversedByEntryId: reversal.id });
});
