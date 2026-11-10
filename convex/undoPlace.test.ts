import { AccountingError } from "../src/accounting/errors";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { accountingFixture, createProfile, provisionWorkspace, reverse, lock, type AccountingTest } from "../src/accounting/convexHarness";
import { UNDO_BATCH_SIZE } from "./accountingUndo";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
const money = (minorUnits: number) => ({ currency: "COP", minorUnits });
afterEach(() => vi.useRealTimers());
async function setup(template = "co-puc-personal@1", openingAmount = 1000) {
  vi.useFakeTimers();
  const fixture = await accountingFixture(modules);
  const { t } = fixture;
  const workspace = await provisionWorkspace(t, { functionalCurrency: "COP", chartOfAccountsTemplate: template });
  const place = await createProfile(t, workspace.id, "Mistake", "cash");
  const other = await createProfile(t, workspace.id, "Other", "bankAccount");
  const third = await createProfile(t, workspace.id, "Third", "savingsAccount");
  const target = { workspaceId: workspace.id, financialAccountProfileId: place.id };
  const opening = await t.action(api.accounting.recordOpeningPosition, { ...target, amount: money(openingAmount), accountingDate: "2026-09-24", description: "Opening", idempotencyKey: "opening" });
  const expenseResult = await t.action(api.accounting.createUserCategory, { workspaceId: workspace.id,
    selection: { kind: "preset", presetId: "groceries", style: { emoji: "F", tone: "primary" } } });
  const incomeResult = await t.action(api.accounting.createUserCategory, { workspaceId: workspace.id,
    selection: { kind: "custom", name: "Pay", answer: "receive", style: { emoji: "I", tone: "positive" } } });
  if (expenseResult.kind !== "category" || incomeResult.kind !== "category") throw new Error("Missing category");
  const expense = (key: string, amount = 100) => t.action(api.accounting.recordCashExpense, { ...target,
    userCategoryId: expenseResult.category.id, amount: money(amount), accountingDate: "2026-09-24", description: key, idempotencyKey: key });
  const transfer = (key: string, from: string, to: string, amount: number) => t.action(api.accounting.recordAccountTransfer, {
    workspaceId: workspace.id, sourceFinancialAccountProfileId: from, destinationFinancialAccountProfileId: to,
    amount: money(amount), accountingDate: "2026-09-24", description: key, idempotencyKey: key });
  const start = { ...target, idempotencyKey: "undo" };
  return { ...fixture, workspace, place, other, third, target, opening, start, expense, transfer,
    expenseCategory: expenseResult.category.id, incomeCategory: incomeResult.category.id,
    status: () => t.query(api.accounting.placeUndoStatus, target),
    finish: () => fixture.root.finishAllScheduledFunctions(() => vi.runAllTimers()),
  };
}
async function state(t: AccountingTest) {
  return t.run(async ctx => ({ entries: await ctx.db.query("journalEntries").collect(),
    lines: await ctx.db.query("journalLines").collect(), totals: await ctx.db.query("ledgerAccountTotals").collect(),
    endings: await ctx.db.query("placeEndings").collect(), operations: await ctx.db.query("placeUndoOperations").collect(),
    workspaces: await ctx.db.query("workspaces").collect(), settings: await ctx.db.query("workspaceSettingChanges").collect() }));
}
async function expectReconciled(t: AccountingTest, workspaceId: string) {
  const entries = await t.query(api.accounting.listJournalEntries, { workspaceId });
  const sums = new Map<string, [number, number]>();
  for (const entry of entries) {
    expect(entry.lines.reduce((n, line) => n + line.debitMinorUnits, 0)).toBe(entry.lines.reduce((n, line) => n + line.creditMinorUnits, 0));
    for (const line of entry.lines) {
      for (const period of ["*", entry.accountingDate.slice(0, 7)]) {
        const key = `${period}:${line.ledgerAccountId}`;
        const sum = sums.get(key) ?? [0, 0];
        sums.set(key, [sum[0] + line.debitMinorUnits, sum[1] + line.creditMinorUnits]);
      }
    }
  }
  const totals = (await state(t)).totals;
  for (const total of totals) expect([total.debitMinorUnits, total.creditMinorUnits]).toEqual(sums.get(`${total.period}:${total.ledgerAccountId}`));
  expect(totals.length).toBe(sums.size);
}

