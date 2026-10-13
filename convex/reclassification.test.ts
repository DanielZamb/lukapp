import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { convexAccounting, createDaily, createOwnedWorkspace, groceries, lock, reverse, septNow, owner } from "../src/accounting/convexHarness";
import type { AccountingTest } from "../src/accounting/convexHarness";
import type { ReclassificationTarget } from "../src/accounting/categoryTypes";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
afterEach(() => vi.unstubAllEnvs());
async function fixture(template = "co-puc-personal@1", household = false) {
  const t = convexAccounting(modules);
  const args = { functionalCurrency: "COP", chartOfAccountsTemplate: template, now: septNow };
  const w = household ? await t.mutation(api.accounting.createHouseholdWorkspace, { ...args, idempotencyKey: "house" }) : await t.mutation(api.accounting.createPersonalWorkspace, args);
  const daily = await createDaily(t, w.id);
  const result = await t.mutation(api.accounting.createUserCategory, { workspaceId: w.id, name: "Mercado", selection: { kind: "preset", concept: "groceries" }, idempotencyKey: "category" });
  if (result.kind !== "category") throw new Error("Expected category");
  const category = result.category;
  async function spend(amount: number, date: string, key: string) {
    return t.mutation(api.accounting.recordCashExpense, { ...groceries(w.id, daily.id, { amount, accountingDate: date, idempotencyKey: key }), userCategoryId: category.id });
  }
  return { t, w, daily, category, spend };
}
async function classify(t: AccountingTest, workspaceId: string, categoryId: string, target: ReclassificationTarget, key: string, currentDate = "2026-11-20") {
  const request = { workspaceId, categoryId, target, currentDate };
  const preview = await t.query(api.accounting.previewCategoryReclassification, request);
  const confirmed = await t.mutation(api.accounting.confirmCategoryReclassification, { ...request, revisionToken: preview.revisionToken, confirmed: true, idempotencyKey: key });
  return { request, preview, confirmed };
}
async function effects(t: AccountingTest) {
  return t.run(async ctx => (await ctx.db.query("journalSourceEffects").collect()).map(({ sourceEntryId, journalEntryId, expenseDeltaMinorUnits }) => ({ sourceEntryId, journalEntryId, expenseDeltaMinorUnits })));
}

