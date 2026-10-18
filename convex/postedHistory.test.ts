import { expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import {
  convexAccounting, createDaily, createOwnedWorkspace, createProfile, groceries, reverse, septNow,
} from "../src/accounting/convexHarness";
import { reversalPayload } from "../apps/mobile/src/features/history/useReversal";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
async function fixture() {
  const t = await convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  const daily = await createDaily(t, workspace.id);
  return { t, workspace, daily };
}

test("all postings page 50/50/5 by accounting date, including backdated entries and both reversal links", async () => {
  const { t, workspace, daily } = await fixture();
  const entries = [];
  for (let i = 0; i < 104; i++) {
    vi.setSystemTime(septNow + i);
    entries.push(await t.action(api.accounting.recordCashExpense, groceries(workspace.id, daily.id, {
      accountingDate: `2026-09-${String(i % 25 + 1).padStart(2, "0")}`,
      description: `Expense ${i}`,
      idempotencyKey: `expense-${i}`,
    })));
  }
  vi.setSystemTime(septNow + 200);
  const original = entries[99];
  const reversal = await reverse(t, workspace.id, original.id);
  const first = await t.query(api.accounting.postedHistory, {
    workspaceId: workspace.id, paginationOpts: { cursor: null, numItems: 500 },
  });
  const second = await t.query(api.accounting.postedHistory, {
    workspaceId: workspace.id, paginationOpts: { cursor: first.continueCursor, numItems: 50 },
  });
  const third = await t.query(api.accounting.postedHistory, {
    workspaceId: workspace.id, paginationOpts: { cursor: second.continueCursor, numItems: 50 },
  });
  expect([first.page.length, second.page.length, third.page.length]).toEqual([50, 50, 5]);
  expect([first.isDone, second.isDone, third.isDone]).toEqual([false, false, true]);
  const rows = [...first.page, ...second.page, ...third.page];
  expect(rows.map((row) => row.id)).toEqual([reversal, ...entries].sort((a, b) =>
    b.accountingDate.localeCompare(a.accountingDate) || b.postedAt - a.postedAt).map((entry) => entry.id));
  expect(new Set(rows.map((row) => row.id)).size).toBe(105);
  expect(rows.find((row) => row.id === original.id)).toMatchObject({
    reversed: true, reversedByEntryId: reversal.id, amount: { minorUnits: -150000 },
  });
  expect(rows.find((row) => row.id === reversal.id)).toMatchObject({
    reversesEntryId: original.id, amount: { minorUnits: 150000 },
  });
  const recent = await t.query(api.accounting.postedHistory, {
    workspaceId: workspace.id, includeReversals: false, paginationOpts: { cursor: null, numItems: 4 },
  });
  expect(recent.page).toHaveLength(4);
  expect(recent.page.some((row) => row.reversesEntryId)).toBe(false);
  expect(recent.page[0]).toMatchObject({ id: original.id, reversed: true });
}, 15_000);

test("account history uses the selected profile and retains legacy postings without a date backfill", async () => {
  const { t, workspace, daily } = await fixture();
  const other = await createProfile(t, workspace.id, "Other cash", "cash");
  const original = await t.action(api.accounting.recordCashExpense, groceries(workspace.id, daily.id));
  const correction = await reverse(t, workspace.id, original.id);
  await t.action(api.accounting.recordCashExpense, groceries(workspace.id, other.id, { idempotencyKey: "other-profile" }));
  const page = await t.query(api.accounting.postedHistory, {
    workspaceId: workspace.id, financialAccountProfileId: daily.id, paginationOpts: { cursor: null, numItems: 50 },
  });
  expect(page.page.map((row) => row.id).sort()).toEqual([original.id, correction.id].sort());
  expect(page.page.every((row) => row.financialAccountProfileId === daily.id)).toBe(true);
  const recent = await t.query(api.accounting.postedHistory, {
    workspaceId: workspace.id, financialAccountProfileId: daily.id, includeReversals: false,
    paginationOpts: { cursor: null, numItems: 3 },
  });
  expect(recent.page.map((row) => row.id)).toEqual([original.id]);
  const foreign = await createOwnedWorkspace(t);
  await expect(t.query(api.accounting.postedHistory, {
    workspaceId: foreign.id, financialAccountProfileId: daily.id, paginationOpts: { cursor: null, numItems: 50 },
  })).rejects.toMatchObject({ data: { code: "financial_account_profile_not_found" } });
});

test("detail reversal preserves the exact original category set/primary and nets the ledger once on retry", async () => {
  const { t, workspace, daily } = await fixture();
  const ids: string[] = [];
  for (const presetId of ["groceries", "dining"]) {
    const result = await t.action(api.accounting.createUserCategory, {
      workspaceId: workspace.id, selection: { kind: "preset", presetId, style: { emoji: "x", tone: "primary" } },
    });
    if (result.kind !== "category") throw new Error("Fixture category required");
    ids.push(result.category.id);
  }
  const original = await t.action(api.accounting.recordCashExpense, {
    ...groceries(workspace.id, daily.id), userCategoryIds: ids, primaryUserCategoryId: ids[1],
  });
  const before = await t.run(async (ctx) => ({
    entries: await ctx.db.query("journalEntries").collect(), lines: await ctx.db.query("journalLines").collect(),
  }));
  const payload = reversalPayload(workspace.id, original.id);
  const receipt = await t.action(api.accounting.reversePostedEntry, payload);
  const replay = await t.action(api.accounting.reversePostedEntry, payload);
  expect(replay).toEqual({ ...receipt, replay: true });
  const detail = await t.query(api.accounting.postedEntry, { workspaceId: workspace.id, journalEntryId: original.id });
  const mirrored = await t.query(api.accounting.postedEntry, { workspaceId: workspace.id, journalEntryId: receipt.id });
  expect(detail.entry).toEqual({ ...original, reversedByEntryId: receipt.id });
  expect(mirrored.entry).toEqual(receipt);
  expect(detail.row).toMatchObject({ detail: "Food · Dining", primaryUserCategoryId: ids[1], reversedByEntryId: receipt.id });
  expect(mirrored.row).toMatchObject({ primaryUserCategoryId: ids[1], reversesEntryId: original.id, amount: { minorUnits: 150000 } });
  expect(mirrored.entry.lines).toEqual(original.lines.map((line) => ({ ...line, debitMinorUnits: line.creditMinorUnits, creditMinorUnits: line.debitMinorUnits })));
  const after = await t.run(async (ctx) => ({
    entries: await ctx.db.query("journalEntries").collect(), lines: await ctx.db.query("journalLines").collect(),
  }));
  expect(after.entries).toHaveLength(2);
  expect(after.entries.filter((entry) => !entry.reversesEntryId)).toEqual(before.entries);
  expect(after.lines.filter((line) => line.journalEntryId === original.id)).toEqual(before.lines);
  const summary = await t.query(api.accounting.postedActivity, { workspaceId: workspace.id, month: "2026-09", includeRows: false });
  expect(summary.rows).toEqual([]);
  expect(summary.accounts[0].balance.minorUnits).toBe(0);
  expect(summary.monthSpendMinorUnits).toBe(0);
  const categories = await t.query(api.accounting.categoryTotals, { workspaceId: workspace.id, month: "2026-09" });
  expect(categories.categories.map((category) => category.minorUnits)).toEqual([0, 0]);
});

test("empty history is complete, and malformed or foreign details cannot be read", async () => {
  const { t, workspace, daily } = await fixture();
  const empty = await t.query(api.accounting.postedHistory, { workspaceId: workspace.id, paginationOpts: { cursor: null, numItems: 50 } });
  expect(empty).toMatchObject({ page: [], isDone: true });
  const entry = await t.action(api.accounting.recordCashExpense, groceries(workspace.id, daily.id));
  const foreign = await createOwnedWorkspace(t);
  for (const [workspaceId, journalEntryId] of [[workspace.id, "malformed"], [workspace.id, workspace.id], [foreign.id, entry.id]]) {
    await expect(t.query(api.accounting.postedEntry, { workspaceId, journalEntryId })).rejects.toMatchObject({ data: { code: "journal_entry_not_found" } });
  }
});

test("liability rows show money direction while summaries label the balance as owed", async () => {
  const { t, workspace } = await fixture();
  const card = await createProfile(t, workspace.id, "Card", "creditCard");
  const entry = await t.action(api.accounting.recordCashExpense, groceries(workspace.id, card.id));
  const detail = await t.query(api.accounting.postedEntry, { workspaceId: workspace.id, journalEntryId: entry.id });
  expect(detail.row.amount.minorUnits).toBe(-150000);
  const summary = await t.query(api.accounting.postedActivity, { workspaceId: workspace.id, month: "2026-09", includeRows: false });
  expect(summary.accounts.find((account) => account.financialAccountProfileId === card.id)).toMatchObject({ nature: "Liability", balance: { minorUnits: 150000 } });
});
