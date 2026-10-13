import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { budgetFixture, createRule, updateRule, retireRule, evaluate, planningOnly, ledgerBytes } from "../src/budget/convexHarness";
import { groceries, lock, reverse, owner, createProfile } from "../src/accounting/convexHarness";
import { workspaceRolePolicyVersion, hasWorkspacePermission } from "../src/accounting/membership";
import type { BudgetFixture } from "../src/budget/convexHarness";
import type { ReclassificationTarget } from "../src/accounting/categoryTypes";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
function limited(row: Awaited<ReturnType<typeof evaluate>>["rows"][number]) {
  if (row.planning.kind !== "limited") throw new Error("Limited evaluation expected");
  return [row.actual.minorUnits, row.planning.limit.minorUnits, row.planning.carry.minorUnits,
    row.planning.available.minorUnits, row.planning.remaining.minorUnits, row.planning.overage.minorUnits, row.planning.carryOut.minorUnits];
}
function first(result: Awaited<ReturnType<typeof evaluate>>) {
  const row = result.rows[0]; if (!row) throw new Error("Budget row expected"); return row;
}
async function reclassify(f: BudgetFixture, target: ReclassificationTarget, currentDate: string, key: string) {
  const request = { workspaceId: f.workspace.id, categoryId: f.category.id, target, currentDate };
  const preview = await f.t.query(api.accounting.previewCategoryReclassification, request);
  return f.t.mutation(api.accounting.confirmCategoryReclassification, { ...request, revisionToken: preview.revisionToken, confirmed: true, idempotencyKey: key });
}

for (const household of [false, true]) for (const template of ["co-puc-personal@1", "us-gaap-personal@1"]) test(`${household ? "Household" : "Personal"}/${template}: Posted Expense, advisory overage and independent authorized posting`, async () => {
  const f = await budgetFixture(modules, household, template);
  const created = await createRule(f);
  const expense = await f.spend(130, "2026-09-30", "expense");
  await f.t.mutation(api.accounting.recordCashIncome, { ...groceries(f.workspace.id, f.profile.id, { amount: 40, accountingDate: "2026-09-30", idempotencyKey: "income" }), description: "Income" });
  const other = await createProfile(f.t, f.workspace.id, "Other", "cash");
  await f.t.mutation(api.accounting.recordAccountTransfer, { workspaceId: f.workspace.id, sourceFinancialAccountProfileId: f.profile.id,
    destinationFinancialAccountProfileId: other.id, amount: { currency: "COP", minorUnits: 25 }, accountingDate: "2026-09-30", description: "Transfer", idempotencyKey: "transfer" });
  const row = first(await evaluate(f, 9));
  expect(limited(row)).toEqual([130, 100, 0, 100, -30, 30, 0]);
  expect(row).toMatchObject({ target: { kind: "totalExpense" }, functionalCurrency: "COP", selectedRevision: 1, currentRevision: 1,
    policy: "budget-standing@1", evaluationContract: "independentRulesDoNotSum", ledgerBasis: "currentPostedLines",
    selectedLimit: { revision: 1, effective: { kind: "initial", month: { year: 2026, month: 9 } }, decidedBy: owner.userId, decidedAt: Date.UTC(2026, 9, 13, 12) } });
  expect(row.sources).toHaveLength(1);
  expect(row.sources[0]).toMatchObject({ kind: "postedExpense", journalEntryId: expense.id, lineNumber: 0, accountingDate: "2026-09-30",
    debitMinorUnits: 130, creditMinorUnits: 0, postingPolicy: "cash-expense@1", category: { categoryId: f.category.id, revision: 1 } });
  const proposal = { financialAccountProfileId: f.profile.id, amount: { currency: "COP", minorUnits: 20 }, accountingDate: "2026-09-30", userCategoryId: f.category.id, categoryRevision: 1 };
  const warning = await planningOnly(f.t, () => f.t.query(api.budget.budgetImpactWarning, { workspaceId: f.workspace.id, proposal }));
  expect(warning).toMatchObject({ kind: "advisory", hasPostingAuthority: false, blocksPosting: false,
    proposal: { kind: "proposedExpense", amount: { currency: "COP", minorUnits: 20 }, postingPolicy: "cash-expense@1", category: { categoryId: f.category.id } },
    impacts: [{ proposedDelta: { minorUnits: 20 }, projected: { actual: { minorUnits: 150 }, planning: { remaining: { minorUnits: -50 }, overage: { minorUnits: 50 } } } }] });
  expect("journalEntryId" in warning.proposal).toBe(false);
  const posted = await f.spend(20, "2026-09-30", "posted-after-warning");
  expect(posted.amount.minorUnits).toBe(20);
  expect(limited(first(await evaluate(f, 9)))).toEqual([150, 100, 0, 100, -50, 50, 0]);
  expect(created.budget.created.decidedBy).toBe(owner.userId);
  expect(workspaceRolePolicyVersion).toBe("workspace-roles@2");
  expect(["Owner", "Accountant", "Preparer", "Viewer"].map(role => role === "Owner" ? hasWorkspacePermission("Owner", "manageBudgets") :
    role === "Accountant" ? hasWorkspacePermission("Accountant", "manageBudgets") : role === "Preparer" ? hasWorkspacePermission("Preparer", "manageBudgets") : hasWorkspacePermission("Viewer", "manageBudgets"))).toEqual([true, false, false, false]);
});

