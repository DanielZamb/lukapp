import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { convexAccounting, createOwnedWorkspace, createProfile, caught, reverse, ownerIdentity, septNow, lock } from "../src/accounting/convexHarness";
import type { AccountingTest } from "../src/accounting/convexHarness";
import type { PlanTerms } from "../src/savingsRecovery/types";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(septNow); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
async function fixture(kind: "Personal" | "Household" = "Personal") {
  const t = convexAccounting(modules);
  const workspace = kind === "Personal" ? await createOwnedWorkspace(t) : await t.mutation(api.accounting.createHouseholdWorkspace,
    { functionalCurrency: "COP", idempotencyKey: "household", now: septNow });
  const source = await createProfile(t, workspace.id, "Daily", "bankAccount");
  const destination = await createProfile(t, workspace.id, "Savings", "savingsAccount");
  const ctx = { workspaceId: workspace.id };
  await t.mutation(api.accounting.recordOpeningPosition, { ...ctx, financialAccountProfileId: source.id,
    amount: { currency: "COP", minorUnits: 10000 }, accountingDate: "2026-09-01", description: "Opening", idempotencyKey: "opening" });
  const expense = async (amount: number, key: string, date = "2026-09-20") => t.mutation(api.accounting.recordCashExpense, {
    ...ctx, financialAccountProfileId: source.id, amount: { currency: "COP", minorUnits: amount }, accountingDate: date,
    description: key, idempotencyKey: key,
  });
  const one = await expense(101, "expense-one");
  const two = await expense(202, "expense-two");
  const terms: PlanTerms = { name: "Restore expenses", destinationProfileId: destination.id,
    sources: [{ entryId: one.id, principalMinor: 101 }, { entryId: two.id, principalMinor: 202 }], installmentCount: 3, installmentAmountMinor: 110 };
  const draft = async (custom = terms, key = "draft") => t.mutation(api.savingsRecovery.saveDraft, {
    ...ctx, planId: null, expectedRevision: null, terms: custom, idempotencyKey: key,
  });
  const activate = (planId: string, key = `activate-${planId}`, expectedRevision = 1) => t.mutation(api.savingsRecovery.activatePlan, {
    ...ctx, planId, expectedRevision, idempotencyKey: key,
  });
  const transfer = async (amount: number, key = "transfer", date = "2026-09-24", sourceId = source.id, destinationId = destination.id) => t.mutation(api.accounting.recordAccountTransfer, {
    ...ctx, sourceFinancialAccountProfileId: sourceId, destinationFinancialAccountProfileId: destinationId,
    amount: { currency: "COP", minorUnits: amount }, accountingDate: date, description: key, idempotencyKey: key,
  });
  const record = (transferEntryId: string, planId: string, amountMinor: number, key = "contribute") => t.mutation(api.savingsRecovery.recordContribution, {
    ...ctx, transferEntryId, allocations: [{ planId, amountMinor }], idempotencyKey: key,
  });
  const progress = (asKnownAt?: number) => t.query(api.savingsRecovery.progress, { ...ctx, ...(asKnownAt === undefined ? {} : { asKnownAt }) });
  return { t, workspace, ctx, source, destination, one, two, terms, draft, activate, transfer, record, progress, expense };
}
async function ledgerBytes(t: AccountingTest) {
  return t.run(async ctx => JSON.stringify({ entries: await ctx.db.query("journalEntries").collect(), lines: await ctx.db.query("journalLines").collect() }));
}
const protections = { essentialSpendingMinor: 100, taxesMinor: 200, requiredReservesMinor: 300, externalObligationsMinor: 400, provenance: "Owner reviewed supplied obligations" };
const entered = { kind: "entered" as const, availableMinor: 500, protections, attestation: "Net cash after supplied protections" };

test("computed cash rejects missing and duplicate profiles and disabled prepayment leaves literal ordinary saving", async () => {
  const f = await fixture();
  const args = { ...f.ctx, month: "2026-09", includePrepayment: false,
    cash: { kind: "computed" as const, liquidProfileIds: [f.source.id], protections } };
  for (const ids of [[], [f.source.id, f.source.id]]) expect(await caught(f.t.query(api.savingsRecovery.monthlyWaterfall,
    { ...args, cash: { ...args.cash, liquidProfileIds: ids } }))).toMatchObject({ data: { code: "recovery_cash_profiles_invalid" } });
  expect(await caught(f.t.query(api.savingsRecovery.monthlyWaterfall, { ...args, cash: { ...args.cash, liquidProfileIds: ["missing"] } })))
    .toMatchObject({ data: { code: "recovery_cash_profile_ineligible" } });
  const before = await ledgerBytes(f.t);
  const result = await f.t.query(api.savingsRecovery.monthlyWaterfall, args);
  expect(result.availableCash).toMatchObject({ availableMinor: 8697, ledgerCashMinor: 9697, protectedMinor: 1000 });
  expect(result.prepayment).toEqual([]);
  expect(result.ordinarySavingMinor).toBe(8394);
  expect(result.expenseRecovery.map(row => row.allocatedMinor)).toEqual([101, 202]);
  expect(await ledgerBytes(f.t)).toBe(before);
});

