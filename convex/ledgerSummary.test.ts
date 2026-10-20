import { expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { convexStore } from "./store";
import { createAccountingCore } from "../src/accounting/core";
import { postedActivity } from "../src/accounting/queries/postedActivity";
import { accountingFixture, groceries, octNow, owner } from "../src/accounting/convexHarness";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);

test("Home, ordinary posting and starting a new place do not read the full ledger", async () => {
  const { t } = await accountingFixture(modules);
  const { workspace, financialAccountProfile } = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP", startingMinorUnits: 100000, timeZone: "America/Bogota",
  });
  await t.run(async (ctx) => {
    const store = convexStore(ctx.db);
    store.listJournalEntries = async () => { throw new Error("Full ledger read"); };
    const core = createAccountingCore(store);
    const expense = await core.recordCashExpense({ ...groceries(workspace.id, financialAccountProfile.id), actor: owner });
    expect(await postedActivity(store, { actor: owner, workspaceId: workspace.id, month: "2026-09", includeRows: false }))
      .toMatchObject({ accounts: [{ balance: { minorUnits: -50000 } }], rows: [], monthSpendMinorUnits: 150000 });
    const place = await core.createFinancialAccountProfile({
      actor: owner, workspaceId: workspace.id, name: "New", productKind: "cash",
    });
    await core.recordOpeningPosition({
      actor: owner, workspaceId: workspace.id, financialAccountProfileId: place.id,
      amount: { currency: "COP", minorUnits: 1 }, accountingDate: "2026-09-24",
      description: "Start", idempotencyKey: "new-place-start",
    });
    await core.reversePostedEntry({
      actor: owner, workspaceId: workspace.id, journalEntryId: expense.id, idempotencyKey: "reverse",
    });
    expect(await core.balances({ actor: owner, workspaceId: workspace.id }))
      .toMatchObject([{ balance: { minorUnits: 100000 } }, { balance: { minorUnits: 1 } }]);
  });
});

test("the bounded backfill restores legacy totals and opening guards while new writes and retries interleave", async () => {
  const { t } = await accountingFixture(modules);
  const { workspace, financialAccountProfile: daily } = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP", startingMinorUnits: 100000, timeZone: "America/Bogota",
  });
  const savings = await t.action(api.accounting.createFinancialAccountProfile, {
    workspaceId: workspace.id, name: "Savings", productKind: "savingsAccount",
  });
  const request = groceries(workspace.id, daily.id);
  const expense = await t.action(api.accounting.recordCashExpense, request);
  await t.action(api.accounting.recordAccountTransfer, {
    workspaceId: workspace.id, sourceFinancialAccountProfileId: daily.id,
    destinationFinancialAccountProfileId: savings.id, amount: { currency: "COP", minorUnits: 5000 },
    accountingDate: "2026-09-24", description: "Save", idempotencyKey: "save",
  });
  vi.setSystemTime(octNow);
  await t.action(api.accounting.reversePostedEntry, {
    workspaceId: workspace.id, journalEntryId: expense.id, accountingDate: "2026-10-02", idempotencyKey: "reverse",
  });
  const originalLedger = await t.run(async (ctx) => ({
    entries: await ctx.db.query("journalEntries").collect(),
    lines: await ctx.db.query("journalLines").collect(),
  }));
  const read = (month: string) => t.query(api.accounting.postedActivity, {
    workspaceId: workspace.id, month, includeRows: false,
  });
  await t.run(async (ctx) => {
    for (const table of ["ledgerAccountTotals", "ledgerSummaryEntries", "financialAccountOpenings"] as const)
      for (const row of await ctx.db.query(table).collect()) await ctx.db.delete(row._id);
    const id = ctx.db.normalizeId("workspaces", workspace.id);
    if (!id) throw new Error("Workspace missing");
    await ctx.db.patch(id, { ledgerSummaryVersion: undefined });
  });
  await expect(read("2026-09")).rejects.toMatchObject({ data: { code: "ledger_summary_not_ready" } });
  const workspaceId = await t.run(async (ctx) => ctx.db.normalizeId("workspaces", workspace.id));
  if (!workspaceId) throw new Error("Workspace missing");
  const batch = () => t.mutation(internal.ledgerSummaryBackfill.backfill, { workspaceId, batchSize: 1 });
  expect(await batch()).toEqual({ done: false, scanned: 1, applied: 1 });
  await expect(read("2026-09")).rejects.toMatchObject({ data: { code: "ledger_summary_not_ready" } });
  expect(await t.action(api.accounting.recordCashExpense, request)).toMatchObject({ id: expense.id, replay: true });
  const extra = await t.action(api.accounting.recordCashExpense, groceries(workspace.id, daily.id, {
    amount: 2500, idempotencyKey: "during-migration",
  }));
  let done = false;
  for (let attempt = 0; attempt < 10 && !done; attempt++) {
    const result = await batch();
    expect(result.scanned).toBeLessThanOrEqual(1);
    done = result.done;
  }
  expect(done).toBe(true);
  expect(await read("2026-09")).toMatchObject({
    accounts: [{ balance: { minorUnits: 92500 } }, { balance: { minorUnits: 5000 } }],
    monthSpendMinorUnits: 152500,
  });
  expect((await read("2026-10")).monthSpendMinorUnits).toBe(-150000);
  expect((await read("2026-11")).monthSpendMinorUnits).toBe(0);
  const beforeRetry = await t.query(api.accounting.trialBalance, { workspaceId: workspace.id });
  expect(await batch()).toEqual({ done: true, scanned: 0, applied: 0 });
  expect(await t.query(api.accounting.trialBalance, { workspaceId: workspace.id })).toEqual(beforeRetry);
  const after = await t.run(async (ctx) => ({
    entries: (await ctx.db.query("journalEntries").collect()).filter((row) => row._id !== extra.id),
    lines: (await ctx.db.query("journalLines").collect()).filter((row) => row.journalEntryId !== extra.id),
    applied: await ctx.db.query("ledgerSummaryEntries").collect(),
  }));
  expect(after.entries).toEqual(originalLedger.entries);
  expect(after.lines).toEqual(originalLedger.lines);
  expect(after.applied).toHaveLength(5);
  await expect(t.action(api.accounting.recordCashExpense, groceries(workspace.id, daily.id, {
    accountingDate: "2026-09-01", idempotencyKey: "before-migrated-opening",
  }))).rejects.toMatchObject({ data: { code: "activity_before_opening" } });
  await expect(t.action(api.accounting.recordOpeningPosition, {
    workspaceId: workspace.id, financialAccountProfileId: savings.id,
    amount: { currency: "COP", minorUnits: 0 }, accountingDate: "2026-09-25",
    description: "Too late", idempotencyKey: "after-destination-activity",
  })).rejects.toMatchObject({ data: { code: "opening_after_activity" } });
});