test("single effective standing rule, retirement replacement, distinct named alternatives and exact retries", async () => {
  const f = await budgetFixture(modules);
  const created = await createRule(f);
  expect(await createRule(f, { idempotencyKey: "another" }).catch(e => e)).toMatchObject({ data: { code: "budget_cardinality_conflict" } });
  expect(await createRule(f, { cardinality: "multipleNamed", idempotencyKey: "multi" }).catch(e => e)).toMatchObject({ data: { code: "budget_cardinality_conflict" } });
  const rename = { budgetId: created.budget.id, revision: 1, change: { kind: "rename" as const, name: "Household monthly" }, idempotencyKey: "rename" };
  const renamed = await updateRule(f, rename);
  expect(renamed.budget).toMatchObject({ revision: 2, name: "Household monthly", nameDecision: { revision: 2, decidedBy: owner.userId } });
  expect(await updateRule(f, rename)).toEqual({ ...renamed, replay: true });
  expect(await createRule(f)).toEqual({ ...created, replay: true });
  expect(await createRule(f, { limit: { currency: "COP", minorUnits: 101 } }).catch(e => e)).toMatchObject({ data: { code: "idempotency_key_conflict" } });
  expect(await updateRule(f, { ...rename, change: { kind: "rename", name: "Different" } }).catch(e => e)).toMatchObject({ data: { code: "idempotency_key_conflict" } });
  expect(await updateRule(f, { ...rename, idempotencyKey: "stale" }).catch(e => e)).toMatchObject({ data: { code: "budget_revision_stale" } });
  const retirement = { budgetId: created.budget.id, revision: 2, effective: { kind: "prospective" as const, month: { year: 2026, month: 11 } }, idempotencyKey: "retire" };
  const retired = await retireRule(f, retirement);
  expect(await retireRule(f, retirement)).toEqual({ ...retired, replay: true });
  expect(await updateRule(f, { ...rename, revision: 3, idempotencyKey: "after-retire" }).catch(e => e)).toMatchObject({ data: { code: "budget_retired" } });
  expect(await createRule(f, { startMonth: { year: 2026, month: 10 }, idempotencyKey: "too-soon" }).catch(e => e)).toMatchObject({ data: { code: "budget_cardinality_conflict" } });
  const replacement = await createRule(f, { startMonth: { year: 2026, month: 11 }, cardinality: "multipleNamed", idempotencyKey: "replacement" });
  expect(replacement.budget.startMonth).toEqual({ year: 2026, month: 11 });
  expect(await createRule(f, { startMonth: { year: 2026, month: 11 }, cardinality: "multipleNamed", name: "MONTHLY SPENDING", idempotencyKey: "same-name" }).catch(e => e)).toMatchObject({ data: { code: "budget_name_conflict" } });
  const peer = await createRule(f, { startMonth: { year: 2026, month: 11 }, cardinality: "multipleNamed", name: "Another comparison", idempotencyKey: "peer" });
  expect(peer.budget.id).not.toBe(replacement.budget.id);
  expect((await f.t.query(api.budget.listBudgets, { workspaceId: f.workspace.id })).map(b => b.revision).sort()).toEqual([1, 1, 3]);
  expect(first(await evaluate(f, 10, 2026, { kind: "revision", budgetId: created.budget.id, revision: 1 }))).toMatchObject({ name: "Monthly spending", selectedRevision: 1, currentRevision: 3, planning: { kind: "limited" } });
  expect(first(await evaluate(f, 11, 2026, { kind: "revision", budgetId: created.budget.id, revision: 3 }))).toMatchObject({ planning: { kind: "retired" } });
  expect(first(await evaluate(f, 11, 2026, { kind: "revision", budgetId: created.budget.id, revision: 2 }))).toMatchObject({ name: "Household monthly", planning: { kind: "limited" } });
});