test.each(["Personal", "Household"] as const)("%s public handlers freeze schedule and leave ledger byte-identical", async kind => {
  const f = await fixture(kind);
  const before = await ledgerBytes(f.t);
  const id = await f.draft();
  expect(await f.draft()).toBe(id);
  expect((await f.progress()).plans[0].status.kind).toBe("Draft");
  await f.activate(id);
  const row = (await f.progress()).plans[0];
  expect(row.status.kind).toBe("Active");
  expect(row.plan.state.kind).toBe("Activated");
  if (row.plan.state.kind !== "Activated") throw new Error("Expected frozen schedule");
  expect(row.plan.state.commitment.schedule).toEqual([
    { month: "2026-09", amountMinor: 110, principalMinor: 97, premiumMinor: 13 },
    { month: "2026-10", amountMinor: 110, principalMinor: 101, premiumMinor: 9 },
    { month: "2026-11", amountMinor: 110, principalMinor: 105, premiumMinor: 5 },
  ]);
  expect(row.plan.state.commitment.principalMinor).toBe(303);
  expect(row.plan.state.commitment.impliedMonthlyRate).toBeGreaterThan(0);
  expect(await caught(f.t.mutation(api.savingsRecovery.saveDraft, { ...f.ctx, planId: id, expectedRevision: 2,
    terms: { ...f.terms, installmentAmountMinor: 120 }, idempotencyKey: "edit-active" }))).toMatchObject({ data: { code: "recovery_schedule_frozen" } });
  expect(await ledgerBytes(f.t)).toBe(before);
});

test("Draft revisions, candidate decisions, source reservations, invalid schedule and destination checks are atomic", async () => {
  const f = await fixture();
  const id = await f.draft();
  await f.t.mutation(api.savingsRecovery.saveDraft, { ...f.ctx, planId: id, expectedRevision: 1, terms: f.terms, idempotencyKey: "edit" });
  expect(await caught(f.activate(id))).toMatchObject({ data: { code: "recovery_draft_revision_conflict" } });
  await f.t.mutation(api.savingsRecovery.decideCandidate, { ...f.ctx, entryId: f.one.id, decision: "excluded", idempotencyKey: "exclude" });
  expect(await caught(f.activate(id, "activate-excluded", 2))).toMatchObject({ data: { code: "recovery_source_ineligible" } });
  await f.t.mutation(api.savingsRecovery.decideCandidate, { ...f.ctx, entryId: f.one.id, decision: "eligible", idempotencyKey: "include" });
  await f.activate(id, "activate-good", 2);
  const second = await f.draft(f.terms, "second-draft");
  expect(await caught(f.activate(second))).toMatchObject({ data: { code: "recovery_source_reserved" } });
  expect(await caught(f.draft({ ...f.terms, installmentAmountMinor: 100 }, "bad-schedule"))).toMatchObject({ data: { code: "recovery_installment_below_principal" } });
  const credit = await createProfile(f.t, f.workspace.id, "Card", "creditCard");
  const liabilityDraft = await f.draft({ ...f.terms, destinationProfileId: credit.id }, "liability-draft");
  expect(await caught(f.activate(liabilityDraft))).toMatchObject({ data: { code: "recovery_destination_ineligible" } });
});

test("proportional source and installment allocations preserve exact principal, premium, prepayment and surplus", async () => {
  const f = await fixture();
  const id = await f.draft(); await f.activate(id);
  const posted = await f.transfer(400);
  const ledger = await ledgerBytes(f.t);
  const contributionId = await f.record(posted.id, id, 150);
  expect(await f.record(posted.id, id, 150)).toBe(contributionId);
  const progress = await f.progress();
  const data = progress.contributions[0].data;
  expect(data.kind).toBe("contribution");
  if (data.kind !== "contribution") throw new Error("Expected contribution");
  expect(data.contributionDate).toBe("2026-09-24");
  expect(data.allocations[0]).toEqual({ planId: id, amountMinor: 150, principalMinor: 134, premiumMinor: 16,
    installments: [{ installmentIndex: 0, principalMinor: 97, premiumMinor: 13, prepayment: false },
      { installmentIndex: 1, principalMinor: 37, premiumMinor: 3, prepayment: true }],
    sources: [{ entryId: f.one.id, principalMinor: 45 }, { entryId: f.two.id, principalMinor: 89 }],
  });
  expect(await caught(f.record(posted.id, id, 151))).toMatchObject({ data: { code: "idempotency_key_conflict" } });
  await f.record(posted.id, id, 180, "finish");
  expect((await f.progress()).plans[0].verified).toEqual({ amountMinor: 330, principalMinor: 303, premiumMinor: 27 });
  expect((await f.progress()).plans[0].status.kind).toBe("Completed");
  expect(await caught(f.record(posted.id, id, 1, "over-goal"))).toMatchObject({ data: { code: "recovery_plan_inactive" } });
  expect(await ledgerBytes(f.t)).toBe(ledger);
});

test("immutable attribution reversal restores transfer capacity while cancelled plan retains saving", async () => {
  const f = await fixture(); const id = await f.draft(); await f.activate(id);
  const posted = await f.transfer(100);
  const original = await f.record(posted.id, id, 100);
  const before = await ledgerBytes(f.t);
  const reversalArgs = { ...f.ctx, contributionId: original, reason: "Wrong allocation", idempotencyKey: "attribution-reversal" };
  const reversalId = await f.t.mutation(api.savingsRecovery.reverseContribution, reversalArgs);
  expect(await f.t.mutation(api.savingsRecovery.reverseContribution, reversalArgs)).toBe(reversalId);
  expect((await f.progress()).plans[0].verified.amountMinor).toBe(0);
  await lock(f.t, f.workspace.id, { year: 2026, month: 9 });
  const replacement = await f.record(posted.id, id, 100, "replacement-allocation");
  expect(replacement).not.toBe(original);
  expect((await f.progress()).contributions.map(row => row.corrected)).toEqual([true, false]);
  await f.t.mutation(api.savingsRecovery.cancelPlan, { ...f.ctx, planId: id, reason: "Stop", idempotencyKey: "cancel" });
  expect((await f.progress()).plans[0]).toMatchObject({ status: { kind: "Cancelled" }, verified: { amountMinor: 100 } });
  expect(await f.record(posted.id, id, 100, "replacement-allocation")).toBe(replacement);
  expect(await ledgerBytes(f.t)).toBe(before);
});