test.each(["co-puc-personal@1", "us-gaap-personal@1"])("%s Undo mirrors opening, expense, income and transfers, with preview matching persisted effects", async template => {
  const s = await setup(template);
  const expense = await s.expense("spent", 120);
  const income = await s.t.action(api.accounting.recordCashIncome, { ...s.target, userCategoryId: s.incomeCategory, amount: money(30), accountingDate: "2026-09-24", description: "Pay", idempotencyKey: "pay" });
  const out = await s.transfer("out", s.place.id, s.other.id, 200);
  const incoming = await s.transfer("in", s.third.id, s.place.id, 70);
  const originals = [s.opening!, expense, income, out, incoming];
  expect(await s.t.query(api.accounting.previewUndoPlace, s.target)).toMatchObject({ canUndo: true, blockers: [], operation: null,
    page: { entriesToReverse: 5, alreadyReversed: 0, lockedMonthEntries: 0, isDone: true,
      otherPlaces: [{ financialAccountProfileId: s.other.id, name: "Other", balanceChange: money(-200) }, { financialAccountProfileId: s.third.id, name: "Third", balanceChange: money(70) }],
      currentMonthExpenseChange: money(-120), currentMonthIncomeChange: money(-30) } });
  const started = await s.t.action(api.accounting.startUndoPlace, s.start);
  expect(started).toMatchObject({ replay: false, operation: { state: { kind: "pending" }, reversedCount: 0 } });
  expect(await s.t.query(api.accounting.listFinancialAccountProfiles, { workspaceId: s.workspace.id, status: "undoing" })).toEqual([{ ...s.place, status: "undoing" }]);
  await s.finish();
  expect(await s.status()).toMatchObject({ state: { kind: "done" }, reversedCount: 5, alreadyReversedCount: 0 });
  const journals = await s.t.query(api.accounting.listJournalEntries, { workspaceId: s.workspace.id });
  expect(journals).toHaveLength(10);
  for (const original of originals) {
    const matches = journals.filter(e => e.reversesEntryId === original.id);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.lines.map(l => [l.ledgerAccountId, l.userCategoryId, l.debitMinorUnits, l.creditMinorUnits]))
      .toEqual(original.lines.map(l => [l.ledgerAccountId, l.userCategoryId, l.creditMinorUnits, l.debitMinorUnits]));
  }
  expect((await s.t.query(api.accounting.balances, { workspaceId: s.workspace.id })).map(p => p.balance)).toEqual([money(0), money(0), money(0)]);
  expect(await s.t.query(api.accounting.listFinancialAccountProfiles, { workspaceId: s.workspace.id, status: "undone" })).toEqual([{ ...s.place, status: "undone" }]);
  const ending = (await state(s.t)).endings[0];
  expect(ending).toMatchObject({ act: "undo", undoOperationId: started.operation.id, entries: [] });
  await expect(s.expense("after")).rejects.toThrow("financial_account_profile_ended");
  await expect(reverse(s.t, s.workspace.id, expense.id, { idempotencyKey: "after" })).rejects.toThrow("journal_entry_already_reversed");
  expect(await createProfile(s.t, s.workspace.id, "Mistake", "cash")).toMatchObject({ name: "Mistake", status: "open" });
  await expectReconciled(s.t, s.workspace.id);
});

test("bounded pages and multiple scheduler batches include the last post before Start and skip earlier reversals", async () => {
  const s = await setup();
  const first = await s.expense("first");
  await reverse(s.t, s.workspace.id, first.id);
  for (let i = 0; i < 45; i++) await s.expense(`expense-${i}`, 1);
  let cursor: string | undefined, count = 0, skipped = 0, pages = 0;
  do {
    const preview = await s.t.query(api.accounting.previewUndoPlace, { ...s.target, cursor });
    count += preview.page.entriesToReverse; skipped += preview.page.alreadyReversed; pages++;
    expect(preview.page.scannedLines).toBeLessThanOrEqual(UNDO_BATCH_SIZE);
    cursor = preview.page.isDone ? undefined : preview.page.continueCursor;
  } while (cursor);
  expect([count, skipped, pages]).toEqual([46, 1, 3]);
  const final = await s.expense("immediately-before", 7);
  const receipt = await s.t.action(api.accounting.startUndoPlace, s.start);
  const id = receipt.operation.id as Id<"placeUndoOperations">;
  await Promise.all([s.t.mutation(internal.accountingUndo.drive, { operationId: id, version: 0 }), s.t.mutation(internal.accountingUndo.drive, { operationId: id, version: 0 })]);
  expect(await s.status()).toMatchObject({ state: { kind: "running" }, version: 1, reversedCount: 18, alreadyReversedCount: 1 });
  const after = await state(s.t);
  await s.t.mutation(internal.accountingUndo.drive, { operationId: id, version: 0 });
  expect(await state(s.t)).toEqual(after);
  await s.finish();
  expect(await s.status()).toMatchObject({ state: { kind: "done" }, reversedCount: 47, alreadyReversedCount: 1 });
  const journals = await s.t.query(api.accounting.listJournalEntries, { workspaceId: s.workspace.id });
  expect(journals.filter(e => e.reversesEntryId === final.id)).toHaveLength(1);
  for (const original of journals.filter(e => !e.reversesEntryId)) expect(journals.filter(e => e.reversesEntryId === original.id)).toHaveLength(1);
  await expectReconciled(s.t, s.workspace.id);
});