test("Category/actual Expense account targets count advanced overrides, stable archive history and explicit nonadditive overlap", async () => {
  const f = await budgetFixture(modules);
  const posted = await f.spend(80, "2026-09-30", "override", "512010");
  const actual = posted.lines.find(l => l.nature === "Expense"); if (!actual) throw new Error("Expense line expected");
  const defaults = await f.t.query(api.accounting.listLedgerAccounts, { workspaceId: f.workspace.id });
  const defaultAccount = defaults.find(a => a.nature === "Expense" && a.code !== "512010"); if (!defaultAccount) throw new Error("Default expense expected");
  const total = await createRule(f, { cardinality: "multipleNamed" });
  const category = await createRule(f, { cardinality: "multipleNamed", name: "Category", target: { kind: "category", categoryId: f.category.id }, idempotencyKey: "category-rule" });
  const override = await createRule(f, { cardinality: "multipleNamed", name: "Actual account", target: { kind: "expenseAccount", ledgerAccountId: actual.ledgerAccountId }, idempotencyKey: "account-rule" });
  const fallback = await createRule(f, { cardinality: "multipleNamed", name: "Default account", target: { kind: "expenseAccount", ledgerAccountId: defaultAccount.id }, idempotencyKey: "default-rule" });
  const results = await evaluate(f, 9);
  expect(results.evaluationContract).toBe("independentRulesDoNotSum");
  expect([total, category, override, fallback].map(b => results.rows.find(r => r.budgetId === b.budget.id)?.actual.minorUnits)).toEqual([80, 80, 80, 0]);
  expect(results.rows.find(r => r.budgetId === category.budget.id)?.sources[0]?.category?.account).toEqual({ kind: "advanced", accountCode: "512010" });
  await f.t.mutation(api.accounting.changeUserCategory, { workspaceId: f.workspace.id, categoryId: f.category.id, revision: 1, confirmed: true, change: { kind: "archive" }, idempotencyKey: "archive" });
  expect((await evaluate(f, 9)).rows.find(r => r.budgetId === category.budget.id)?.actual.minorUnits).toBe(80);
  expect(await createRule(f, { cardinality: "multipleNamed", name: "Archived", target: { kind: "category", categoryId: f.category.id }, idempotencyKey: "archived" }).catch(e => e)).toMatchObject({ data: { code: "budget_target_invalid" } });
  expect(await f.spend(1, "2026-10-01", "archived-spend").catch(e => e)).toMatchObject({ data: { code: "category_inactive" } });
});