test("source reversal suspends without rewriting schedules and explicit replacement only reserves supported remainder", async () => {
  const f = await fixture(); const id = await f.draft(); await f.activate(id);
  const posted = await f.transfer(110); await f.record(posted.id, id, 110);
  const frozen = (await f.progress()).plans[0].plan;
  await reverse(f.t, f.workspace.id, f.one.id, { accountingDate: "2026-09-24" });
  const ledger = await ledgerBytes(f.t);
  expect((await f.progress()).plans[0]).toMatchObject({ plan: frozen, status: { kind: "Suspended", unsupportedEntryIds: [f.one.id] }, verified: { amountMinor: 110 } });
  const nextTransfer = await f.transfer(110, "another-transfer");
  expect(await caught(f.record(nextTransfer.id, id, 10, "blocked-contribution"))).toMatchObject({ data: { code: "recovery_plan_inactive" } });
  await f.t.mutation(api.savingsRecovery.reconcilePlans, { ...f.ctx, idempotencyKey: "detect" });
  const replacementTerms = { ...f.terms, sources: [{ entryId: f.two.id, principalMinor: 137 }], installmentCount: 1, installmentAmountMinor: 137 };
  const replacement = await f.t.mutation(api.savingsRecovery.replacePlan, { ...f.ctx, planId: id, terms: replacementTerms, reason: "Supported principal only", idempotencyKey: "replace" });
  await f.activate(replacement);
  expect((await f.progress()).plans.map(row => [row.status.kind, row.plan.replacesPlanId])).toEqual([["Cancelled", null], ["Active", id]]);
  const afterTransfer = await ledgerBytes(f.t);
  expect(afterTransfer).not.toBe(ledger);
  expect(JSON.parse(afterTransfer).entries.length).toBe(JSON.parse(ledger).entries.length + 1);
});

test("reversed transfer voids progress on each read, independent withdrawal retains progress, and Finance writes no Recovery rows", async () => {
  const f = await fixture(); const id = await f.draft(); await f.activate(id);
  const posted = await f.transfer(110); await f.record(posted.id, id, 110);
  const frozen = (await f.progress()).plans[0].plan;
  await f.transfer(50, "withdraw", "2026-09-24", f.destination.id, f.source.id);
  expect((await f.progress()).plans[0]).toMatchObject({ verified: { amountMinor: 110 }, destinationBalance: { currency: "COP", minorUnits: 60 } });
  const recoveryBefore = await f.t.run(async ctx => JSON.stringify([await ctx.db.query("recoveryPlans").collect(), await ctx.db.query("recoveryEvents").collect()]));
  await reverse(f.t, f.workspace.id, posted.id, { accountingDate: "2026-09-24" });
  expect(await f.t.run(async ctx => JSON.stringify([await ctx.db.query("recoveryPlans").collect(), await ctx.db.query("recoveryEvents").collect()]))).toBe(recoveryBefore);
  expect((await f.progress()).plans[0]).toMatchObject({ plan: frozen, verified: { amountMinor: 0 } });
  expect((await f.progress()).contributions[0].voided).toBe(true);
  expect(await caught(f.record(posted.id, id, 1, "reversed-support"))).toMatchObject({ data: { code: "recovery_transfer_reversed" } });
});

test("ordinary expense, liability, wrong destination, cross-Workspace and pre-activation support fail while posted transfer stands", async () => {
  const f = await fixture(); const id = await f.draft(); await f.activate(id);
  expect(await caught(f.record(f.one.id, id, 10))).toMatchObject({ data: { code: "recovery_transfer_ineligible" } });
  const card = await createProfile(f.t, f.workspace.id, "Card", "creditCard");
  const liability = await f.transfer(20, "liability", "2026-09-24", card.id);
  expect(await caught(f.record(liability.id, id, 20, "liability-contribution"))).toMatchObject({ data: { code: "recovery_transfer_ineligible" } });
  const otherSavings = await createProfile(f.t, f.workspace.id, "Other", "savingsAccount");
  const ordinary = await f.transfer(20, "wrong-destination", "2026-09-24", f.source.id, otherSavings.id);
  const before = await ledgerBytes(f.t);
  expect(await caught(f.record(ordinary.id, id, 20, "wrong"))).toMatchObject({ data: { code: "recovery_destination_mismatch" } });
  expect(await ledgerBytes(f.t)).toBe(before);
  const old = await f.transfer(20, "old", "2026-09-23");
  expect(await caught(f.record(old.id, id, 20, "old-contribution"))).toMatchObject({ data: { code: "recovery_transfer_before_activation" } });
  const foreign = await f.t.mutation(api.accounting.createHouseholdWorkspace, { functionalCurrency: "COP", now: septNow, idempotencyKey: "foreign" });
  expect(await caught(f.t.mutation(api.savingsRecovery.recordContribution, { workspaceId: foreign.id, transferEntryId: ordinary.id,
    allocations: [{ planId: id, amountMinor: 10 }], idempotencyKey: "foreign-contribution" }))).toMatchObject({ data: { code: "recovery_transfer_ineligible" } });
});