for (const template of ["co-puc-personal@1", "us-gaap-personal@1"]) for (const household of [false, true]) test(`${template}/${household ? "Household" : "Personal"}: corrections are dated, balanced, immutable and revision-bound across locked/open history`, async () => {
  const { t, w, category, spend, daily } = await fixture(template, household);
  const original = [await spend(100, "2026-09-24", "sept"), await spend(200, "2026-10-10", "oct"), await spend(300, "2026-11-10", "nov")];
  await lock(t, w.id, { year: 2026, month: 9 });
  const before = await t.run(async ctx => ({ entries: await ctx.db.query("journalEntries").collect(), lines: await ctx.db.query("journalLines").collect() }));
  const target: ReclassificationTarget = { kind: "category", nature: "Income", accountCode: template.startsWith("co") ? "42201001" : "4210" };
  const { request, preview, confirmed } = await classify(t, w.id, category.id, target, "correct");
  expect(preview).toMatchObject({ entryCount: 3, lineCount: 3, amount: { currency: "COP", minorUnits: 600 }, lockedEntryCount: 1, lockedAmount: { currency: "COP", minorUnits: 100 }, correctionDates: ["2026-10-10", "2026-11-20"] });
  expect(confirmed.correctionEntryIds).toHaveLength(2);
  const entries = await t.query(api.accounting.listJournalEntries, { workspaceId: w.id });
  const corrections = entries.filter(e => e.policy === "category-reclassification@1").sort((a, b) => a.accountingDate.localeCompare(b.accountingDate));
  expect(corrections.map(e => [e.accountingDate, e.amount.minorUnits])).toEqual([["2026-10-10", 200], ["2026-11-20", 400]]);
  for (const e of corrections) {
    expect(e.lines.reduce((n, l) => n + l.debitMinorUnits, 0)).toBe(e.lines.reduce((n, l) => n + l.creditMinorUnits, 0));
    expect(e.lines.filter(l => l.categoryCorrection?.side === "reversing").every(l => l.category?.categoryId === category.id && l.category.nature === "Expense")).toBe(true);
    expect(e.lines.filter(l => l.categoryCorrection?.side === "replacement").every(l => l.category?.nature === "Income")).toBe(true);
  }
  expect(corrections[1]?.description).toBe("Prior-period category correction: Mercado");
  expect(corrections[1]?.lines.flatMap(l => l.categoryCorrection?.priorLockedPeriods ?? [])).toContain("2026-09");
  expect(await effects(t)).toEqual(expect.arrayContaining(original.map(e => ({ sourceEntryId: e.id, journalEntryId: e.accountingDate.startsWith("2026-10") ? corrections[0]?.id : corrections[1]?.id, expenseDeltaMinorUnits: -e.amount.minorUnits }))));
  expect((await effects(t))).toHaveLength(3);
  const totals = await t.query(api.accounting.categoryTotals, { workspaceId: w.id });
  expect(totals.map(row => [row.month, row.expense.minorUnits, row.income.minorUnits])).toEqual([[9, 100, 0], [10, 0, -200], [11, -100, -400]]);
  expect((await t.query(api.accounting.balances, { workspaceId: w.id })).find(b => b.financialAccountProfileId === daily.id)?.balance.minorUnits).toBe(-600);
  const after = await t.run(async ctx => ({ entries: await ctx.db.query("journalEntries").collect(), lines: await ctx.db.query("journalLines").collect() }));
  for (const doc of before.entries) expect(after.entries.find(e => e._id === doc._id)).toEqual(doc);
  for (const doc of before.lines) expect(after.lines.find(l => l._id === doc._id)).toEqual(doc);
  expect(await t.mutation(api.accounting.confirmCategoryReclassification, { ...request, revisionToken: preview.revisionToken, confirmed: true, idempotencyKey: "correct" })).toEqual({ ...confirmed, replay: true });
  expect(await t.mutation(api.accounting.confirmCategoryReclassification, { ...request, revisionToken: preview.revisionToken, confirmed: true, idempotencyKey: "different" }).catch(e => e)).toMatchObject({ data: { code: "reclassification_stale" } });
  expect(await effects(t)).toHaveLength(3);
});

test("within-nature and repeated reclassification follow earlier corrections and preserve original-root source eligibility", async () => {
  const { t, w, category, spend } = await fixture();
  const first = await spend(100, "2026-09-24", "first");
  const neutral = await spend(40, "2026-09-25", "neutral");
  await reverse(t, w.id, neutral.id, { accountingDate: "2026-09-26" });
  const within = await classify(t, w.id, category.id, { kind: "category", nature: "Expense", accountCode: "512010" }, "within", "2026-09-28");
  expect(within.preview.amount.minorUnits).toBe(100);
  expect(await effects(t)).toEqual([]);
  const income = await classify(t, w.id, category.id, { kind: "category", nature: "Income", accountCode: "42201001" }, "income", "2026-09-28");
  expect(income.preview.buckets.map(b => [b.signedMinorUnits, b.ledgerAccountId])).toEqual([[100, (await t.query(api.accounting.listLedgerAccounts, { workspaceId: w.id })).find(a => a.code === "512010")?.id]]);
  expect(await effects(t)).toEqual([{ sourceEntryId: first.id, journalEntryId: income.confirmed.correctionEntryIds[0], expenseDeltaMinorUnits: -100 }]);
  const restored = await classify(t, w.id, category.id, { kind: "category", nature: "Expense", accountCode: "519535" }, "restored", "2026-09-28");
  expect(await effects(t)).toEqual(expect.arrayContaining([{ sourceEntryId: first.id, journalEntryId: restored.confirmed.correctionEntryIds[0], expenseDeltaMinorUnits: 100 }]));
  expect((await effects(t)).reduce((n, e) => n + e.expenseDeltaMinorUnits, 0)).toBe(0);
  const totals = await t.query(api.accounting.categoryTotals, { workspaceId: w.id });
  expect(totals[0]).toMatchObject({ expense: { minorUnits: 100 }, income: { minorUnits: 0 } });
  const trial = await t.query(api.accounting.trialBalance, { workspaceId: w.id });
  expect(trial.find(a => a.code === "519535")).toMatchObject({ debitMinorUnits: 100, creditMinorUnits: 0 });
  expect(trial.reduce((n, r) => n + r.debitMinorUnits - r.creditMinorUnits, 0)).toBe(0);
});