for (const household of [false, true]) test(`${household ? "Household" : "Personal"}: real signed corrections, locked catch-up and reversal retain actual months`, async () => {
  const f = await budgetFixture(modules, household);
  const original = await f.spend(100, "2026-09-30", "original");
  await f.spend(200, "2026-10-01", "open");
  await f.spend(300, "2026-11-01", "later");
  const total = await createRule(f, { cardinality: "multipleNamed" });
  const category = await createRule(f, { name: "Category", cardinality: "multipleNamed", target: { kind: "category", categoryId: f.category.id }, idempotencyKey: "category-rule" });
  await lock(f.t, f.workspace.id, { year: 2026, month: 9 });
  const correction = await reclassify(f, { kind: "category", nature: "Income", accountCode: "42201001" }, "2026-11-20", "income-treatment");
  expect((await evaluate(f, 9)).rows.map(r => r.actual.minorUnits)).toEqual([100, 100]);
  expect((await evaluate(f, 10)).rows.map(r => r.actual.minorUnits)).toEqual([0, 0]);
  const november = await evaluate(f, 11);
  expect(november.rows.map(r => r.actual.minorUnits)).toEqual([-100, -100]);
  for (const row of november.rows) {
    expect(limited(row)).toEqual([-100, 100, 0, 100, 200, 0, 0]);
    expect(row.sources.flatMap(l => l.categoryCorrection?.priorLockedPeriods ?? [])).toContain("2026-09");
    expect(row.sources.flatMap(l => l.categoryCorrection?.rootSources ?? [])).toContainEqual({ entryId: original.id, lineNumber: 0, signedMinorUnits: 100 });
    expect(row.sources.filter(l => l.accountingDate === "2026-11-20").reduce((sum, l) => sum + l.creditMinorUnits, 0)).toBe(400);
  }
  const novemberEntry = (await f.t.query(api.accounting.listJournalEntries, { workspaceId: f.workspace.id })).find(e => correction.correctionEntryIds.includes(e.id) && e.accountingDate === "2026-11-20");
  if (!novemberEntry) throw new Error("Catch-up expected");
  await reverse(f.t, f.workspace.id, novemberEntry.id, { accountingDate: "2026-12-01", idempotencyKey: "reverse-correction" });
  expect((await evaluate(f, 12)).rows.map(r => r.actual.minorUnits)).toEqual([400, 400]);
  const rows = (await evaluate(f, 9)).rows;
  expect(rows.find(r => r.budgetId === total.budget.id)?.sources[0]?.journalEntryId).toBe(original.id);
  expect(rows.find(r => r.budgetId === category.budget.id)?.target).toMatchObject({ selectedSnapshot: { revision: 1, nature: "Expense" } });
});

test("Expense-to-Expense reclassification moves account targeting while original reversal offsets in its Posted month", async () => {
  const f = await budgetFixture(modules);
  const posted = await f.spend(100, "2026-09-30", "original");
  const old = posted.lines.find(l => l.nature === "Expense"); if (!old) throw new Error("Expense expected");
  const total = await createRule(f, { cardinality: "multipleNamed" });
  const prior = await createRule(f, { cardinality: "multipleNamed", name: "Prior account", target: { kind: "expenseAccount", ledgerAccountId: old.ledgerAccountId }, idempotencyKey: "prior" });
  await reclassify(f, { kind: "category", nature: "Expense", accountCode: "512010" }, "2026-09-30", "account-treatment");
  const account = (await f.t.query(api.accounting.listLedgerAccounts, { workspaceId: f.workspace.id })).find(a => a.code === "512010"); if (!account) throw new Error("Account expected");
  const current = await createRule(f, { cardinality: "multipleNamed", name: "New account", target: { kind: "expenseAccount", ledgerAccountId: account.id }, idempotencyKey: "new" });
  const before = await evaluate(f, 9);
  expect([total, prior, current].map(b => before.rows.find(r => r.budgetId === b.budget.id)?.actual.minorUnits)).toEqual([100, 0, 100]);
  const reversal = await reverse(f.t, f.workspace.id, posted.id, { accountingDate: "2026-10-01", idempotencyKey: "reverse-original" });
  const after = await evaluate(f, 10);
  expect([total, prior, current].map(b => after.rows.find(r => r.budgetId === b.budget.id)?.actual.minorUnits)).toEqual([-100, -100, 0]);
  expect(after.rows.find(r => r.budgetId === total.budget.id)?.sources[0]).toMatchObject({ journalEntryId: reversal.id, reversesEntryId: posted.id, accountingDate: "2026-10-01", creditMinorUnits: 100 });
  expect((await evaluate(f, 9)).rows.find(r => r.budgetId === total.budget.id)?.actual.minorUnits).toBe(100);
});