test("late recording preserves transfer date and as-known-at attribution history", async () => {
  const f = await fixture(); const id = await f.draft(); await f.activate(id);
  const posted = await f.transfer(110);
  vi.setSystemTime(Date.UTC(2026, 8, 27, 12));
  await f.record(posted.id, id, 110);
  const history = await f.progress();
  expect(history.contributions[0].recordedAt).toBe(Date.UTC(2026, 8, 27, 12));
  expect(history.contributions[0].data).toMatchObject({ contributionDate: "2026-09-24" });
  expect((await f.progress(Date.UTC(2026, 8, 25))).plans[0].verified.amountMinor).toBe(0);
  vi.setSystemTime(Date.UTC(2026, 8, 28, 12));
  await reverse(f.t, f.workspace.id, posted.id, { accountingDate: "2026-09-28" });
  expect((await f.progress(Date.UTC(2026, 8, 27, 15))).plans[0].verified.amountMinor).toBe(110);
  expect((await f.progress()).plans[0].verified.amountMinor).toBe(0);
});

test("import proposal requires accepted intent, rejection yields no progress, and stale acceptance revalidates", async () => {
  const f = await fixture(); const id = await f.draft(); await f.activate(id);
  const posted = await f.transfer(110);
  const proposalArgs = { ...f.ctx, transferEntryId: posted.id, allocations: [{ planId: id, amountMinor: 110 }], importReference: "synthetic-import-row-7", idempotencyKey: "proposal" };
  const proposalId = await f.t.mutation(api.savingsRecovery.proposeAllocation, proposalArgs);
  expect((await f.progress()).plans[0].verified.amountMinor).toBe(0);
  const before = await ledgerBytes(f.t);
  await f.t.mutation(api.savingsRecovery.decideProposal, { ...f.ctx, proposalId, decision: "rejected", idempotencyKey: "reject" });
  expect((await f.progress()).plans[0].verified.amountMinor).toBe(0);
  const next = await f.t.mutation(api.savingsRecovery.proposeAllocation, { ...proposalArgs, idempotencyKey: "proposal-two" });
  await f.t.mutation(api.savingsRecovery.decideProposal, { ...f.ctx, proposalId: next, decision: "accepted", idempotencyKey: "accept" });
  expect((await f.progress()).contributions[0].data).toMatchObject({ intent: "acceptedProposal", proposalId: next });
  const stale = await f.t.mutation(api.savingsRecovery.proposeAllocation, { ...proposalArgs, idempotencyKey: "stale" });
  expect(await caught(f.t.mutation(api.savingsRecovery.decideProposal, { ...f.ctx, proposalId: stale, decision: "accepted", idempotencyKey: "accept-stale" }))).toMatchObject({ data: { code: "recovery_transfer_capacity_exceeded" } });
  expect(await ledgerBytes(f.t)).toBe(before);
});

test("declared opening baseline is separate, unique, auditable, and creates no transfer", async () => {
  const f = await fixture(); const id = await f.draft(); await f.activate(id);
  const ledger = await ledgerBytes(f.t);
  await f.t.mutation(api.savingsRecovery.declareOpeningProgress, { ...f.ctx, planId: id, amountMinor: 110, throughDate: "2026-09-23",
    evidenceUnavailable: true, provenance: "Declared historical sheet baseline without available transfer evidence", idempotencyKey: "baseline" });
  expect((await f.progress()).plans[0]).toMatchObject({ verified: { amountMinor: 0, principalMinor: 0, premiumMinor: 0 }, declaredBaseline: { amountMinor: 110, principalMinor: 97, premiumMinor: 13 } });
  expect((await f.progress()).contributions).toEqual([]);
  expect(await ledgerBytes(f.t)).toBe(ledger);
  expect(await caught(f.t.mutation(api.savingsRecovery.declareOpeningProgress, { ...f.ctx, planId: id, amountMinor: 1,
    throughDate: "2026-09-23", evidenceUnavailable: true, provenance: "another", idempotencyKey: "second-baseline" }))).toMatchObject({ data: { code: "recovery_opening_already_established" } });
});

test("waterfall carries oldest shortfalls without penalty before current, candidates, prepayment, saving and supports both cash modes", async () => {
  const f = await fixture(); const id = await f.draft(); await f.activate(id);
  const extra = await f.expense(70, "unplanned");
  vi.setSystemTime(Date.UTC(2026, 9, 20));
  const args = { ...f.ctx, month: "2026-10", cash: entered, includePrepayment: true };
  const ledger = await ledgerBytes(f.t);
  const result = await f.t.query(api.savingsRecovery.monthlyWaterfall, args);
  expect(result.combinedRecoveryPaymentMinor).toBe(220);
  expect(result.shortfalls.map(row => [row.month, row.outstandingMinor, row.allocatedMinor])).toEqual([["2026-09", 110, 110]]);
  expect(result.currentInstallments.map(row => [row.month, row.allocatedMinor])).toEqual([["2026-10", 110]]);
  expect(result.expenseRecovery).toEqual([{ entryId: extra.id, outstandingMinor: 70, allocatedMinor: 70 }]);
  expect(result.prepayment.map(row => [row.month, row.allocatedMinor])).toEqual([["2026-11", 110]]);
  expect(result.ordinarySavingMinor).toBe(100);
  expect(result.availableCash).toMatchObject({ mode: "entered", availableMinor: 500, ledgerCashMinor: null, protectedMinor: 1000, unmodeledObligationsProtected: false });
  const computed = await f.t.query(api.savingsRecovery.monthlyWaterfall, { ...args, cash: { kind: "computed", liquidProfileIds: [f.source.id], protections } });
  expect(computed.availableCash).toMatchObject({ ledgerCashMinor: 9627, availableMinor: 8627, coverage: "user-declared-protections-only" });
  const scarce = await f.t.query(api.savingsRecovery.monthlyWaterfall, { ...args, cash: { ...entered, availableMinor: 150 } });
  expect(scarce.currentInstallments[0].allocatedMinor).toBe(40);
  expect(scarce.expenseRecovery[0].allocatedMinor).toBe(0);
  expect(await ledgerBytes(f.t)).toBe(ledger);
});

