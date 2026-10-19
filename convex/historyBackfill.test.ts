import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import {
  convexAccounting,
  createOwnedWorkspace,
  createProfile,
  groceries,
  reverse,
  type AccountingTest,
} from "../src/accounting/convexHarness";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);

async function snapshot(t: AccountingTest) {
  return t.run(async (ctx) => {
    const strip = <T extends { _id: unknown; _creationTime: unknown }>({ _id, _creationTime, ...row }: T) => row;
    const links = (await ctx.db.query("journalEntryProfiles").collect()).map(strip);
    const openings = (await ctx.db.query("financialAccountOpenings").collect()).map(strip);
    const key = (row: object) => JSON.stringify(row);
    return { links: links.map(key).sort(), openings: openings.map(key).sort() };
  });
}

async function backfill(t: AccountingTest) {
  let cursor: string | null = null;
  const totals = { links: 0, openings: 0 };
  for (;;) {
    const result: { cursor: string; done: boolean; links: number; openings: number } =
      await t.mutation(internal.historyBackfill.backfillProfileHistory, { cursor, batchSize: 2 });
    totals.links += result.links;
    totals.openings += result.openings;
    if (result.done) return totals;
    cursor = result.cursor;
  }
}

test("the backfill restores exactly the history and opening rows a current write produces", async () => {
  const t = await convexAccounting(modules);
  const { id: workspaceId } = await createOwnedWorkspace(t);
  const bank = await createProfile(t, workspaceId, "Bank", "bankAccount");
  const card = await createProfile(t, workspaceId, "Card", "creditCard");
  const opening = (profileId: string, minorUnits: number) => ({
    ...groceries(workspaceId, profileId),
    amount: { currency: "COP", minorUnits },
    accountingDate: "2026-09-20",
    description: "Starting amount",
    idempotencyKey: `opening-${profileId}`,
  });
  await t.action(api.accounting.recordOpeningPosition, opening(bank.id, 100000));
  await t.action(api.accounting.recordOpeningPosition, opening(card.id, 10000));
  const transfer = await t.action(api.accounting.recordAccountTransfer, {
    workspaceId,
    sourceFinancialAccountProfileId: bank.id,
    destinationFinancialAccountProfileId: card.id,
    amount: { currency: "COP", minorUnits: 2500 },
    accountingDate: "2026-09-24",
    description: "Card payment",
    idempotencyKey: "transfer-1",
  });
  const expense = await t.action(api.accounting.recordCashExpense, groceries(workspaceId, bank.id));
  await reverse(t, workspaceId, expense.id);
  const written = await snapshot(t);
  expect(written.links.length).toBeGreaterThan(0);
  expect(written.openings).toHaveLength(2);

  // Recreate entries posted before U03: no history links and no opening markers.
  await t.run(async (ctx) => {
    for (const row of await ctx.db.query("journalEntryProfiles").collect()) await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("financialAccountOpenings").collect()) await ctx.db.delete(row._id);
  });
  const cardHistory = () => t.query(api.accounting.postedHistory, {
    workspaceId, financialAccountProfileId: card.id, paginationOpts: { cursor: null, numItems: 50 },
  });
  expect((await cardHistory()).page).toEqual([]);

  expect(await backfill(t)).toEqual({ links: written.links.length, openings: 2 });
  expect(await snapshot(t)).toEqual(written);
  expect(await backfill(t)).toEqual({ links: 0, openings: 0 });
  expect((await cardHistory()).page.find((row) => row.id === transfer.id)).toMatchObject({
    detail: "Bank → Card", amount: { minorUnits: 2500 },
  });
  await expect(t.action(api.accounting.recordCashExpense, groceries(workspaceId, bank.id, {
    accountingDate: "2026-09-15", idempotencyKey: "before-opening",
  }))).rejects.toMatchObject({ data: { code: "activity_before_opening" } });
});