test("the optional activity preview is bounded while totals include every posting", async () => {
  const { t } = await accountingFixture(modules);
  const { workspace, financialAccountProfile } = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP", startingMinorUnits: 0, timeZone: "America/Bogota",
  });
  await t.run(async (ctx) => {
    const core = createAccountingCore(convexStore(ctx.db));
    for (let i = 0; i < 55; i++) {
      await core.recordCashExpense({
        ...groceries(workspace.id, financialAccountProfile.id, { amount: 123, idempotencyKey: `expense-${i}` }), actor: owner,
      });
    }
  });
  const result = await t.query(api.accounting.postedActivity, { workspaceId: workspace.id, month: "2026-09" });
  expect(result.rows).toHaveLength(50);
  expect(result.monthSpendMinorUnits).toBe(6765);
  expect(result.accounts[0].balance.minorUnits).toBe(-6765);
  const history = await t.query(api.accounting.postedHistory, {
    workspaceId: workspace.id, paginationOpts: { cursor: null, numItems: 50 },
  });
  expect(history.isDone).toBe(false);
  expect((await t.query(api.accounting.postedHistory, {
    workspaceId: workspace.id, paginationOpts: { cursor: history.continueCursor, numItems: 50 },
  })).page).toHaveLength(5);
});

test("a rejected total overflow rolls back both the journal and summary, and an exact retry adds nothing", async () => {
  const { t } = await accountingFixture(modules);
  const { workspace, financialAccountProfile } = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP", startingMinorUnits: 0, timeZone: "America/Bogota",
  });
  const request = groceries(workspace.id, financialAccountProfile.id, { amount: Number.MAX_SAFE_INTEGER });
  const first = await t.action(api.accounting.recordCashExpense, request);
  const snapshot = () => t.run(async (ctx) => ({
    entries: await ctx.db.query("journalEntries").collect(), lines: await ctx.db.query("journalLines").collect(),
    totals: await ctx.db.query("ledgerAccountTotals").collect(), receipts: await ctx.db.query("ledgerSummaryEntries").collect(),
  }));
  const before = await snapshot();
  await expect(t.action(api.accounting.recordCashExpense, groceries(workspace.id, financialAccountProfile.id, {
    amount: 1, idempotencyKey: "overflow",
  }))).rejects.toMatchObject({ data: { code: "ledger_totals_out_of_range" } });
  expect(await t.action(api.accounting.recordCashExpense, request)).toEqual({ ...first, replay: true });
  expect(await snapshot()).toEqual(before);
});

test("an empty legacy workspace completes migration and an invalid batch cannot mark it ready", async () => {
  const { t } = await accountingFixture(modules);
  const { workspace } = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP", startingMinorUnits: 0, timeZone: "America/Bogota",
  });
  const workspaceId = await t.run(async (ctx) => {
    const id = ctx.db.normalizeId("workspaces", workspace.id);
    if (!id) throw new Error("Workspace missing");
    await ctx.db.patch(id, { ledgerSummaryVersion: undefined });
    return id;
  });
  await expect(t.mutation(internal.ledgerSummaryBackfill.backfill, { workspaceId, batchSize: 0 }))
    .rejects.toThrow("batchSize must be an integer between 1 and 100");
  await expect(t.query(api.accounting.balances, { workspaceId })).rejects.toMatchObject({
    data: { code: "ledger_summary_not_ready" },
  });
  expect(await t.mutation(internal.ledgerSummaryBackfill.backfill, { workspaceId }))
    .toEqual({ done: true, scanned: 0, applied: 0 });
  expect(await t.query(api.accounting.balances, { workspaceId })).toMatchObject([{ balance: { minorUnits: 0 } }]);
});