test("shared expense read is date-scoped with live reversal provenance and Recovery decisions do not edit accounting", async () => {
  const f = await fixture();
  const original = await f.t.query(api.accounting.listPostedExpenses, { ...f.ctx, from: "2026-09-20", through: "2026-09-20" });
  expect(original.map(row => [row.description, row.amount.minorUnits, row.reversal])).toEqual([["expense-one", 101, null], ["expense-two", 202, null]]);
  const reversal = await reverse(f.t, f.workspace.id, f.one.id, { accountingDate: "2026-09-24" });
  const read = await f.t.query(api.accounting.listPostedExpenses, { ...f.ctx, from: "2026-09-01", through: "2026-09-30" });
  expect(read[0].reversal).toEqual({ entryId: reversal.id, accountingDate: "2026-09-24", recordedAt: septNow });
  const candidates = await f.t.query(api.savingsRecovery.listCandidates, { ...f.ctx, from: "2026-09-01", through: "2026-09-30" });
  expect(candidates.map(row => row.remainingEligibleMinor)).toEqual([0, 202]);
  expect(await f.t.query(api.accounting.listPostedExpenses, { ...f.ctx, from: "2026-09-21", through: "2026-09-23" })).toEqual([]);
});

test("current Recovery permission differs from Posting Authority and every public export requires exact registered device proof", async () => {
  const f = await fixture(); const id = await f.draft();
  expect(await caught(f.t.mutation(api.savingsRecovery.activatePlan, { ...f.ctx, planId: id, expectedRevision: 1, idempotencyKey: "no-proof", access: undefined }))).toMatchObject({ data: { code: "device_proof_required" } });
  expect(await caught(f.t.withIdentity({ ...ownerIdentity, subject: "user_other" }).query(api.savingsRecovery.progress, f.ctx))).toMatchObject({ data: { code: "owner_not_allowed" } });
  await f.t.run(async ctx => {
    const membership = await ctx.db.query("workspaceMemberships").first();
    if (!membership) throw new Error("Missing membership");
    await ctx.db.patch(membership._id, { role: "Accountant" });
  });
  expect(await caught(f.activate(id))).toMatchObject({ data: { code: "workspace_permission_required" } });
  expect((await f.t.query(api.savingsRecovery.progress, f.ctx)).plans[0].status.kind).toBe("Draft");
  await f.t.mutation(api.accounting.recordCashExpense, { ...f.ctx, financialAccountProfileId: f.source.id,
    amount: { currency: "COP", minorUnits: 1 }, accountingDate: "2026-09-24", description: "Posting still allowed", idempotencyKey: "accountant-post" });
  await f.t.run(async ctx => {
    const membership = await ctx.db.query("workspaceMemberships").first();
    if (!membership) throw new Error("Missing membership");
    await ctx.db.delete(membership._id);
  });
  expect(await caught(f.progress())).toMatchObject({ data: { code: "workspace_membership_required" } });
});

test("local concurrent source activation and cross-plan contribution requests cannot consume capacity twice", async () => {
  const f = await fixture();
  const first = await f.draft(); const second = await f.draft(f.terms, "other-draft");
  const activation = await Promise.allSettled([f.activate(first), f.activate(second)]);
  expect(activation.map(result => result.status).sort()).toEqual(["fulfilled", "rejected"]);
  const active = (await f.progress()).plans.find(row => row.status.kind === "Active");
  if (!active) throw new Error("Expected active plan");
  const thirdExpense = await f.expense(100, "third");
  const third = await f.draft({ ...f.terms, sources: [{ entryId: thirdExpense.id, principalMinor: 100 }], installmentCount: 1, installmentAmountMinor: 100 }, "third-draft");
  await f.activate(third);
  const posted = await f.transfer(100);
  const contributions = await Promise.allSettled([f.record(posted.id, active.plan.id, 100, "race-a"), f.record(posted.id, third, 100, "race-b")]);
  expect(contributions.map(result => result.status).sort()).toEqual(["fulfilled", "rejected"]);
  expect((await f.progress()).plans.reduce((sum, row) => sum + row.verified.amountMinor, 0)).toBe(100);
});

