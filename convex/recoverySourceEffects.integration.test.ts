import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import {
  caught, convexAccounting, createOwnedWorkspace, createProfile, groceries,
  ownerIdentity, reverse, septNow,
} from "../src/accounting/convexHarness";
import type { AccountingTest } from "../src/accounting/convexHarness";
import type { PlanTerms } from "../src/savingsRecovery/types";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(septNow); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

async function fixture(kind: "Personal" | "Household") {
  const t = convexAccounting(modules);
  const workspace = kind === "Personal" ? await createOwnedWorkspace(t) : await t.mutation(api.accounting.createHouseholdWorkspace, {
    functionalCurrency: "COP", now: septNow, idempotencyKey: "household",
  });
  const bank = await createProfile(t, workspace.id, "Daily", "bankAccount");
  const savings = await createProfile(t, workspace.id, "Savings", "savingsAccount");
  const ctx = { workspaceId: workspace.id };
  await t.mutation(api.accounting.recordOpeningPosition, { ...ctx, financialAccountProfileId: bank.id,
    amount: { currency: "COP", minorUnits: 10000 }, accountingDate: "2026-09-01", description: "Start", idempotencyKey: "opening" });
  const created = await t.mutation(api.accounting.createUserCategory, { ...ctx, name: "Mercado", selection: { kind: "preset", concept: "groceries" }, idempotencyKey: "category" });
  if (created.kind !== "category") throw new Error("Expected public category creation");
  const category = created.category;
  const expenseArgs = (amount: number, date: string, key: string) => ({
    ...groceries(workspace.id, bank.id, { amount, accountingDate: date, idempotencyKey: key }),
    userCategoryId: category.id, categoryRevision: category.revision,
  });
  const spend = (amount: number, date: string, key: string) => t.mutation(api.accounting.recordCashExpense, expenseArgs(amount, date, key));
  const terms = (entryId: string, amount = 100): PlanTerms => ({ name: "Recover original spending", destinationProfileId: savings.id,
    sources: [{ entryId, principalMinor: amount }], installmentCount: 1, installmentAmountMinor: amount });
  async function activate(entryId: string, key: string, amount = 100) {
    const id = await t.mutation(api.savingsRecovery.saveDraft, { ...ctx, planId: null, expectedRevision: null, terms: terms(entryId, amount), idempotencyKey: `${key}-draft` });
    await t.mutation(api.savingsRecovery.activatePlan, { ...ctx, planId: id, expectedRevision: 1, idempotencyKey: `${key}-activate` });
    return id;
  }
  const progress = () => t.query(api.savingsRecovery.progress, ctx);
  const candidates = () => t.query(api.savingsRecovery.listCandidates, { ...ctx, from: "2026-09-01", through: "2026-10-31" });
  const cash = async () => (await t.query(api.accounting.balances, ctx)).find(row => row.financialAccountProfileId === bank.id)?.balance.minorUnits;
  async function reclassificationArgs(currentDate: string, key: string) {
    const request = { ...ctx, categoryId: category.id, target: { kind: "category" as const, nature: "Income" as const, accountCode: "42201001" }, currentDate };
    const preview = await t.query(api.accounting.previewCategoryReclassification, request);
    return { preview, args: { ...request, revisionToken: preview.revisionToken, confirmed: true as const, idempotencyKey: key } };
  }
  return { t, workspace, bank, savings, ctx, category, expenseArgs, spend, terms, activate, progress, candidates, cash, reclassificationArgs };
}

async function recoveryBytes(t: AccountingTest) {
  return t.run(async ctx => JSON.stringify({ plans: await ctx.db.query("recoveryPlans").collect(),
    events: await ctx.db.query("recoveryEvents").collect(), receipts: await ctx.db.query("recoveryReceipts").collect() }));
}
async function accountingRows(t: AccountingTest) {
  return t.run(async ctx => ({ entries: await ctx.db.query("journalEntries").collect(), lines: await ctx.db.query("journalLines").collect(),
    effects: await ctx.db.query("journalSourceEffects").collect() }));
}
async function accountingBytes(t: AccountingTest) { return JSON.stringify(await accountingRows(t)); }
async function sourceEffects(t: AccountingTest, sourceEntryId: string) {
  const rows = (await accountingRows(t)).effects.filter(row => row.sourceEntryId === sourceEntryId).sort((a, b) => a.sourceSequence - b.sourceSequence);
  return rows.map(row => ({ producer: row.journalEntryId, delta: row.expenseDeltaMinorUnits, sequence: row.sourceSequence }));
}
function assertBalanced(lines: { debitMinorUnits: number; creditMinorUnits: number }[], expected: number) {
  expect(lines.reduce((sum, line) => sum + line.debitMinorUnits, 0)).toBe(expected);
  expect(lines.reduce((sum, line) => sum + line.creditMinorUnits, 0)).toBe(expected);
}