test("Start replay retains operation identity and refuses changed payload, other Starts, Close and new activity", async () => {
  const s = await setup();
  const expense = await s.expense("before");
  const receipt = await s.t.action(api.accounting.startUndoPlace, s.start);
  const before = await state(s.t);
  expect(await s.t.action(api.accounting.startUndoPlace, s.start)).toEqual({ ...receipt, replay: true });
  for (const change of [{ financialAccountProfileId: s.other.id }, { replacementDefaultFinancialAccountProfileId: s.other.id }])
    await expect(s.t.action(api.accounting.startUndoPlace, { ...s.start, ...change })).rejects.toThrow("idempotency_key_conflict");
  await expect(s.t.action(api.accounting.startUndoPlace, { ...s.start, idempotencyKey: "other" })).rejects.toThrow("place_undo_in_progress");
  await expect(s.t.action(api.accounting.startUndoPlace, { ...s.start, financialAccountProfileId: s.other.id, idempotencyKey: "other" })).rejects.toThrow("place_undo_in_progress");
  expect(await s.t.query(api.accounting.placeClosure, s.target)).toMatchObject({ status: "undoing", canClose: false, blockers: [{ code: "place_undo_in_progress" }] });
  await expect(s.t.action(api.accounting.closePlace, { ...s.start, lines: [] })).rejects.toThrow("place_undo_in_progress");
  await expect(s.expense("during")).rejects.toThrow("place_undo_in_progress");
  await expect(s.transfer("during-in", s.other.id, s.place.id, 1)).rejects.toThrow("place_undo_in_progress");
  await expect(s.transfer("during-out", s.place.id, s.other.id, 1)).rejects.toThrow("place_undo_in_progress");
  await expect(reverse(s.t, s.workspace.id, expense.id)).rejects.toThrow("place_undo_in_progress");
  await expect(s.t.action(api.accounting.renameAccount, { ...s.target, name: "Changed", expectedName: "Mistake" })).rejects.toThrow("place_undo_in_progress");
  expect(await state(s.t)).toEqual(before);
  await s.finish();
  const done = await state(s.t);
  expect((await s.t.action(api.accounting.startUndoPlace, s.start)).operation.state.kind).toBe("done");
  expect(await state(s.t)).toEqual(done);
});

test("locked-month entries reverse today, preserving old totals and Budget consumption", async () => {
  const s = await setup();
  await s.t.action(api.budget.setCategoryLimit, { workspaceId: s.workspace.id, categoryId: s.expenseCategory, effectiveMonth: "2026-09", limit: money(500), expectedRevisionId: null, idempotencyKey: "budget" });
  await s.expense("old", 120);
  await lock(s.t, s.workspace.id, { year: 2026, month: 9 });
  const before = (await state(s.t)).totals.filter(t => t.period === "2026-09");
  vi.setSystemTime(new Date("2026-10-20T15:00:00Z"));
  expect(await s.t.query(api.accounting.previewUndoPlace, s.target)).toMatchObject({ page: { lockedMonthEntries: 2, currentMonthExpenseChange: money(-120) } });
  await s.t.action(api.accounting.startUndoPlace, s.start);
  await s.finish();
  expect((await state(s.t)).totals.filter(t => t.period === "2026-09")).toEqual(before);
  const reversals = (await s.t.query(api.accounting.listJournalEntries, { workspaceId: s.workspace.id })).filter(e => e.reversesEntryId);
  expect(reversals.map(e => e.accountingDate)).toEqual(["2026-10-20", "2026-10-20"]);
  expect((await s.t.query(api.budget.evaluate, { workspaceId: s.workspace.id, month: "2026-09" })).jars[0]?.consumptionMinorUnits).toBe(120);
  expect((await s.t.query(api.budget.evaluate, { workspaceId: s.workspace.id, month: "2026-10" })).jars[0]?.consumptionMinorUnits).toBe(-120);
  await expectReconciled(s.t, s.workspace.id);
});