test("indexed linked source effects reduce original eligibility, mirror reversal once, and never create selectable expenses", async () => {
  const f = await fixture(); const id = await f.draft(); await f.activate(id);
  const frozen = (await f.progress()).plans[0].plan;
  const reduction = await f.t.mutation(api.accounting.recordCashIncome, { ...f.ctx, financialAccountProfileId: f.source.id,
    amount: { currency: "COP", minorUnits: 40 }, accountingDate: "2026-09-24", description: "Synthetic producing ledger fact for source-effect contract", idempotencyKey: "source-reduction-fixture" });
  await f.t.run(async ctx => {
    const workspaceId = ctx.db.normalizeId("workspaces", f.workspace.id);
    const sourceEntryId = ctx.db.normalizeId("journalEntries", f.one.id);
    const journalEntryId = ctx.db.normalizeId("journalEntries", reduction.id);
    if (!workspaceId || !sourceEntryId || !journalEntryId) throw new Error("Invalid fixture ids");
    await ctx.db.insert("journalSourceEffects", { workspaceId, sourceEntryId, journalEntryId, expenseDeltaMinorUnits: -40, sourceSequence: 1 });
  });
  const ledger = await ledgerBytes(f.t);
  const read = await f.t.query(api.accounting.listPostedExpenses, { ...f.ctx, from: "2026-09-01", through: "2026-09-30" });
  expect(read.map(row => [row.amount.minorUnits, row.currentEligibleAmount.minorUnits])).toEqual([[101, 61], [202, 202]]);
  expect(read[0].sourceEffects).toEqual([{ workspaceId: f.workspace.id, sourceEntryId: f.one.id, journalEntryId: reduction.id,
    expenseDeltaMinorUnits: -40, sourceSequence: 1, accountingDate: "2026-09-24", recordedAt: septNow, reversedByEntryId: null }]);
  expect((await f.progress()).plans[0]).toMatchObject({ plan: frozen, status: { kind: "Suspended", unsupportedEntryIds: [f.one.id] } });
  expect((await f.t.query(api.savingsRecovery.listCandidates, { ...f.ctx, from: "2026-09-01", through: "2026-09-30" })).map(row => row.remainingEligibleMinor)).toEqual([61, 202]);
  expect(await ledgerBytes(f.t)).toBe(ledger);
  vi.setSystemTime(Date.UTC(2026, 8, 25));
  const mirror = await reverse(f.t, f.workspace.id, reduction.id, { accountingDate: "2026-09-25" });
  await f.t.run(async ctx => {
    const workspaceId = ctx.db.normalizeId("workspaces", f.workspace.id);
    const sourceEntryId = ctx.db.normalizeId("journalEntries", f.one.id);
    const journalEntryId = ctx.db.normalizeId("journalEntries", mirror.id);
    if (!workspaceId || !sourceEntryId || !journalEntryId) throw new Error("Invalid fixture ids");
    await ctx.db.insert("journalSourceEffects", { workspaceId, sourceEntryId, journalEntryId, expenseDeltaMinorUnits: 40, sourceSequence: 2 });
  });
  const restored = await f.t.query(api.accounting.listPostedExpenses, { ...f.ctx, from: "2026-09-01", through: "2026-09-30" });
  expect(restored[0].currentEligibleAmount.minorUnits).toBe(101);
  expect(restored[0].sourceEffects.map(row => row.expenseDeltaMinorUnits)).toEqual([-40, 40]);
  expect(restored[0].sourceEffects[0].reversedByEntryId).toBe(mirror.id);
  expect((await f.progress(septNow)).plans[0].status.kind).toBe("Suspended");
  expect((await f.progress()).plans[0].status.kind).toBe("Suspended");
  await f.t.mutation(api.savingsRecovery.reconcilePlans, { ...f.ctx, idempotencyKey: "reconcile-restored" });
});

test("detected suspension stays historical after restoration and replacement uses restored actual eligible principal", async () => {
  const f = await fixture(); const id = await f.draft(); await f.activate(id);
  const reduction = await f.t.mutation(api.accounting.recordCashIncome, { ...f.ctx, financialAccountProfileId: f.source.id,
    amount: { currency: "COP", minorUnits: 40 }, accountingDate: "2026-09-24", description: "Effect fixture", idempotencyKey: "effect-fixture" });
  async function effect(journalEntryId: string, expenseDeltaMinorUnits: number) {
    await f.t.run(async ctx => {
      const workspaceId = ctx.db.normalizeId("workspaces", f.workspace.id);
      const sourceEntryId = ctx.db.normalizeId("journalEntries", f.one.id);
      const entry = ctx.db.normalizeId("journalEntries", journalEntryId);
      if (!workspaceId || !sourceEntryId || !entry) throw new Error("Invalid fixture ids");
      const prior = await ctx.db.query("journalSourceEffects").withIndex("by_workspace_source", q => q.eq("workspaceId", workspaceId).eq("sourceEntryId", sourceEntryId)).collect();
      await ctx.db.insert("journalSourceEffects", { workspaceId, sourceEntryId, journalEntryId: entry, expenseDeltaMinorUnits, sourceSequence: prior.length + 1 });
    });
  }
  await effect(reduction.id, -40);
  await f.t.mutation(api.savingsRecovery.reconcilePlans, { ...f.ctx, idempotencyKey: "suspend" });
  const reversal = await reverse(f.t, f.workspace.id, reduction.id, { accountingDate: "2026-09-24" });
  await effect(reversal.id, 40);
  expect((await f.progress()).plans[0].status.kind).toBe("Suspended");
  const replacement = await f.t.mutation(api.savingsRecovery.replacePlan, { ...f.ctx, planId: id, terms: f.terms, reason: "New supported plan", idempotencyKey: "new-plan" });
  await f.activate(replacement);
  expect((await f.progress()).plans.map(row => row.status.kind)).toEqual(["Cancelled", "Active"]);
});