test("correction reversal mirrors source effects exactly once and later preview uses the restored ledger treatment", async () => {
  const { t, w, category, spend } = await fixture(); const original = await spend(125, "2026-09-24", "source");
  const { confirmed } = await classify(t, w.id, category.id, { kind: "category", nature: "Income", accountCode: "42201001" }, "income", "2026-09-28");
  const correctionId = confirmed.correctionEntryIds[0]; if (!correctionId) throw new Error("Correction missing");
  const reversal = await reverse(t, w.id, correctionId, { accountingDate: "2026-09-29", idempotencyKey: "reverse-correction" });
  expect((await reverse(t, w.id, correctionId, { accountingDate: "2026-09-29", idempotencyKey: "reverse-correction" })).replay).toBe(true);
  expect(await effects(t)).toEqual([{ sourceEntryId: original.id, journalEntryId: correctionId, expenseDeltaMinorUnits: -125 }, { sourceEntryId: original.id, journalEntryId: reversal.id, expenseDeltaMinorUnits: 125 }]);
  const next = await classify(t, w.id, category.id, { kind: "category", nature: "Income", accountCode: "42959501" }, "again", "2026-09-30");
  expect(next.preview.amount.minorUnits).toBe(125);
  expect((await effects(t)).reduce((n, r) => n + r.expenseDeltaMinorUnits, 0)).toBe(-125);
  expect((await t.query(api.accounting.categoryTotals, { workspaceId: w.id }))[0]).toMatchObject({ expense: { minorUnits: 0 }, income: { minorUnits: -125 } });
});

test("profile conversion uses canonical setup and normal-side personal debt opening without touching Recovery", async () => {
  const { t, w, category, spend, daily } = await fixture(); const source = await spend(200, "2026-09-24", "payment");
  const target: ReclassificationTarget = { kind: "profile", setup: { name: "Debt to Mom", productKind: "personalDebt", classificationAnswers: { kind: "personalDebt", counterpartyName: "Mom" }, amount: { currency: "COP", minorUnits: 900 }, accountingDate: "2026-09-01", description: "Owed at start" } };
  const result = await classify(t, w.id, category.id, target, "convert", "2026-09-30");
  expect(result.confirmed.category).toMatchObject({ status: "archived", classification: { kind: "converted", financialAccountProfileId: result.confirmed.financialAccountProfileId } });
  const balances = await t.query(api.accounting.balances, { workspaceId: w.id });
  expect(balances.find(b => b.financialAccountProfileId === result.confirmed.financialAccountProfileId)).toMatchObject({ nature: "Liability", balance: { currency: "COP", minorUnits: 700 } });
  expect(balances.find(b => b.financialAccountProfileId === daily.id)?.balance.minorUnits).toBe(-200);
  expect(await effects(t)).toEqual([{ sourceEntryId: source.id, journalEntryId: result.confirmed.correctionEntryIds[0], expenseDeltaMinorUnits: -200 }]);
  expect((await t.query(api.accounting.categoryTotals, { workspaceId: w.id }))[0]?.expense.minorUnits).toBe(0);
  const entries = await t.query(api.accounting.listJournalEntries, { workspaceId: w.id });
  expect(entries.find(e => e.policy === "opening-position@1")?.lines.find(l => l.nature === "Liability")).toMatchObject({ code: "21950501", creditMinorUnits: 900 });
  expect(entries.find(e => e.policy === "category-reclassification@1")?.lines.find(l => l.nature === "Liability")).toMatchObject({ code: "21950501", debitMinorUnits: 200 });
});