test("locked current month refuses Start without writes, and a mid-operation lock pauses until a new open month", async () => {
  const s = await setup();
  for (let i = 0; i < 22; i++) await s.expense(`entry-${i}`, 1);
  await lock(s.t, s.workspace.id, { year: 2026, month: 9 });
  const before = await state(s.t);
  await expect(s.t.action(api.accounting.startUndoPlace, s.start)).rejects.toThrow("place_undo_current_period_locked");
  expect(await s.t.query(api.accounting.previewUndoPlace, s.target)).toMatchObject({ canUndo: false, blockers: [{ code: "place_undo_current_period_locked" }] });
  expect(await state(s.t)).toEqual(before);
  vi.setSystemTime(new Date("2026-10-02T15:00:00Z"));
  const receipt = await s.t.action(api.accounting.startUndoPlace, s.start);
  const operationId = receipt.operation.id as Id<"placeUndoOperations">;
  await s.t.mutation(internal.accountingUndo.drive, { operationId, version: 0 });
  expect(await s.status()).toMatchObject({ reversedCount: 20, version: 1 });
  await lock(s.t, s.workspace.id, { year: 2026, month: 10 });
  await s.t.mutation(internal.accountingUndo.drive, { operationId, version: 1 });
  expect(await s.status()).toMatchObject({ state: { kind: "paused", code: "place_undo_current_period_locked" }, reversedCount: 20 });
  expect((await state(s.t)).endings).toHaveLength(0);
  vi.setSystemTime(new Date("2026-11-02T15:00:00Z"));
  await s.finish();
  expect(await s.status()).toMatchObject({ state: { kind: "done" }, reversedCount: 23 });
});

test("a failed reversal rolls back its batch, reports the entry, and can continue after repair", async () => {
  const s = await setup();
  for (let i = 0; i < 21; i++) await s.expense(`entry-${i}`, 1);
  const receipt = await s.t.action(api.accounting.startUndoPlace, s.start);
  const operationId = receipt.operation.id as Id<"placeUndoOperations">;
  await s.t.mutation(internal.accountingUndo.drive, { operationId, version: 0 });
  const before = await state(s.t);
  const reversalModule = await import("../src/accounting/commands/reversePostedEntry");
  const realReverse = reversalModule.reversePostedEntry;
  const fault = vi.spyOn(reversalModule, "reversePostedEntry");
  fault.mockImplementationOnce(realReverse).mockRejectedValueOnce(new AccountingError("ledger_totals_out_of_range"));
  await s.t.mutation(internal.accountingUndo.drive, { operationId, version: 1 });
  fault.mockRestore();
  expect(await s.status()).toMatchObject({ state: { kind: "needs_attention", code: "ledger_totals_out_of_range", detail: "Ledger totals exceed the supported amount range", journalEntryId: expect.any(String) }, reversedCount: 20 });
  expect((await state(s.t)).entries).toEqual(before.entries);
  expect((await state(s.t)).endings).toHaveLength(0);
  expect(await s.t.query(api.accounting.previewUndoPlace, s.target)).toMatchObject({ operation: { state: { kind: "needs_attention" } }, closure: { status: "undoing" } });
  await s.t.mutation(internal.accountingUndo.retryAfterRepair, { operationId });
  await s.finish();
  expect(await s.status()).toMatchObject({ state: { kind: "done" }, reversedCount: 22 });
});

test("zero-balance invariant prevents an ending if a stored total is corrupted", async () => {
  const s = await setup();
  const receipt = await s.t.action(api.accounting.startUndoPlace, s.start);
  await s.t.run(async ctx => {
    const total = await ctx.db.query("ledgerAccountTotals").filter(q => q.and(q.eq(q.field("ledgerAccountId"), s.place.ledgerAccountId), q.eq(q.field("period"), "*"))).unique();
    if (!total) throw new Error("Missing total");
    await ctx.db.patch(total._id, { debitMinorUnits: total.debitMinorUnits + 1 });
  });
  await s.finish();
  expect(await s.status()).toMatchObject({ id: receipt.operation.id, state: { kind: "needs_attention", code: "place_undo_balance_not_zero" } });
  expect((await state(s.t)).endings).toHaveLength(0);
});