for (const kind of ["Personal", "Household"] as const) {
  test(`${kind}: actual correction writer and equal-time mirror drive Recovery eligibility and causal suspension`, async () => {
    const f = await fixture(kind);
    const original = await f.spend(100, "2026-09-20", "source");
    const planId = await f.activate(original.id, "plan");
    const beforePlans = await recoveryBytes(f.t);
    const originals = await accountingRows(f.t);
    const frozen = (await f.progress()).plans[0].plan;
    expect(frozen.state).toMatchObject({ kind: "Activated", commitment: { sourceEffectCuts: { [original.id]: 0 } } });
    const { preview, args } = await f.reclassificationArgs("2026-09-24", "correct");
    expect(preview).toMatchObject({ entryCount: 1, amount: { currency: "COP", minorUnits: 100 } });
    const corrected = await f.t.mutation(api.accounting.confirmCategoryReclassification, args);
    expect(corrected.correctionEntryIds).toHaveLength(1);
    const correctionId = corrected.correctionEntryIds[0];
    const entries = await f.t.query(api.accounting.listJournalEntries, f.ctx);
    const correction = entries.find(entry => entry.id === correctionId);
    if (!correction) throw new Error("Missing actual correction");
    expect(correction.policy).toBe("category-reclassification@1");
    assertBalanced(correction.lines, 100);
    expect(correction.lines.map(line => [line.nature, line.debitMinorUnits, line.creditMinorUnits])).toEqual([["Expense", 0, 100], ["Revenue", 100, 0]]);
    expect(correction.lines.flatMap(line => line.categoryCorrection?.rootSources ?? []).map(root => root.entryId)).toEqual([original.id, original.id]);
    expect(await sourceEffects(f.t, original.id)).toEqual([{ producer: correctionId, delta: -100, sequence: 1 }]);
    expect(await f.cash()).toBe(9900);
    expect(await recoveryBytes(f.t)).toBe(beforePlans);
    const rowsAfter = await accountingRows(f.t);
    for (const entry of originals.entries) expect(rowsAfter.entries.find(row => row._id === entry._id)).toEqual(entry);
    for (const line of originals.lines) expect(rowsAfter.lines.find(row => row._id === line._id)).toEqual(line);
    const candidates = await f.candidates();
    expect(candidates.map(row => [row.expense.entryId, row.expense.amount.minorUnits, row.remainingEligibleMinor])).toEqual([[original.id, 100, 0]]);
    expect((await f.progress()).plans[0]).toMatchObject({ plan: frozen, status: { kind: "Suspended", unsupportedEntryIds: [original.id] } });
    expect(await recoveryBytes(f.t)).toBe(beforePlans);

    const mirror = await reverse(f.t, f.workspace.id, correctionId, { accountingDate: "2026-09-24", idempotencyKey: "mirror" });
    expect(mirror.postedAt).toBe(correction.postedAt);
    assertBalanced(mirror.lines, 100);
    expect(await recoveryBytes(f.t)).toBe(beforePlans);
    expect(await sourceEffects(f.t, original.id)).toEqual([{ producer: correctionId, delta: -100, sequence: 1 }, { producer: mirror.id, delta: 100, sequence: 2 }]);
    expect((await f.candidates())[0]).toMatchObject({ expense: { currentEligibleAmount: { minorUnits: 100 } }, remainingEligibleMinor: 100 });
    expect((await f.progress()).plans[0]).toMatchObject({ plan: frozen, status: { kind: "Suspended", unsupportedEntryIds: [original.id] } });
    expect((await reverse(f.t, f.workspace.id, correctionId, { accountingDate: "2026-09-24", idempotencyKey: "mirror" })).replay).toBe(true);
    expect(await f.t.mutation(api.accounting.confirmCategoryReclassification, args)).toEqual({ ...corrected, replay: true });
    expect((await f.spend(100, "2026-09-20", "source")).replay).toBe(true);
    expect((await sourceEffects(f.t, original.id)).map(row => [row.sequence, row.delta])).toEqual([[1, -100], [2, 100]]);
    expect(await f.cash()).toBe(9900);
    expect(await recoveryBytes(f.t)).toBe(beforePlans);

    const ledger = await accountingBytes(f.t);
    const reconcileArgs = { ...f.ctx, idempotencyKey: "reconcile" };
    await f.t.mutation(api.savingsRecovery.reconcilePlans, reconcileArgs);
    const reconciled = await recoveryBytes(f.t);
    expect(reconciled).not.toBe(beforePlans);
    expect((await f.progress()).history.filter(event => event.data.kind === "suspended")).toHaveLength(1);
    await f.t.mutation(api.savingsRecovery.reconcilePlans, reconcileArgs);
    expect(await recoveryBytes(f.t)).toBe(reconciled);
    expect(await accountingBytes(f.t)).toBe(ledger);
    const replacement = await f.t.mutation(api.savingsRecovery.replacePlan, { ...f.ctx, planId, terms: f.terms(original.id), reason: "Explicit supported replacement", idempotencyKey: "replace" });
    await f.t.mutation(api.savingsRecovery.activatePlan, { ...f.ctx, planId: replacement, expectedRevision: 1, idempotencyKey: "activate-replacement" });
    const plans = (await f.progress()).plans;
    expect(plans.map(row => row.status.kind)).toEqual(["Cancelled", "Active"]);
    expect(plans[0].plan).toEqual(frozen);
    expect(plans[1].plan.state).toMatchObject({ kind: "Activated", commitment: { sourceEffectCuts: { [original.id]: 2 } } });
    expect(await accountingBytes(f.t)).toBe(ledger);
  });

  test(`${kind}: actual cancelling-month root effects suspend B and never resurrect reversed original A`, async () => {
    const f = await fixture(kind);
    const a = await f.spend(100, "2026-09-24", "source-a");
    const planA = await f.activate(a.id, "plan-a");
    vi.setSystemTime(Date.UTC(2026, 9, 10, 15));
    const recoveryBeforeFinance = await recoveryBytes(f.t);
    const reversedA = await reverse(f.t, f.workspace.id, a.id, { accountingDate: "2026-10-01", idempotencyKey: "reverse-a" });
    expect(await recoveryBytes(f.t)).toBe(recoveryBeforeFinance);
    const b = await f.spend(100, "2026-10-10", "source-b");
    expect(await recoveryBytes(f.t)).toBe(recoveryBeforeFinance);
    vi.setSystemTime(Date.UTC(2026, 9, 24, 15));
    const planB = await f.activate(b.id, "plan-b");
    const frozenB = (await f.progress()).plans.find(row => row.plan.id === planB)?.plan;
    const beforeCorrection = await recoveryBytes(f.t);
    const originals = await accountingRows(f.t);
    const { preview, args } = await f.reclassificationArgs("2026-10-24", "cancelling-roots");
    expect(preview).toMatchObject({ amount: { minorUnits: 300 }, correctionDates: ["2026-09-24", "2026-10-10"] });
    const result = await f.t.mutation(api.accounting.confirmCategoryReclassification, args);
    const corrections = (await f.t.query(api.accounting.listJournalEntries, f.ctx)).filter(entry => result.correctionEntryIds.includes(entry.id)).sort((x, y) => x.accountingDate.localeCompare(y.accountingDate));
    expect(corrections.map(row => [row.accountingDate, row.amount.minorUnits])).toEqual([["2026-09-24", 100], ["2026-10-10", 200]]);
    assertBalanced(corrections[0].lines, 100); assertBalanced(corrections[1].lines, 200);
    const september = corrections[0].id; const october = corrections[1].id;
    expect(await sourceEffects(f.t, a.id)).toEqual([{ producer: september, delta: -100, sequence: 1 }, { producer: october, delta: 100, sequence: 2 }]);
    expect(await sourceEffects(f.t, b.id)).toEqual([{ producer: october, delta: -100, sequence: 1 }]);
    expect(await f.cash()).toBe(9900);
    expect(await recoveryBytes(f.t)).toBe(beforeCorrection);
    let candidates = await f.candidates();
    expect(candidates.map(row => [row.expense.entryId, row.expense.amount.minorUnits, row.expense.currentEligibleAmount.minorUnits])).toEqual([[a.id, 100, 0], [b.id, 100, 0]]);
    expect(candidates[0].expense.reversal).toMatchObject({ entryId: reversedA.id, accountingDate: "2026-10-01" });
    expect(candidates[0].expense.sourceEffects.reduce((sum, effect) => sum + effect.expenseDeltaMinorUnits, 0)).toBe(0);
    expect((await f.progress()).plans.map(row => [row.plan.id, row.status.kind])).toEqual([[planA, "Suspended"], [planB, "Suspended"]]);
    expect((await f.progress()).plans[1].plan).toEqual(frozenB);
    const mirror = await reverse(f.t, f.workspace.id, october, { accountingDate: "2026-10-24", idempotencyKey: "mirror-october" });
    expect(mirror.postedAt).toBe(corrections[1].postedAt);
    assertBalanced(mirror.lines, 200);
    expect(await sourceEffects(f.t, a.id)).toEqual([{ producer: september, delta: -100, sequence: 1 }, { producer: october, delta: 100, sequence: 2 }, { producer: mirror.id, delta: -100, sequence: 3 }]);
    expect(await sourceEffects(f.t, b.id)).toEqual([{ producer: october, delta: -100, sequence: 1 }, { producer: mirror.id, delta: 100, sequence: 2 }]);
    expect((await reverse(f.t, f.workspace.id, october, { accountingDate: "2026-10-24", idempotencyKey: "mirror-october" })).replay).toBe(true);
    expect((await reverse(f.t, f.workspace.id, a.id, { accountingDate: "2026-10-01", idempotencyKey: "reverse-a" })).replay).toBe(true);
    expect(await f.t.mutation(api.accounting.confirmCategoryReclassification, args)).toEqual({ ...result, replay: true });
    expect((await f.spend(100, "2026-10-10", "source-b")).replay).toBe(true);
    expect((await sourceEffects(f.t, a.id)).map(row => row.sequence)).toEqual([1, 2, 3]);
    expect((await sourceEffects(f.t, b.id)).map(row => row.sequence)).toEqual([1, 2]);
    expect(await recoveryBytes(f.t)).toBe(beforeCorrection);
    candidates = await f.candidates();
    expect(candidates.map(row => [row.expense.entryId, row.remainingEligibleMinor])).toEqual([[a.id, 0], [b.id, 100]]);
    expect(candidates[0].expense.reversal?.entryId).toBe(reversedA.id);
    expect((await f.progress()).plans[1]).toMatchObject({ plan: frozenB, status: { kind: "Suspended", unsupportedEntryIds: [b.id] } });
    expect(await f.cash()).toBe(9900);
    const afterFinance = await accountingRows(f.t);
    for (const entry of originals.entries) expect(afterFinance.entries.find(row => row._id === entry._id)).toEqual(entry);
    for (const line of originals.lines) expect(afterFinance.lines.find(row => row._id === line._id)).toEqual(line);
    const ledger = JSON.stringify(afterFinance);
    await f.t.mutation(api.savingsRecovery.reconcilePlans, { ...f.ctx, idempotencyKey: "reconcile-roots" });
    expect((await f.progress()).history.filter(event => event.data.kind === "suspended").map(event => event.data)).toEqual([
      { kind: "suspended", planId: planA, entryIds: [a.id] }, { kind: "suspended", planId: planB, entryIds: [b.id] },
    ]);
    const replacement = await f.t.mutation(api.savingsRecovery.replacePlan, { ...f.ctx, planId: planB, terms: f.terms(b.id), reason: "Explicit B restoration", idempotencyKey: "replace-b" });
    await f.t.mutation(api.savingsRecovery.activatePlan, { ...f.ctx, planId: replacement, expectedRevision: 1, idempotencyKey: "activate-new-b" });
    expect((await f.progress()).plans.map(row => row.status.kind)).toEqual(["Suspended", "Cancelled", "Active"]);
    expect((await f.progress()).plans[2].plan.state).toMatchObject({ kind: "Activated", commitment: { sourceEffectCuts: { [b.id]: 2 } } });
    expect(await accountingBytes(f.t)).toBe(ledger);
  });
}