test("bounded carry uses literal month edges, negative corrections, missing limits and January reset", async () => {
  const f = await budgetFixture(modules);
  const created = await createRule(f, { startMonth: { year: 2026, month: 10 },
    rollover: { kind: "carryUnspent", reset: "calendarYear", cap: { currency: "COP", minorUnits: 500 } } });
  const source = await f.spend(30, "2026-10-31", "last-day");
  await reverse(f.t, f.workspace.id, source.id, { accountingDate: "2026-11-01", idempotencyKey: "first-day-reversal" });
  expect(first(await evaluate(f, 9))).toMatchObject({ actual: { minorUnits: 0 }, planning: { kind: "notStarted" } });
  expect(limited(first(await evaluate(f, 10)))).toEqual([30, 100, 0, 100, 70, 0, 70]);
  const november = first(await evaluate(f, 11));
  expect(limited(november)).toEqual([-30, 100, 70, 170, 200, 0, 170]);
  expect(november.carryEvidence.map(e => [e.month.month, e.actual.minorUnits])).toEqual([[10, 30]]);
  await f.spend(300, "2026-12-31", "overage");
  expect(limited(first(await evaluate(f, 12)))).toEqual([300, 100, 170, 270, -30, 30, 0]);
  expect(limited(first(await evaluate(f, 1, 2027)))).toEqual([0, 100, 0, 100, 100, 0, 100]);
  const march = first(await evaluate(f, 3, 2027));
  expect(limited(march)).toEqual([0, 100, 200, 300, 300, 0, 300]);
  expect(march.carryEvidence.map(e => [e.month.month, e.actual.minorUnits])).toEqual([[1, 0], [2, 0]]);
  expect(limited(first(await evaluate(f, 12, 2027)))).toEqual([0, 100, 500, 600, 600, 0, 500]);
  expect(first(await evaluate(f, 12, 2027)).carryEvidence).toHaveLength(11);
  await updateRule(f, { budgetId: created.budget.id, revision: 1, change: { kind: "limit", effective: { kind: "prospective", month: { year: 2026, month: 11 } }, limit: null }, idempotencyKey: "pause" });
  expect(first(await evaluate(f, 11))).toMatchObject({ actual: { minorUnits: -30 }, planning: { kind: "noLimit" }, selectedLimit: { limit: null, revision: 2 } });
  await updateRule(f, { budgetId: created.budget.id, revision: 2, change: { kind: "limit", effective: { kind: "prospective", month: { year: 2026, month: 12 } }, limit: { currency: "COP", minorUnits: 100 } }, idempotencyKey: "resume" });
  expect(limited(first(await evaluate(f, 12)))).toEqual([300, 100, 0, 100, -200, 200, 0]);
  expect(limited(first(await evaluate(f, 11, 2026, { kind: "revision", budgetId: created.budget.id, revision: 1 })))).toEqual([-30, 100, 70, 170, 200, 0, 170]);
});