test("authorized batches finish after membership removal and device revocation; public replay still checks authorization", async () => {
  const s = await setup();
  const receipt = await s.t.action(api.accounting.startUndoPlace, s.start);
  await s.t.run(async ctx => {
    for (const membership of await ctx.db.query("workspaceMemberships").collect()) await ctx.db.delete(membership._id);
    const device = await ctx.db.get(s.deviceId);
    if (device) await ctx.db.patch(device._id, { revokedAt: Date.now() });
  });
  await expect(s.t.action(api.accounting.startUndoPlace, s.start)).rejects.toThrow();
  await s.finish();
  expect((await state(s.t)).operations[0]).toMatchObject({ _id: receipt.operation.id, state: { kind: "done" }, reversedCount: 1 });
});

test("last open Place, ended Places and invalid targets refuse without writes", async () => {
  const s = await setup(undefined, 0);
  await s.t.action(api.accounting.closePlace, { ...s.start, financialAccountProfileId: s.other.id, idempotencyKey: "close-other", lines: [] });
  await s.t.action(api.accounting.closePlace, { ...s.start, financialAccountProfileId: s.third.id, idempotencyKey: "close-third", lines: [] });
  const before = await state(s.t);
  await expect(s.t.action(api.accounting.startUndoPlace, s.start)).rejects.toThrow("place_last_open");
  expect(await s.t.query(api.accounting.previewUndoPlace, s.target)).toMatchObject({ canUndo: false, blockers: [{ code: "place_last_open" }] });
  await expect(s.t.action(api.accounting.startUndoPlace, { ...s.start, financialAccountProfileId: s.other.id })).rejects.toThrow("financial_account_profile_ended");
  await expect(s.t.action(api.accounting.startUndoPlace, { ...s.start, financialAccountProfileId: "bad" })).rejects.toThrow("financial_account_profile_not_found");
  expect(await state(s.t)).toEqual(before);
});

test("Undo replaces the default atomically, reserves its name until completion and keeps exact retry intent", async () => {
  vi.useFakeTimers();
  const { t, root } = await accountingFixture(modules);
  const initial = await t.action(api.accounting.ensurePersonalDefaults, { functionalCurrency: "COP", startingMinorUnits: 100, timeZone: "America/Bogota" });
  const { workspace, financialAccountProfile: place } = initial;
  const other = await createProfile(t, workspace.id, "Replacement", "cash");
  const target = { workspaceId: workspace.id, financialAccountProfileId: place.id };
  const args = { ...target, idempotencyKey: "default-undo" };
  expect(await t.query(api.accounting.previewUndoPlace, target)).toMatchObject({ closure: { isDefault: true, requiresReplacementDefault: true } });
  const before = await state(t);
  await expect(t.action(api.accounting.startUndoPlace, args)).rejects.toThrow("place_default_replacement_required");
  await expect(t.action(api.accounting.startUndoPlace, { ...args, replacementDefaultFinancialAccountProfileId: place.id })).rejects.toThrow("place_default_replacement_invalid");
  await expect(t.action(api.accounting.startUndoPlace, { ...args, replacementDefaultFinancialAccountProfileId: "bad" })).rejects.toThrow("financial_account_profile_not_found");
  expect(await state(t)).toEqual(before);
  const request = { ...args, replacementDefaultFinancialAccountProfileId: other.id };
  const started = await t.action(api.accounting.startUndoPlace, request);
  expect(await t.query(api.accounting.workspaceSettings, { workspaceId: workspace.id })).toMatchObject({ defaultFinancialAccountProfileId: other.id });
  await expect(createProfile(t, workspace.id, place.name, "cash")).rejects.toThrow("account_name_conflict");
  expect(await t.action(api.accounting.startUndoPlace, request)).toEqual({ ...started, replay: true });
  await root.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect(await t.query(api.accounting.placeUndoStatus, target)).toMatchObject({ state: { kind: "done" }, replacementDefaultFinancialAccountProfileId: other.id });
  await expect(t.action(api.accounting.startUndoPlace, args)).rejects.toThrow("idempotency_key_conflict");
  expect((await state(t)).settings).toHaveLength(1);
});