test("zero premium, cent rounding, invalid money, locked activation and transferred capacity across plans have literal results", async () => {
  const f = await fixture();
  const id = await f.draft({ ...f.terms, sources: [{ entryId: f.one.id, principalMinor: 99 }], installmentAmountMinor: 33 }, "zero-premium");
  await f.activate(id);
  const row = (await f.progress()).plans[0];
  if (row.plan.state.kind !== "Activated") throw new Error("Expected activated plan");
  expect(row.plan.state.commitment.impliedMonthlyRate).toBe(0);
  expect(row.plan.state.commitment.schedule.map(item => [item.principalMinor, item.premiumMinor, item.amountMinor])).toEqual([[33, 0, 33], [33, 0, 33], [33, 0, 33]]);
  const single = await f.draft({ ...f.terms, sources: [{ entryId: f.two.id, principalMinor: 202 }], installmentCount: 1, installmentAmountMinor: 202 }, "single");
  await f.activate(single);
  const posted = await f.transfer(250);
  await f.t.mutation(api.savingsRecovery.recordContribution, { ...f.ctx, transferEntryId: posted.id, allocations: [{ planId: id, amountMinor: 99 }, { planId: single, amountMinor: 151 }], idempotencyKey: "combined" });
  expect((await f.progress()).plans.map(row => row.verified)).toEqual([{ amountMinor: 99, principalMinor: 99, premiumMinor: 0 }, { amountMinor: 151, principalMinor: 151, premiumMinor: 0 }]);
  expect(await caught(f.record(posted.id, single, 1, "capacity"))).toMatchObject({ data: { code: "recovery_transfer_capacity_exceeded" } });
  expect(await caught(f.draft({ ...f.terms, installmentAmountMinor: 0.5 }, "fraction"))).toMatchObject({ data: { code: "recovery_amount_invalid" } });
  expect(await caught(f.draft({ ...f.terms, sources: [{ entryId: f.one.id, principalMinor: Number.MAX_SAFE_INTEGER }], installmentAmountMinor: Number.MAX_SAFE_INTEGER }, "overflow"))).toMatchObject({ data: { code: "recovery_amount_invalid" } });
  const lateExpense = await f.expense(10, "locked-source");
  const lockedDraft = await f.draft({ ...f.terms, sources: [{ entryId: lateExpense.id, principalMinor: 10 }], installmentCount: 1, installmentAmountMinor: 10 }, "locked-draft");
  await lock(f.t, f.workspace.id, { year: 2026, month: 9 });
  expect(await caught(f.activate(lockedDraft))).toMatchObject({ data: { code: "recovery_activation_period_not_open" } });
});

test("cancelled Draft cannot be edited or activated, and all new protected exports reject missing proof", async () => {
  const f = await fixture(); const id = await f.draft();
  await f.t.mutation(api.savingsRecovery.cancelPlan, { ...f.ctx, planId: id, reason: "Discard proposal", idempotencyKey: "discard" });
  expect((await f.progress()).plans[0].status.kind).toBe("Cancelled");
  expect(await caught(f.activate(id))).toMatchObject({ data: { code: "recovery_plan_cancelled" } });
  expect(await caught(f.t.mutation(api.savingsRecovery.saveDraft, { ...f.ctx, planId: id, expectedRevision: 1, terms: f.terms, idempotencyKey: "edit-cancelled" }))).toMatchObject({ data: { code: "recovery_plan_cancelled" } });
  const ctx = { ...f.ctx, access: undefined };
  const cmd = { ...ctx, idempotencyKey: "proof-missing" };
  const calls = [
    () => f.t.query(api.accounting.listPostedExpenses, { ...ctx, from: "2026-09-01", through: "2026-09-30" }),
    () => f.t.query(api.savingsRecovery.progress, ctx),
    () => f.t.query(api.savingsRecovery.listCandidates, { ...ctx, from: "2026-09-01", through: "2026-09-30" }),
    () => f.t.query(api.savingsRecovery.monthlyWaterfall, { ...ctx, month: "2026-09", cash: entered, includePrepayment: false }),
    () => f.t.mutation(api.savingsRecovery.saveDraft, { ...cmd, planId: null, expectedRevision: null, terms: f.terms }),
    () => f.t.mutation(api.savingsRecovery.activatePlan, { ...cmd, planId: id, expectedRevision: 1 }),
    () => f.t.mutation(api.savingsRecovery.cancelPlan, { ...cmd, planId: id, reason: "Cancel" }),
    () => f.t.mutation(api.savingsRecovery.replacePlan, { ...cmd, planId: id, reason: "Replace", terms: f.terms }),
    () => f.t.mutation(api.savingsRecovery.reconcilePlans, cmd),
    () => f.t.mutation(api.savingsRecovery.decideCandidate, { ...cmd, entryId: f.one.id, decision: "eligible" }),
    () => f.t.mutation(api.savingsRecovery.recordContribution, { ...cmd, transferEntryId: f.one.id, allocations: [] }),
    () => f.t.mutation(api.savingsRecovery.reverseContribution, { ...cmd, contributionId: "missing", reason: "Correction" }),
    () => f.t.mutation(api.savingsRecovery.proposeAllocation, { ...cmd, transferEntryId: f.one.id, allocations: [], importReference: "local-fixture" }),
    () => f.t.mutation(api.savingsRecovery.decideProposal, { ...cmd, proposalId: "missing", decision: "accepted" }),
    () => f.t.mutation(api.savingsRecovery.declareOpeningProgress, { ...cmd, planId: id, amountMinor: 1, throughDate: "2026-09-23", provenance: "Declared", evidenceUnavailable: true }),
  ];
  for (const call of calls) expect(await caught(call())).toMatchObject({ data: { code: "device_proof_required" } });
});