test("effective-limit revisions preserve scheduled precedence and carry consequences, historical plans use current Posted evidence", async () => {
  const f = await budgetFixture(modules);
  const created = await createRule(f, { rollover: { kind: "carryUnspent", reset: "calendarYear", cap: { currency: "COP", minorUnits: 1000 } } });
  await f.spend(20, "2026-09-30", "september");
  await f.spend(30, "2026-10-01", "october");
  const future = { kind: "prospective" as const, month: { year: 2026, month: 11 } };
  await updateRule(f, { budgetId: created.budget.id, revision: 1, change: { kind: "limit", effective: future, limit: { currency: "COP", minorUnits: 50 } }, idempotencyKey: "future" });
  expect(limited(first(await evaluate(f, 9)))).toEqual([20, 100, 0, 100, 80, 0, 80]);
  expect(limited(first(await evaluate(f, 10)))).toEqual([30, 100, 80, 180, 150, 0, 150]);
  expect(limited(first(await evaluate(f, 11)))).toEqual([0, 50, 150, 200, 200, 0, 200]);
  const retro = { kind: "retrospective" as const, month: { year: 2026, month: 9 }, reason: "Recompare the original plan", confirmed: true as const };
  const updated = await updateRule(f, { budgetId: created.budget.id, revision: 2, change: { kind: "limit", effective: retro, limit: { currency: "COP", minorUnits: 200 } }, idempotencyKey: "retro" });
  expect(updated.budget.limits[2]).toMatchObject({ revision: 3, effective: retro, decidedBy: owner.userId, policy: "budget-standing@1" });
  expect(limited(first(await evaluate(f, 10)))).toEqual([30, 200, 180, 380, 350, 0, 350]);
  const november = first(await evaluate(f, 11));
  expect(limited(november)).toEqual([0, 50, 350, 400, 400, 0, 400]);
  expect(november.selectedLimit?.revision).toBe(2);
  await updateRule(f, { budgetId: created.budget.id, revision: 3, change: { kind: "limit", effective: future, limit: { currency: "COP", minorUnits: 60 } }, idempotencyKey: "same-month-newest" });
  expect(limited(first(await evaluate(f, 11)))).toEqual([0, 60, 350, 410, 410, 0, 410]);
  expect(first(await evaluate(f, 11)).selectedLimit?.revision).toBe(4);
  const originalPlan = first(await evaluate(f, 11, 2026, { kind: "revision", budgetId: created.budget.id, revision: 1 }));
  expect(limited(originalPlan)).toEqual([0, 100, 150, 250, 250, 0, 250]);
  await f.spend(5, "2026-11-01", "new-posted");
  expect(limited(first(await evaluate(f, 11, 2026, { kind: "revision", budgetId: created.budget.id, revision: 1 })))).toEqual([5, 100, 150, 250, 245, 0, 245]);
  const base = { budgetId: created.budget.id, revision: 4, idempotencyKey: "bad-month" };
  expect(await updateRule(f, { ...base, change: { kind: "limit", effective: { kind: "prospective", month: { year: 2026, month: 10 } }, limit: null } }).catch(e => e)).toMatchObject({ data: { code: "budget_effective_month_invalid" } });
  expect(await updateRule(f, { ...base, change: { kind: "limit", effective: { ...retro, month: { year: 2026, month: 11 } }, limit: null } }).catch(e => e)).toMatchObject({ data: { code: "budget_effective_month_invalid" } });
  expect(await updateRule(f, { ...base, change: { kind: "limit", effective: { ...retro, month: { year: 2026, month: 8 } }, limit: null } }).catch(e => e)).toMatchObject({ data: { code: "budget_effective_month_invalid" } });
  expect(await updateRule(f, { ...base, change: { kind: "limit", effective: { ...retro, reason: " " }, limit: null } }).catch(e => e)).toMatchObject({ data: { code: "budget_reason_required" } });
  const retirement = await retireRule(f, { budgetId: created.budget.id, revision: 4,
    effective: { kind: "retrospective", month: { year: 2026, month: 10 }, reason: "End the old plan", confirmed: true }, idempotencyKey: "retirement" });
  expect(first(await evaluate(f, 11))).toMatchObject({ actual: { minorUnits: 5 }, planning: { kind: "retired" }, selectedLimit: { revision: 4 } });
  expect(retirement.budget.limits).toHaveLength(4);
  expect(first(await evaluate(f, 11, 2026, { kind: "revision", budgetId: created.budget.id, revision: 4 }))).toMatchObject({ planning: { kind: "limited" }, currentRevision: 5, selectedRevision: 4 });
});