async function plan(s: Awaited<ReturnType<typeof setup>>, sourceJournalEntryId: string, destinationFinancialAccountProfileId: string) {
  return s.t.action(api.savingsRecovery.activatePlan, { workspaceId: s.workspace.id, sourceJournalEntryId, destinationFinancialAccountProfileId,
    installmentCount: 4, installmentMinorUnits: 25, idempotencyKey: `plan-${sourceJournalEntryId}` });
}
test.each([false, true])("Recovery destination blocks Undo, including suspended=%s", async suspended => {
  const s = await setup();
  const source = await s.t.action(api.accounting.recordCashExpense, { workspaceId: s.workspace.id, financialAccountProfileId: s.other.id, amount: money(100), accountingDate: "2026-09-24", description: "Recover", idempotencyKey: "recover" });
  const saved = await plan(s, source.id, s.place.id);
  if (suspended) await reverse(s.t, s.workspace.id, source.id);
  const before = await state(s.t);
  expect(await s.t.query(api.accounting.previewUndoPlace, s.target)).toMatchObject({ canUndo: false, blockers: [{ code: "place_recovery_destination", plans: [{ id: saved.plan.id, title: "Recover" }] }] });
  await expect(s.t.action(api.accounting.startUndoPlace, s.start)).rejects.toThrow("place_recovery_destination");
  expect(await state(s.t)).toEqual(before);
});

test("a funded Recovery expense blocks Undo even after plan cancellation", async () => {
  const s = await setup();
  const expense = await s.expense("covered");
  const saved = await plan(s, expense.id, s.third.id);
  await s.t.action(api.savingsRecovery.recordContribution, { workspaceId: s.workspace.id, planId: saved.plan.id, sourceFinancialAccountProfileId: s.other.id, amount: money(20), accountingDate: "2026-09-24", description: "Progress", idempotencyKey: "progress" });
  const before = await state(s.t);
  expect(await s.t.query(api.accounting.previewUndoPlace, s.target)).toMatchObject({ canUndo: false, blockers: [{ code: "place_recovery_covered_expenses", plans: [{ id: saved.plan.id, title: "covered" }] }] });
  await expect(s.t.action(api.accounting.startUndoPlace, s.start)).rejects.toThrow("place_recovery_covered_expenses");
  expect(await state(s.t)).toEqual(before);
  await s.t.action(api.savingsRecovery.cancelPlan, { workspaceId: s.workspace.id, planId: saved.plan.id, idempotencyKey: "cancel" });
  await expect(s.t.action(api.accounting.startUndoPlace, s.start)).rejects.toThrow("place_recovery_covered_expenses");
});

test("an unfunded source plan is allowed and suspends; its first contribution cannot race Undo", async () => {
  const s = await setup();
  const expense = await s.expense("covered");
  const saved = await plan(s, expense.id, s.third.id);
  expect(await s.t.query(api.accounting.previewUndoPlace, s.target)).toMatchObject({ canUndo: true });
  await s.t.action(api.accounting.startUndoPlace, s.start);
  const before = await state(s.t);
  await expect(s.t.action(api.savingsRecovery.recordContribution, { workspaceId: s.workspace.id, planId: saved.plan.id, sourceFinancialAccountProfileId: s.other.id, amount: money(10), accountingDate: "2026-09-24", description: "Too late", idempotencyKey: "late" })).rejects.toThrow("place_undo_in_progress");
  expect(await state(s.t)).toEqual(before);
  await s.finish();
  expect((await s.t.query(api.savingsRecovery.evaluate, { workspaceId: s.workspace.id })).plans[0]).toMatchObject({ id: saved.plan.id, status: "suspended", recoveredMinorUnits: 0, acceptsContributions: false });
});