test("asset conversion leaves new profile balance and category total consistent", async () => {
  const { t, w, category, spend } = await fixture("us-gaap-personal@1", true); await spend(250, "2026-09-24", "investment");
  const target: ReclassificationTarget = { kind: "profile", setup: { name: "CD", productKind: "investment", classificationAnswers: { kind: "investment", form: "termDeposit" }, amount: { currency: "COP", minorUnits: 0 }, accountingDate: "2026-09-01", description: "No prior balance" } };
  const result = await classify(t, w.id, category.id, target, "convert", "2026-09-30");
  expect((await t.query(api.accounting.balances, { workspaceId: w.id })).find(b => b.financialAccountProfileId === result.confirmed.financialAccountProfileId)).toMatchObject({ nature: "Asset", balance: { minorUnits: 250 } });
  expect((await t.query(api.accounting.categoryTotals, { workspaceId: w.id }))[0]?.expense.minorUnits).toBe(0);
});

test("changed category/history/period/authority invalidates confirmation; no current open period and errors roll back atomically", async () => {
  const { t, w, category, spend } = await fixture(); await spend(100, "2026-09-24", "one");
  const request = { workspaceId: w.id, categoryId: category.id, target: { kind: "category" as const, nature: "Income" as const, accountCode: "42201001" }, currentDate: "2026-09-30" };
  const p = await t.query(api.accounting.previewCategoryReclassification, request);
  await spend(50, "2026-09-25", "two");
  expect(await t.mutation(api.accounting.confirmCategoryReclassification, { ...request, revisionToken: p.revisionToken, confirmed: true, idempotencyKey: "stale" }).catch(e => e)).toMatchObject({ data: { code: "reclassification_stale" } });
  await lock(t, w.id, { year: 2026, month: 9 });
  expect(await t.query(api.accounting.previewCategoryReclassification, { ...request, currentDate: "2026-10-01" }).catch(e => e)).toMatchObject({ data: { code: "reclassification_current_period_required" } });
  expect((await t.query(api.accounting.listJournalEntries, { workspaceId: w.id }))).toHaveLength(2);
  await spend(1, "2026-10-01", "open-oct");
  const target: ReclassificationTarget = { kind: "profile", setup: { name: "Bad conversion", productKind: "cash", amount: { currency: "COP", minorUnits: -1 }, accountingDate: "2026-10-01", description: "Invalid amount" } };
  const profileRequest = { ...request, target, currentDate: "2026-10-02" };
  const invalidPreview = await t.query(api.accounting.previewCategoryReclassification, profileRequest);
  const before = await t.run(async ctx => ({ profiles: await ctx.db.query("financialAccountProfiles").collect(), accounts: await ctx.db.query("ledgerAccounts").collect(), receipts: await ctx.db.query("categoryReceipts").collect() }));
  expect(await t.mutation(api.accounting.confirmCategoryReclassification, { ...profileRequest, revisionToken: invalidPreview.revisionToken, confirmed: true, idempotencyKey: "bad-conversion" }).catch(e => e)).toMatchObject({ data: { code: "opening_amount_invalid" } });
  expect(await t.run(async ctx => ({ profiles: await ctx.db.query("financialAccountProfiles").collect(), accounts: await ctx.db.query("ledgerAccounts").collect(), receipts: await ctx.db.query("categoryReceipts").collect() }))).toEqual(before);
  expect(await effects(t)).toEqual([]);
  const freshRequest = { ...request, currentDate: "2026-10-02" }; const fresh = await t.query(api.accounting.previewCategoryReclassification, freshRequest);
  await t.run(async ctx => { const memberships = await ctx.db.query("workspaceMemberships").collect(); const member = memberships.find(m => m.userId === owner.userId); if (!member) throw new Error("Membership absent"); await ctx.db.patch(member._id, { role: "Preparer" }); });
  expect(await t.mutation(api.accounting.confirmCategoryReclassification, { ...freshRequest, revisionToken: fresh.revisionToken, confirmed: true, idempotencyKey: "lost-authority" }).catch(e => e)).toMatchObject({ data: { code: "workspace_permission_required" } });
});