test("unactivated Expense proposal uses shared current Category/default/override resolution without a fake ID or write", async () => {
  const f = await budgetFixture(modules);
  await createRule(f, { target: { kind: "category", categoryId: f.category.id } });
  const proposal = { financialAccountProfileId: f.profile.id, amount: { currency: "COP", minorUnits: 12 }, accountingDate: "2026-10-01",
    userCategoryId: f.category.id, categoryRevision: 1, ledgerAccountCode: "512010" };
  const before = await ledgerBytes(f.t);
  const warning = await planningOnly(f.t, () => f.t.query(api.budget.budgetImpactWarning, { workspaceId: f.workspace.id, proposal }));
  expect(warning.proposal.account).toMatchObject({ code: "512010", nature: "Expense" });
  expect(warning.proposal.account.ledgerAccountId).toBeUndefined();
  expect(warning.proposal.category?.account).toEqual({ kind: "advanced", accountCode: "512010" });
  expect(warning.impacts[0]).toMatchObject({ proposedDelta: { minorUnits: 12 }, projected: { actual: { minorUnits: 12 } } });
  expect(await ledgerBytes(f.t)).toBe(before);
  const posted = await f.t.mutation(api.accounting.recordCashExpense, { workspaceId: f.workspace.id, ...proposal, description: "Same proposal", idempotencyKey: "post" });
  expect(posted.lines[0]).toMatchObject({ code: warning.proposal.account.code, nature: "Expense", debitMinorUnits: 12, category: warning.proposal.category });
  const direct = await f.t.mutation(api.accounting.recordCashExpense, { workspaceId: f.workspace.id, ...proposal, description: "Same proposal", idempotencyKey: "direct" });
  expect(direct.lines).toEqual(posted.lines);
  await f.t.mutation(api.accounting.changeUserCategory, { workspaceId: f.workspace.id, categoryId: f.category.id, revision: 1,
    change: { kind: "defaultAccount", accountCode: "519535" }, confirmed: true, idempotencyKey: "default-change" });
  expect(await planningOnly(f.t, () => f.t.query(api.budget.budgetImpactWarning, { workspaceId: f.workspace.id, proposal })).catch(e => e)).toMatchObject({ data: { code: "category_revision_stale" } });
  const latest = await f.t.query(api.budget.budgetImpactWarning, { workspaceId: f.workspace.id, proposal: { ...proposal, ledgerAccountCode: undefined, categoryRevision: 2 } });
  expect(latest.proposal.account.code).toBe("519535");
});

test("calendar boundaries, zero/missing limits and safe integer overflow have literal results", async () => {
  const f = await budgetFixture(modules);
  const created = await createRule(f, { startMonth: { year: 1, month: 1 }, limit: { currency: "COP", minorUnits: 0 } });
  expect(limited(first(await evaluate(f, 1, 1)))).toEqual([0, 0, 0, 0, 0, 0, 0]);
  expect(limited(first(await evaluate(f, 12, 9999)))).toEqual([0, 0, 0, 0, 0, 0, 0]);
  for (const month of [{ year: 0, month: 1 }, { year: 10000, month: 1 }, { year: 2026, month: 0 }, { year: 2026, month: 13 }, { year: 2026, month: 1.5 }])
    expect(await f.t.query(api.budget.evaluateBudgets, { workspaceId: f.workspace.id, month }).catch(e => e)).toMatchObject({ data: { code: "accounting_period_invalid" } });
  for (const amount of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity])
    expect(await createRule(f, { limit: { currency: "COP", minorUnits: amount }, idempotencyKey: `invalid-${amount}` }).catch(e => e)).toMatchObject({ data: { code: "budget_limit_invalid" } });
  expect(await createRule(f, { limit: { currency: "USD", minorUnits: 10 }, idempotencyKey: "foreign-limit" }).catch(e => e)).toMatchObject({ data: { code: "currency_mismatch" } });
  expect(await createRule(f, { rollover: { kind: "carryUnspent", reset: "calendarYear", cap: { currency: "USD", minorUnits: 10 } }, idempotencyKey: "foreign-cap" }).catch(e => e)).toMatchObject({ data: { code: "currency_mismatch" } });
  const large = await f.spend(Number.MAX_SAFE_INTEGER, "2026-09-28", "max");
  await f.spend(1, "2026-09-29", "one");
  expect(await evaluate(f, 9).catch(e => e)).toMatchObject({ data: { code: "budget_money_overflow" } });
  await reverse(f.t, f.workspace.id, large.id, { accountingDate: "2026-09-30", idempotencyKey: "cancel-max" });
  expect(limited(first(await evaluate(f, 9)))).toEqual([1, 0, 0, 0, -1, 1, 0]);
  const proposal = { financialAccountProfileId: f.profile.id, accountingDate: "2026-09-30", amount: { currency: "COP", minorUnits: Number.MAX_SAFE_INTEGER } };
  expect(await f.t.query(api.budget.budgetImpactWarning, { workspaceId: f.workspace.id, proposal }).catch(e => e)).toMatchObject({ data: { code: "budget_money_overflow" } });
  const authorized = await f.t.mutation(api.accounting.recordCashExpense, { workspaceId: f.workspace.id, ...proposal, description: "No warning authority", idempotencyKey: "authorized-despite-warning-failure" });
  expect(authorized.amount.minorUnits).toBe(Number.MAX_SAFE_INTEGER);
  expect(await evaluate(f, 9, 2026, { kind: "revision", budgetId: created.budget.id, revision: 99 }).catch(e => e)).toMatchObject({ data: { code: "budget_revision_invalid" } });
});