test.each(["co-puc-personal@1", "us-gaap-personal@1"])("%s Close creates adjustment names once, trims them and compares them on replay", async template => {
  const s = await setup(template);
  const names = { closingAdjustmentExpenseName: "  Ajuste de cierre (gasto)  ", closingAdjustmentIncomeName: "Ajuste de cierre (ingreso)" };
  const args = { ...s.start, ...names, lines: [{ kind: "adjustment" as const, amount: money(1000) }] };
  const receipt = await s.t.action(api.accounting.closePlace, args);
  expect(receipt.ending.entries[0]?.lines[0]?.userCategoryName).toBe("Ajuste de cierre (gasto)");
  expect(await s.t.action(api.accounting.closePlace, { ...args, closingAdjustmentExpenseName: names.closingAdjustmentExpenseName.trim() })).toEqual({ ...receipt, replay: true });
  await expect(s.t.action(api.accounting.closePlace, { ...args, closingAdjustmentIncomeName: "Changed" })).rejects.toThrow("idempotency_key_conflict");
  await s.t.action(api.accounting.recordOpeningPosition, { workspaceId: s.workspace.id, financialAccountProfileId: s.other.id, amount: money(10), accountingDate: "2026-09-24", description: "Other", idempotencyKey: "other-opening" });
  const second = await s.t.action(api.accounting.closePlace, { ...args, financialAccountProfileId: s.other.id, idempotencyKey: "other-close", closingAdjustmentExpenseName: "Keep the original", lines: [{ kind: "adjustment", amount: money(10) }] });
  expect(second.ending.entries[0]?.lines[0]?.userCategoryName).toBe("Ajuste de cierre (gasto)");
  const debt = await createProfile(s.t, s.workspace.id, "Debt", "creditCard");
  await s.t.action(api.accounting.recordOpeningPosition, { workspaceId: s.workspace.id, financialAccountProfileId: debt.id, amount: money(30), accountingDate: "2026-09-24", description: "Debt", idempotencyKey: "debt-opening" });
  const income = await s.t.action(api.accounting.closePlace, { ...args, financialAccountProfileId: debt.id, idempotencyKey: "debt-close", lines: [{ kind: "adjustment", amount: money(30) }] });
  expect(income.ending.entries[0]?.lines[1]?.userCategoryName).toBe("Ajuste de cierre (ingreso)");
});
test.each(["", "\u200b", "x".repeat(81)])("Close refuses invalid stored adjustment names without writes: %s", async name => {
  const s = await setup();
  const before = await state(s.t);
  await expect(s.t.action(api.accounting.closePlace, { ...s.start, lines: [{ kind: "adjustment", amount: money(1000) }], closingAdjustmentExpenseName: name })).rejects.toThrow(name.length > 80 ? "category_name_too_long" : "name_required");
  expect(await state(s.t)).toEqual(before);
});

test("Undo applies Recovery's automatic cancellation when reversing a completed plan's transfer", async () => {
  const s = await setup();
  const source = await s.t.action(api.accounting.recordCashExpense, { workspaceId: s.workspace.id, financialAccountProfileId: s.other.id, amount: money(1200), accountingDate: "2026-09-24", description: "External expense", idempotencyKey: "external" });
  const activate = { workspaceId: s.workspace.id, sourceJournalEntryId: source.id, destinationFinancialAccountProfileId: s.third.id, installmentCount: 6, installmentMinorUnits: 230, idempotencyKey: "original-plan" };
  const original = await s.t.action(api.savingsRecovery.activatePlan, activate);
  const contribution = (planId: string, key: string, from: string, amount: number) => s.t.action(api.savingsRecovery.recordContribution, { workspaceId: s.workspace.id, planId, sourceFinancialAccountProfileId: from, amount: money(amount), accountingDate: "2026-09-24", description: key, idempotencyKey: key });
  const gift = await contribution(original.plan.id, "partial", s.other.id, 230);
  await s.t.action(api.savingsRecovery.cancelPlan, { workspaceId: s.workspace.id, planId: original.plan.id, idempotencyKey: "cancel-original" });
  const replacement = await s.t.action(api.savingsRecovery.activatePlan, { ...activate, replacesPlanId: original.plan.id, installmentCount: 4, installmentMinorUnits: 250, idempotencyKey: "replacement" });
  const completed = await contribution(replacement.plan.id, "complete", s.place.id, 1000);
  await s.t.action(api.savingsRecovery.correctContribution, { workspaceId: s.workspace.id, contributionId: gift.contribution.id, reason: "Ordinary saving", idempotencyKey: "remove-first" });
  const unfinished = await s.t.action(api.savingsRecovery.activatePlan, { ...activate, installmentCount: 4, installmentMinorUnits: 50, idempotencyKey: "newer" });
  await s.t.action(api.accounting.startUndoPlace, s.start);
  await s.finish();
  expect(await s.status()).toMatchObject({ state: { kind: "done" }, reversedCount: 2 });
  const recovery = await s.t.query(api.savingsRecovery.evaluate, { workspaceId: s.workspace.id });
  expect(recovery.plans.find(p => p.id === replacement.plan.id)).toMatchObject({ status: "cancelled", recoveredMinorUnits: 0,
    cancellation: { origin: { kind: "automatic", unfinishedPlanId: unfinished.plan.id, cause: { kind: "transfer_reversed", transferJournalEntryId: completed.transfer.id } } },
    contributionHistory: [{ status: "voided", transferReversed: true }] });
  expect(recovery.plans.find(p => p.id === unfinished.plan.id)).toMatchObject({ status: "active", principalMinorUnits: 200 });
  await expectReconciled(s.t, s.workspace.id);
});