test.each(["contribution", "transfer"] as const)("completed reservation requires cancellation before reuse and cannot revive after %s reversal", async reversalKind => {
  const f = await fixture();
  const old = await f.draft({ ...f.terms, sources: [{ entryId: f.one.id, principalMinor: 50 }], installmentCount: 1, installmentAmountMinor: 50 }, "old-partial");
  await f.activate(old);
  const support = await f.transfer(50);
  const contributionId = await f.record(support.id, old, 50);
  expect((await f.progress()).plans[0].status.kind).toBe("Completed");
  const next = await f.draft({ ...f.terms, sources: [{ entryId: f.one.id, principalMinor: 51 }], installmentCount: 1, installmentAmountMinor: 51 }, "leftover");
  expect(await caught(f.activate(next))).toMatchObject({ data: { code: "recovery_source_reserved" } });
  expect(await caught(f.t.mutation(api.savingsRecovery.decideCandidate, { ...f.ctx, entryId: f.one.id, decision: "excluded", idempotencyKey: "exclude-complete" }))).toMatchObject({ data: { code: "recovery_source_reserved" } });
  await f.t.mutation(api.savingsRecovery.cancelPlan, { ...f.ctx, planId: old, reason: "Release completed reservation", idempotencyKey: "release" });
  await f.activate(next, "activate-after-release");
  if (reversalKind === "contribution") await f.t.mutation(api.savingsRecovery.reverseContribution, { ...f.ctx, contributionId, reason: "Correct old completed attribution", idempotencyKey: "undo-old" });
  else await reverse(f.t, f.workspace.id, support.id, { accountingDate: "2026-09-24" });
  expect((await f.progress()).plans.map(row => [row.status.kind, row.verified.amountMinor])).toEqual([["Cancelled", 0], ["Active", 0]]);
  const fresh = await f.transfer(10, "fresh");
  const ledger = await ledgerBytes(f.t);
  expect(await caught(f.record(fresh.id, old, 5, "revive-old"))).toMatchObject({ data: { code: "recovery_plan_inactive" } });
  await f.record(fresh.id, next, 10, "pay-new");
  expect((await f.progress()).plans[1].verified.principalMinor).toBe(10);
  expect(await ledgerBytes(f.t)).toBe(ledger);
});

test("opening progress rejects activation-day dates and claimable ledger evidence while historical imported window remains declared", async () => {
  const f = await fixture(); const id = await f.draft(); await f.activate(id);
  const args = { ...f.ctx, planId: id, amountMinor: 100, throughDate: "2026-09-24", evidenceUnavailable: true as const, provenance: "Declared cutover", idempotencyKey: "today-baseline" };
  expect(await caught(f.t.mutation(api.savingsRecovery.declareOpeningProgress, args))).toMatchObject({ data: { code: "recovery_opening_date_invalid" } });
  await f.transfer(100);
  const before = await ledgerBytes(f.t);
  expect(await caught(f.t.mutation(api.savingsRecovery.declareOpeningProgress, { ...args, throughDate: "2026-09-23", idempotencyKey: "available-evidence" }))).toMatchObject({ data: { code: "recovery_opening_evidence_available" } });
  expect((await f.progress()).plans[0].declaredBaseline.amountMinor).toBe(0);
  expect(await ledgerBytes(f.t)).toBe(before);
  const historical = await fixture(); const historicalPlan = await historical.draft(); await historical.activate(historicalPlan);
  await historical.transfer(100, "pre-activation-import", "2026-09-23");
  await historical.t.mutation(api.savingsRecovery.declareOpeningProgress, { ...args, ...historical.ctx, planId: historicalPlan, throughDate: "2026-09-23", idempotencyKey: "historical-baseline" });
  expect((await historical.progress()).plans[0]).toMatchObject({ verified: { amountMinor: 0 }, declaredBaseline: { amountMinor: 100 } });
});

test("equal Posted timestamps cannot erase unsupported source history without reconciliation", async () => {
  const f = await fixture(); const id = await f.draft(); await f.activate(id);
  const reduction = await f.t.mutation(api.accounting.recordCashIncome, { ...f.ctx, financialAccountProfileId: f.source.id,
    amount: { currency: "COP", minorUnits: 40 }, accountingDate: "2026-09-24", description: "Equal timestamp effect", idempotencyKey: "equal-effect" });
  async function effect(journalEntryId: string, expenseDeltaMinorUnits: number) {
    await f.t.run(async ctx => {
      const workspaceId = ctx.db.normalizeId("workspaces", f.workspace.id);
      const sourceEntryId = ctx.db.normalizeId("journalEntries", f.one.id);
      const entry = ctx.db.normalizeId("journalEntries", journalEntryId);
      if (!workspaceId || !sourceEntryId || !entry) throw new Error("Invalid fixture ids");
      const prior = await ctx.db.query("journalSourceEffects").withIndex("by_workspace_source", q => q.eq("workspaceId", workspaceId).eq("sourceEntryId", sourceEntryId)).collect();
      await ctx.db.insert("journalSourceEffects", { workspaceId, sourceEntryId, journalEntryId: entry, expenseDeltaMinorUnits, sourceSequence: prior.length + 1 });
    });
  }
  await effect(reduction.id, -40);
  expect((await f.progress()).plans[0].status.kind).toBe("Suspended");
  const mirror = await reverse(f.t, f.workspace.id, reduction.id, { accountingDate: "2026-09-24" });
  expect(mirror.postedAt).toBe(reduction.postedAt);
  await effect(mirror.id, 40);
  expect((await f.progress()).plans[0].status.kind).toBe("Suspended");
  const restored = await f.t.query(api.accounting.listPostedExpenses, { ...f.ctx, from: "2026-09-01", through: "2026-09-30" });
  expect(restored[0].currentEligibleAmount.minorUnits).toBe(101);
  const replacement = await f.t.mutation(api.savingsRecovery.replacePlan, { ...f.ctx, planId: id, terms: f.terms, reason: "Explicit restoration replacement", idempotencyKey: "same-time-replace" });
  await f.activate(replacement);
  expect((await f.progress()).plans.map(row => row.status.kind)).toEqual(["Cancelled", "Active"]);
});