test("combined authenticated boundaries reject missing proof, stale authority and foreign category/source without cross-domain writes", async () => {
  const f = await fixture("Personal");
  const original = await f.spend(100, "2026-09-20", "source");
  const draft = await f.t.mutation(api.savingsRecovery.saveDraft, { ...f.ctx, planId: null, expectedRevision: null, terms: f.terms(original.id), idempotencyKey: "draft" });
  const { args } = await f.reclassificationArgs("2026-09-24", "protected-correction");
  const activateArgs = { ...f.ctx, planId: draft, expectedRevision: 1, idempotencyKey: "activate" };
  const ledger = await accountingBytes(f.t); const initialRecovery = await recoveryBytes(f.t);
  expect(await caught(f.t.mutation(api.accounting.confirmCategoryReclassification, { ...args, access: undefined }))).toMatchObject({ data: { code: "device_proof_required" } });
  expect(await caught(f.t.mutation(api.savingsRecovery.activatePlan, { ...activateArgs, access: undefined }))).toMatchObject({ data: { code: "device_proof_required" } });
  const disallowed = f.t.withIdentity({ ...ownerIdentity, subject: "user_not_owner" });
  expect(await caught(disallowed.mutation(api.accounting.confirmCategoryReclassification, args))).toMatchObject({ data: { code: "owner_not_allowed" } });
  expect(await caught(disallowed.query(api.savingsRecovery.listCandidates, { ...f.ctx, from: "2026-09-01", through: "2026-09-30" }))).toMatchObject({ data: { code: "owner_not_allowed" } });
  expect(await recoveryBytes(f.t)).toBe(initialRecovery);
  const household = await f.t.mutation(api.accounting.createHouseholdWorkspace, { functionalCurrency: "COP", now: septNow, idempotencyKey: "foreign-household" });
  expect(await caught(f.t.query(api.accounting.previewCategoryReclassification, { workspaceId: household.id, categoryId: f.category.id, target: args.target, currentDate: args.currentDate }))).toMatchObject({ data: { code: "category_not_found" } });
  expect(await f.t.query(api.accounting.listPostedExpenses, { workspaceId: household.id, from: "2026-09-01", through: "2026-09-30" })).toEqual([]);
  const foreignSavings = await createProfile(f.t, household.id, "Household Savings", "savingsAccount");
  const foreignDraft = await f.t.mutation(api.savingsRecovery.saveDraft, { workspaceId: household.id, planId: null, expectedRevision: null, terms: { ...f.terms(original.id), destinationProfileId: foreignSavings.id }, idempotencyKey: "foreign-draft" });
  expect(await caught(f.t.mutation(api.savingsRecovery.activatePlan, { workspaceId: household.id, planId: foreignDraft, expectedRevision: 1, idempotencyKey: "foreign-activate" }))).toMatchObject({ data: { code: "recovery_source_ineligible" } });
  const beforePermissionDenials = await recoveryBytes(f.t);
  await f.t.run(async ctx => {
    const id = ctx.db.normalizeId("workspaces", f.workspace.id);
    const member = id && await ctx.db.query("workspaceMemberships").withIndex("by_workspace_user", q => q.eq("workspaceId", id).eq("userId", ownerIdentity.tokenIdentifier)).unique();
    if (!member) throw new Error("Missing current fixture membership");
    await ctx.db.patch(member._id, { role: "Preparer" });
  });
  expect(await caught(f.t.mutation(api.accounting.confirmCategoryReclassification, args))).toMatchObject({ data: { code: "workspace_permission_required" } });
  expect(await caught(f.t.mutation(api.savingsRecovery.activatePlan, activateArgs))).toMatchObject({ data: { code: "workspace_permission_required" } });
  expect(await accountingBytes(f.t)).toBe(ledger);
  const after = await f.t.query(api.savingsRecovery.progress, f.ctx);
  expect(after.plans[0].status.kind).toBe("Draft");
  expect(after.contributions).toEqual([]);
  expect(await recoveryBytes(f.t)).toBe(beforePermissionDenials);
});