test("an empty zero opening has no journal to reverse and still ends", async () => {
  const s = await setup(undefined, 0);
  expect(await s.t.query(api.accounting.previewUndoPlace, s.target)).toMatchObject({ page: { entriesToReverse: 0, isDone: true } });
  await s.t.action(api.accounting.startUndoPlace, s.start);
  await expect(s.t.action(api.accounting.recordOpeningPosition, { ...s.target, amount: money(0), accountingDate: "2026-09-24", description: "Try opening", idempotencyKey: "new-opening" })).rejects.toThrow("place_undo_in_progress");
  await s.finish();
  expect(await s.status()).toMatchObject({ state: { kind: "done" }, reversedCount: 0 });
});

test("preview and progress read legacy journal lines without the History projection or an unbounded journal scan", async () => {
  const s = await setup();
  await s.expense("legacy", 80);
  await s.t.run(async ctx => {
    for (const row of await ctx.db.query("journalEntryProfiles").collect()) await ctx.db.delete(row._id);
  });
  const storeModule = await import("./store");
  const realReadStore = storeModule.convexReadStore;
  const realWriteStore = storeModule.convexStore;
  const noScan = async (): Promise<never> => { throw new Error("Unbounded journal scan"); };
  const readFault = vi.spyOn(storeModule, "convexReadStore").mockImplementation(db => ({ ...realReadStore(db), listJournalEntries: noScan }));
  const writeFault = vi.spyOn(storeModule, "convexStore").mockImplementation(db => ({ ...realWriteStore(db), listJournalEntries: noScan }));
  try {
    expect(await s.t.query(api.accounting.previewUndoPlace, s.target)).toMatchObject({ page: { entriesToReverse: 2, currentMonthExpenseChange: money(-80) } });
    await s.t.action(api.accounting.startUndoPlace, s.start);
    await s.finish();
    expect(await s.status()).toMatchObject({ state: { kind: "done" }, reversedCount: 2 });
  } finally {
    readFault.mockRestore(); writeFault.mockRestore();
  }
});

test("a future-dated original pauses rather than ending and resumes on its date", async () => {
  const s = await setup();
  await s.t.action(api.accounting.recordCashExpense, { ...s.target, amount: money(10), accountingDate: "2026-10-02", description: "Future", idempotencyKey: "future" });
  const receipt = await s.t.action(api.accounting.startUndoPlace, s.start);
  await s.t.mutation(internal.accountingUndo.drive, { operationId: receipt.operation.id as Id<"placeUndoOperations">, version: 0 });
  expect(await s.status()).toMatchObject({ state: { kind: "paused", code: "reversal_date_before_original" }, reversedCount: 0 });
  expect((await state(s.t)).endings).toHaveLength(0);
  vi.setSystemTime(new Date("2026-10-02T15:00:00Z"));
  await s.finish();
  expect(await s.status()).toMatchObject({ state: { kind: "done" }, reversedCount: 2 });
});

test("a previously closed transfer counterparty stops the operation with the exact failed entry", async () => {
  const s = await setup();
  const transfer = await s.transfer("to-ended", s.place.id, s.other.id, 100);
  await s.t.action(api.accounting.closePlace, { ...s.start, financialAccountProfileId: s.other.id, idempotencyKey: "close-other", lines: [{ kind: "adjustment", amount: money(100) }] });
  await s.t.action(api.accounting.startUndoPlace, s.start);
  await s.finish();
  expect(await s.status()).toMatchObject({ state: { kind: "needs_attention", code: "financial_account_profile_ended", journalEntryId: transfer.id }, reversedCount: 0 });
  expect((await state(s.t)).endings.map(e => e.act)).toEqual(["close"]);
});