test("carry availability and signed remaining also reject overflow rather than rounding", async () => {
  const f = await budgetFixture(modules);
  await createRule(f, { startMonth: { year: 2026, month: 10 }, limit: { currency: "COP", minorUnits: Number.MAX_SAFE_INTEGER },
    rollover: { kind: "carryUnspent", reset: "calendarYear", cap: { currency: "COP", minorUnits: Number.MAX_SAFE_INTEGER } } });
  expect(limited(first(await evaluate(f, 10)))).toEqual([0, Number.MAX_SAFE_INTEGER, 0, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 0, Number.MAX_SAFE_INTEGER]);
  expect(await evaluate(f, 11).catch(e => e)).toMatchObject({ data: { code: "budget_money_overflow" } });
  const other = await budgetFixture(modules, true);
  await createRule(other, { limit: { currency: "COP", minorUnits: 1 } });
  const source = await other.spend(Number.MAX_SAFE_INTEGER, "2026-09-30", "max");
  await reverse(other.t, other.workspace.id, source.id, { accountingDate: "2026-10-01", idempotencyKey: "negative-max" });
  expect(await evaluate(other, 10).catch(e => e)).toMatchObject({ data: { code: "budget_money_overflow" } });
});

test("Category merge keeps original target identity and does not import the destination's Posted expenses", async () => {
  const f = await budgetFixture(modules);
  await f.spend(40, "2026-09-30", "source");
  const source = await createRule(f, { target: { kind: "category", categoryId: f.category.id } });
  const destination = await f.t.mutation(api.accounting.createUserCategory, { workspaceId: f.workspace.id, name: "Other groceries",
    selection: { kind: "preset", concept: "groceries" }, idempotencyKey: "destination" });
  if (destination.kind !== "category") throw new Error("Category expected");
  await f.t.mutation(api.accounting.changeUserCategory, { workspaceId: f.workspace.id, categoryId: f.category.id, revision: 1,
    confirmed: true, change: { kind: "merge", targetCategoryId: destination.category.id }, idempotencyKey: "merge" });
  await f.t.mutation(api.accounting.recordCashExpense, { ...groceries(f.workspace.id, f.profile.id,
    { amount: 60, accountingDate: "2026-09-30", idempotencyKey: "destination-spend" }), userCategoryId: destination.category.id });
  const row = first(await evaluate(f, 9));
  expect(row).toMatchObject({ budgetId: source.budget.id, target: { categoryId: f.category.id }, actual: { minorUnits: 40 } });
  expect(row.sources.map(s => [s.category?.categoryId, s.debitMinorUnits])).toEqual([[f.category.id, 40]]);
});

test("server UTC month controls prospective eligibility at a literal calendar boundary", async () => {
  const f = await budgetFixture(modules);
  const created = await createRule(f);
  const request = { budgetId: created.budget.id, revision: 1, change: { kind: "limit" as const,
    effective: { kind: "prospective" as const, month: { year: 2026, month: 11 } }, limit: { currency: "COP", minorUnits: 200 } }, idempotencyKey: "boundary" };
  vi.setSystemTime(Date.UTC(2026, 9, 31, 23, 59, 59));
  const changed = await updateRule(f, request);
  expect(changed.budget.limits[1]?.decidedAt).toBe(Date.UTC(2026, 9, 31, 23, 59, 59));
  vi.setSystemTime(Date.UTC(2026, 10, 1));
  expect(await updateRule(f, { ...request, revision: 2, idempotencyKey: "too-late" }).catch(e => e)).toMatchObject({ data: { code: "budget_effective_month_invalid" } });
  expect(await updateRule(f, request)).toEqual({ ...changed, replay: true });
  expect(limited(first(await evaluate(f, 10)))).toEqual([0, 100, 0, 100, 100, 0, 0]);
  expect(limited(first(await evaluate(f, 11)))).toEqual([0, 200, 0, 200, 200, 0, 0]);
});