test("simultaneous exact retries converge and changed keys cannot both consume one revision", async () => {
  const { t, w, category, spend } = await fixture(); await spend(100, "2026-09-24", "source");
  const request = { workspaceId: w.id, categoryId: category.id, target: { kind: "category" as const, nature: "Income" as const, accountCode: "42201001" }, currentDate: "2026-09-30" };
  const p = await t.query(api.accounting.previewCategoryReclassification, request);
  const args = { ...request, revisionToken: p.revisionToken, confirmed: true as const, idempotencyKey: "same" };
  const [a, b] = await Promise.all([t.mutation(api.accounting.confirmCategoryReclassification, args), t.mutation(api.accounting.confirmCategoryReclassification, args)]);
  expect(a.correctionEntryIds).toEqual(b.correctionEntryIds);
  expect([a.replay, b.replay].sort()).toEqual([false, true]);
  expect(await effects(t)).toHaveLength(1);
  expect(await t.mutation(api.accounting.confirmCategoryReclassification, { ...args, idempotencyKey: "different" }).catch(e => e)).toMatchObject({ data: { code: "reclassification_stale" } });
  expect(await t.mutation(api.accounting.confirmCategoryReclassification, { ...args, currentDate: "2026-09-29" }).catch(e => e)).toMatchObject({ data: { code: "idempotency_key_conflict" } });
});

test("renaming and locking after preview both invalidate confirmation with no correction writes", async () => {
  const { t, w, category, spend } = await fixture(); await spend(100, "2026-09-24", "source"); await spend(1, "2026-10-01", "open");
  const request = { workspaceId: w.id, categoryId: category.id, target: { kind: "category" as const, nature: "Expense" as const, accountCode: "512010" }, currentDate: "2026-10-02" };
  const beforeRename = await t.query(api.accounting.previewCategoryReclassification, request);
  await t.mutation(api.accounting.changeUserCategory, { workspaceId: w.id, categoryId: category.id, revision: 1, change: { kind: "rename", name: "New name" }, confirmed: true, idempotencyKey: "rename" });
  expect(await t.mutation(api.accounting.confirmCategoryReclassification, { ...request, revisionToken: beforeRename.revisionToken, confirmed: true, idempotencyKey: "stale-name" }).catch(e => e)).toMatchObject({ data: { code: "reclassification_stale" } });
  const beforeLock = await t.query(api.accounting.previewCategoryReclassification, request);
  await lock(t, w.id, { year: 2026, month: 9 });
  expect(await t.mutation(api.accounting.confirmCategoryReclassification, { ...request, revisionToken: beforeLock.revisionToken, confirmed: true, idempotencyKey: "stale-period" }).catch(e => e)).toMatchObject({ data: { code: "reclassification_stale" } });
  expect((await t.query(api.accounting.listJournalEntries, { workspaceId: w.id })).map(e => e.policy)).toEqual(["cash-expense@1", "cash-expense@1"]);
  expect(await effects(t)).toEqual([]);
});

test("a later correction-key collision rolls back all earlier corrections, category revision, receipt and source facts", async () => {
  const { t, w, category, spend } = await fixture(); await spend(100, "2026-09-24", "sept"); await spend(200, "2026-10-01", "collision:correction:2026-10");
  const request = { workspaceId: w.id, categoryId: category.id, target: { kind: "category" as const, nature: "Income" as const, accountCode: "42201001" }, currentDate: "2026-10-02" };
  const preview = await t.query(api.accounting.previewCategoryReclassification, request);
  const before = await t.run(async ctx => ({ entries: await ctx.db.query("journalEntries").collect(), lines: await ctx.db.query("journalLines").collect(), accounts: await ctx.db.query("ledgerAccounts").collect(), categories: await ctx.db.query("userCategories").collect(), receipts: await ctx.db.query("categoryReceipts").collect() }));
  expect(await t.mutation(api.accounting.confirmCategoryReclassification, { ...request, revisionToken: preview.revisionToken, confirmed: true, idempotencyKey: "collision" }).catch(e => e)).toMatchObject({ data: { code: "idempotency_key_conflict" } });
  expect(await t.run(async ctx => ({ entries: await ctx.db.query("journalEntries").collect(), lines: await ctx.db.query("journalLines").collect(), accounts: await ctx.db.query("ledgerAccounts").collect(), categories: await ctx.db.query("userCategories").collect(), receipts: await ctx.db.query("categoryReceipts").collect() }))).toEqual(before);
  expect(await effects(t)).toEqual([]);
});

test("reclassification after locked-period correction keeps root deltas exact despite catch-up lineage", async () => {
  const { t, w, category, spend } = await fixture(); const old = await spend(100, "2026-09-24", "old"); const current = await spend(200, "2026-10-10", "current");
  await lock(t, w.id, { year: 2026, month: 9 });
  await classify(t, w.id, category.id, { kind: "category", nature: "Expense", accountCode: "512010" }, "within", "2026-10-20");
  await classify(t, w.id, category.id, { kind: "category", nature: "Income", accountCode: "42201001" }, "income", "2026-10-20");
  const rows = await effects(t);
  expect(rows.filter(e => e.sourceEntryId === old.id).reduce((n, e) => n + e.expenseDeltaMinorUnits, 0)).toBe(-100);
  expect(rows.filter(e => e.sourceEntryId === current.id).reduce((n, e) => n + e.expenseDeltaMinorUnits, 0)).toBe(-200);
  expect((await t.query(api.accounting.categoryTotals, { workspaceId: w.id })).map(r => [r.month, r.expense.minorUnits, r.income.minorUnits])).toEqual([[9, 100, 0], [10, -100, -300]]);
});

test("equal-timestamp corrections and mirrors preserve per-source causal sequence and retries allocate no sequence", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-13T10:00:00Z"));
  try {
    const { t, w, category, spend } = await fixture(); const original = await spend(100, "2026-09-24", "source");
    const { confirmed } = await classify(t, w.id, category.id, { kind: "category", nature: "Income", accountCode: "42201001" }, "income", "2026-09-28");
    const id = confirmed.correctionEntryIds[0]; if (!id) throw new Error("Correction absent");
    await reverse(t, w.id, id, { accountingDate: "2026-09-29", idempotencyKey: "mirror" });
    await reverse(t, w.id, id, { accountingDate: "2026-09-29", idempotencyKey: "mirror" });
    const rows = await t.run(async ctx => {
      const workspaceId = ctx.db.normalizeId("workspaces", w.id); const sourceEntryId = ctx.db.normalizeId("journalEntries", original.id);
      if (!workspaceId || !sourceEntryId) throw new Error("Fixture ids missing");
      const rows = await ctx.db.query("journalSourceEffects").withIndex("by_workspace_source", q => q.eq("workspaceId", workspaceId).eq("sourceEntryId", sourceEntryId)).collect();
      return Promise.all(rows.map(async r => ({ sequence: r.sourceSequence, delta: r.expenseDeltaMinorUnits, postedAt: (await ctx.db.get(r.journalEntryId))?.postedAt })));
    });
    expect(rows).toEqual([{ sequence: 1, delta: -100, postedAt: Date.UTC(2026, 9, 13, 10) }, { sequence: 2, delta: 100, postedAt: Date.UTC(2026, 9, 13, 10) }]);
  } finally { vi.useRealTimers(); }
});
