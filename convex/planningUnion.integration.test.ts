import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { convexAccounting, createDaily, createProfile, groceries, ownerIdentity, reverse, septNow } from "../src/accounting/convexHarness";
import type { AccountingTest } from "../src/accounting/convexHarness";
import { fixtureKey, fixtureProof, registerFixture } from "../src/access/convexHarness";
import type { FinancialOperation } from "../src/access/protocol";
import { createRule, ledgerBytes } from "../src/budget/convexHarness";
import { hasWorkspacePermission, workspaceRolePolicyVersion } from "../src/accounting/membership";
import type { PlanTerms } from "../src/savingsRecovery/types";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(septNow); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

async function planningBytes(t: AccountingTest, scope: "Budget" | "Recovery") {
  return t.run(async ctx => JSON.stringify(scope === "Budget" ? {
    heads: await ctx.db.query("budgets").collect(), versions: await ctx.db.query("budgetVersions").collect(), receipts: await ctx.db.query("budgetReceipts").collect(),
  } : {
    plans: await ctx.db.query("recoveryPlans").collect(), events: await ctx.db.query("recoveryEvents").collect(), receipts: await ctx.db.query("recoveryReceipts").collect(),
  }));
}
async function planningOnly<T>(t: AccountingTest, scope: "Budget" | "Recovery", run: () => Promise<T>) {
  const ledger = await ledgerBytes(t);
  const opposite = scope === "Budget" ? "Recovery" : "Budget";
  const before = await planningBytes(t, opposite);
  try { return await run(); }
  finally { expect(await ledgerBytes(t)).toBe(ledger); expect(await planningBytes(t, opposite)).toBe(before); }
}
async function readOnly<T>(t: AccountingTest, run: () => Promise<T>) {
  const before = [await ledgerBytes(t), await planningBytes(t, "Budget"), await planningBytes(t, "Recovery")];
  try { return await run(); }
  finally { expect([await ledgerBytes(t), await planningBytes(t, "Budget"), await planningBytes(t, "Recovery")]).toEqual(before); }
}
async function financeOnly<T>(t: AccountingTest, run: () => Promise<T>) {
  const before = [await planningBytes(t, "Budget"), await planningBytes(t, "Recovery")];
  try { return await run(); }
  finally { expect([await planningBytes(t, "Budget"), await planningBytes(t, "Recovery")]).toEqual(before); }
}
async function fixture(kind: "Personal" | "Household") {
  const t = convexAccounting(modules, true);
  const workspace = kind === "Personal"
    ? await t.mutation(api.accounting.createPersonalWorkspace, { functionalCurrency: "COP", now: septNow })
    : await t.mutation(api.accounting.createHouseholdWorkspace, { functionalCurrency: "COP", now: septNow, idempotencyKey: "house" });
  const profile = await createDaily(t, workspace.id);
  const destination = await createProfile(t, workspace.id, "Savings", "savingsAccount");
  const ctx = { workspaceId: workspace.id };
  await t.mutation(api.accounting.recordOpeningPosition, { ...ctx, financialAccountProfileId: profile.id,
    amount: { currency: "COP", minorUnits: 10000 }, accountingDate: "2026-09-01", description: "Start", idempotencyKey: "opening" });
  const created = await t.mutation(api.accounting.createUserCategory, { ...ctx, name: "Mercado", selection: { kind: "preset", concept: "groceries" }, idempotencyKey: "category" });
  if (created.kind !== "category") throw new Error("Category expected");
  const category = created.category;
  const spend = (amount: number, date: string, key: string) => financeOnly(t, () => t.mutation(api.accounting.recordCashExpense, {
    ...groceries(workspace.id, profile.id, { amount, accountingDate: date, idempotencyKey: key }), userCategoryId: category.id, ledgerAccountCode: "512010",
  }));
  const expense = await spend(100, "2026-09-20", "source");
  const terms: PlanTerms = { name: "Recover actual expense", destinationProfileId: destination.id,
    sources: [{ entryId: expense.id, principalMinor: 100 }], installmentCount: 2, installmentAmountMinor: 50 };
  const draftArgs = { ...ctx, planId: null, expectedRevision: null, terms, idempotencyKey: "draft" };
  const draft = () => planningOnly(t, "Recovery", () => t.mutation(api.savingsRecovery.saveDraft, draftArgs));
  const activate = (planId: string, key = "activate") => planningOnly(t, "Recovery", () => t.mutation(api.savingsRecovery.activatePlan,
    { ...ctx, planId, expectedRevision: 1, idempotencyKey: key }));
  const evaluate = (month = 9) => readOnly(t, () => t.query(api.budget.evaluateBudgets, { ...ctx, month: { year: 2026, month } }));
  const progress = () => readOnly(t, () => t.query(api.savingsRecovery.progress, ctx));
  const candidates = () => readOnly(t, () => t.query(api.savingsRecovery.listCandidates, { ...ctx, from: "2026-09-01", through: "2026-10-31" }));
  return { t, workspace, profile, destination, ctx, category, spend, expense, terms, draftArgs, draft, activate, evaluate, progress, candidates };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
type Proof = Awaited<ReturnType<typeof fixtureProof>>;
async function role(f: Fixture, role: "Owner" | "Accountant" | "Preparer" | "Viewer" | null) {
  await f.t.run(async ctx => {
    const id = ctx.db.normalizeId("workspaces", f.workspace.id);
    const membership = id && await ctx.db.query("workspaceMemberships").withIndex("by_workspace_user", q =>
      q.eq("workspaceId", id).eq("userId", ownerIdentity.tokenIdentifier)).unique();
    if (!membership) throw new Error("Current membership expected");
    if (role === null) await ctx.db.delete(membership._id); else await ctx.db.patch(membership._id, { role });
  });
}

test("combined role version retains Posting and View without granting either planning capability", () => {
  expect(workspaceRolePolicyVersion).toBe("workspace-roles@3");
  for (const permission of ["manageBudgets", "manageRecoveryPlans"] as const) {
    expect(hasWorkspacePermission("Owner", permission)).toBe(true);
    for (const role of ["Accountant", "Preparer", "Viewer"] as const) expect(hasWorkspacePermission(role, permission)).toBe(false);
  }
  expect(hasWorkspacePermission("Accountant", "post")).toBe(true);
  for (const role of ["Owner", "Accountant", "Preparer", "Viewer"] as const) expect(hasWorkspacePermission(role, "view")).toBe(true);
});

for (const kind of ["Personal", "Household"] as const) {
  test(`${kind}: combined management proofs, retries and current roles preserve both scopes and authorized Posting`, async () => {
    const f = await fixture(kind);
    const budget = await planningOnly(f.t, "Budget", () => createRule(f, { cardinality: "multipleNamed", limit: { currency: "COP", minorUnits: 50 } }));
    const planId = await f.draft();
    expect(await f.draft()).toBe(planId);
    await f.activate(planId);
    const client = f.t.withIdentity({ ...ownerIdentity, sid: "sess_planningunion", sts: "active" });
    const key = await fixtureKey(); const device = await registerFixture(client, key, "android");
    const budgetArgs = { ...f.ctx, name: "Proof budget", startMonth: { year: 2026, month: 9 }, target: { kind: "totalExpense" as const },
      cardinality: "multipleNamed" as const, rollover: { kind: "none" as const }, limit: { currency: "COP", minorUnits: 75 }, idempotencyKey: "proof-budget" };
    const recoveryArgs = { ...f.draftArgs, idempotencyKey: "proof-recovery" };
    const retryB = async () => client.mutation(api.budget.createBudget, { ...budgetArgs,
      access: await fixtureProof(client, key, "budget.createBudget", budgetArgs, device.id) });
    const retryR = async () => client.mutation(api.savingsRecovery.saveDraft, { ...recoveryArgs,
      access: await fixtureProof(client, key, "savingsRecovery.saveDraft", recoveryArgs, device.id) });
    const endpoints: Array<{ operation: FinancialOperation; wrong: FinancialOperation; scope: "Budget" | "Recovery"; args: Record<string, unknown>; call(access?: Proof): Promise<unknown> }> = [
      { operation: "budget.createBudget", wrong: "savingsRecovery.saveDraft", scope: "Budget", args: budgetArgs,
        call: access => client.mutation(api.budget.createBudget, { ...budgetArgs, access }) },
      { operation: "savingsRecovery.saveDraft", wrong: "budget.createBudget", scope: "Recovery", args: recoveryArgs,
        call: access => client.mutation(api.savingsRecovery.saveDraft, { ...recoveryArgs, access }) },
    ];
    for (const endpoint of endpoints) {
      const call = (access?: Proof) => planningOnly(f.t, endpoint.scope, () => endpoint.call(access));
      expect(await call().catch(e => e)).toMatchObject({ data: { code: "device_proof_required", directive: "unlock-online" } });
      expect(await call(await fixtureProof(client, key, endpoint.wrong, endpoint.args, device.id)).catch(e => e))
        .toMatchObject({ data: { code: "device_proof_invalid", directive: "unlock-online" } });
      expect(await call(await fixtureProof(client, key, endpoint.operation, { ...endpoint.args, changedFact: true }, device.id)).catch(e => e))
        .toMatchObject({ data: { code: "device_request_mismatch", directive: "unlock-online" } });
      const proof = await fixtureProof(client, key, endpoint.operation, endpoint.args, device.id);
      expect(await call({ ...proof, signature: "0".repeat(128) }).catch(e => e)).toMatchObject({ data: { code: "device_proof_invalid" } });
      expect(await call(proof)).toBeDefined();
      expect(await call(proof).catch(e => e)).toMatchObject({ data: { code: "device_challenge_replayed", directive: "unlock-online" } });
    }
    const retryBudget = await planningOnly(f.t, "Budget", retryB);
    expect(retryBudget.replay).toBe(true);
    const retryRecovery = await planningOnly(f.t, "Recovery", retryR);
    expect(await planningOnly(f.t, "Recovery", retryR)).toBe(retryRecovery);
    expect(await f.t.run(async ctx => [(await ctx.db.query("budgets").collect()).length, (await ctx.db.query("recoveryPlans").collect()).length])).toEqual([2, 2]);
    const proposal = { financialAccountProfileId: f.profile.id, accountingDate: "2026-09-24", amount: { currency: "COP", minorUnits: 10 }, userCategoryId: f.category.id };
    const warning = await readOnly(f.t, () => f.t.query(api.budget.budgetImpactWarning, { ...f.ctx, proposal }));
    expect(warning).toMatchObject({ hasPostingAuthority: false, blocksPosting: false });
    expect(warning.impacts.find(row => row.evaluation.budgetId === budget.budget.id)?.projected)
      .toMatchObject({ actual: { minorUnits: 110 }, planning: { kind: "limited", remaining: { minorUnits: -60 }, overage: { minorUnits: 60 } } });
    expect((await f.spend(10, "2026-09-24", "authorized-overage")).amount.minorUnits).toBe(10);
    for (const current of ["Accountant", "Preparer", "Viewer"] as const) {
      await role(f, current);
      expect(await planningOnly(f.t, "Budget", retryB).catch(e => e))
        .toMatchObject({ data: { code: "workspace_permission_required" } });
      expect(await planningOnly(f.t, "Recovery", retryR).catch(e => e))
        .toMatchObject({ data: { code: "workspace_permission_required" } });
      expect((await f.evaluate()).rows).toHaveLength(2);
      expect((await f.progress()).plans.find(row => row.plan.id === planId)?.status.kind).toBe("Active");
      if (current === "Accountant") expect((await f.spend(1, "2026-09-24", "accountant-post")).postedBy).toBe(ownerIdentity.tokenIdentifier);
      else expect(await f.spend(1, "2026-09-24", `denied-${current}`).catch(e => e)).toMatchObject({ data: { code: "workspace_permission_required" } });
    }
    await role(f, "Owner");
    expect((await f.evaluate()).rows.find(row => row.budgetId === budget.budget.id)).toMatchObject({ actual: { minorUnits: 111 }, planning: { overage: { minorUnits: 61 } } });
    expect(await f.draft()).toBe(planId);
    const forgedBudget = { ...budgetArgs, userId: "forged" };
    const forgedRecovery = { ...recoveryArgs, actor: { userId: "forged" } };
    await expect(readOnly(f.t, () => f.t.mutation(api.budget.createBudget, { ...forgedBudget, access: undefined }))).rejects.toThrow(/Unexpected field.*userId/);
    await expect(readOnly(f.t, () => f.t.mutation(api.savingsRecovery.saveDraft, { ...forgedRecovery, access: undefined }))).rejects.toThrow(/Unexpected field.*actor/);
    await role(f, null);
    expect(await f.evaluate().catch(e => e)).toMatchObject({ data: { code: "workspace_membership_required" } });
    expect(await f.progress().catch(e => e)).toMatchObject({ data: { code: "workspace_membership_required" } });
    expect(await planningOnly(f.t, "Budget", retryB).catch(e => e)).toMatchObject({ data: { code: "workspace_membership_required" } });
    expect(await planningOnly(f.t, "Recovery", retryR).catch(e => e)).toMatchObject({ data: { code: "workspace_membership_required" } });
  });

  test(`${kind}: actual locked correction and equal-time mirror preserve Posted-month Budget spend and source-prefix Recovery suspension`, async () => {
    const f = await fixture(kind);
    await planningOnly(f.t, "Budget", () => createRule(f, { limit: { currency: "COP", minorUnits: 50 } }));
    const planId = await f.draft(); await f.activate(planId);
    expect((await f.evaluate()).rows[0]).toMatchObject({ actual: { minorUnits: 100 }, planning: { overage: { minorUnits: 50 } } });
    expect((await f.candidates())[0]).toMatchObject({ expense: { currentEligibleAmount: { minorUnits: 100 } }, reservedBy: planId });
    const frozen = (await f.progress()).plans[0].plan;
    expect(frozen.state).toMatchObject({ kind: "Activated", commitment: { sourceEffectCuts: { [f.expense.id]: 0 } } });
    const october = Date.UTC(2026, 9, 2, 12); vi.setSystemTime(october);
    const openingTransfer = await financeOnly(f.t, () => f.t.mutation(api.accounting.recordAccountTransfer, { ...f.ctx,
      sourceFinancialAccountProfileId: f.profile.id, destinationFinancialAccountProfileId: f.destination.id,
      amount: { currency: "COP", minorUnits: 1 }, accountingDate: "2026-10-02", description: "Real month-opening transfer", idempotencyKey: "open-october" }));
    await financeOnly(f.t, () => reverse(f.t, f.workspace.id, openingTransfer.id, { accountingDate: "2026-10-02", idempotencyKey: "restore-opening-transfer" }));
    await financeOnly(f.t, () => f.t.mutation(api.accounting.lockAccountingPeriod, { ...f.ctx, period: { year: 2026, month: 9 } }));
    const request = { ...f.ctx, categoryId: f.category.id, target: { kind: "category" as const, nature: "Income" as const, accountCode: "42201001" }, currentDate: "2026-10-02" };
    const preview = await readOnly(f.t, () => f.t.query(api.accounting.previewCategoryReclassification, request));
    expect(preview).toMatchObject({ amount: { minorUnits: 100 }, correctionDates: ["2026-10-02"] });
    const args = { ...request, revisionToken: preview.revisionToken, confirmed: true as const, idempotencyKey: "catch-up" };
    const corrected = await financeOnly(f.t, () => f.t.mutation(api.accounting.confirmCategoryReclassification, args));
    expect(corrected.correctionEntryIds).toHaveLength(1);
    expect((await f.evaluate()).rows[0].actual.minorUnits).toBe(100);
    const negative = (await f.evaluate(10)).rows[0];
    expect(negative).toMatchObject({ actual: { minorUnits: -100 }, planning: { carry: { minorUnits: 0 }, remaining: { minorUnits: 150 }, overage: { minorUnits: 0 } } });
    expect(negative.sources.map(line => [line.journalEntryId, line.accountingDate, line.debitMinorUnits, line.creditMinorUnits]))
      .toEqual([[corrected.correctionEntryIds[0], "2026-10-02", 0, 100]]);
    expect((await f.candidates())[0].remainingEligibleMinor).toBe(0);
    expect((await f.progress()).plans[0]).toMatchObject({ plan: frozen, status: { kind: "Suspended", unsupportedEntryIds: [f.expense.id] } });
    const correction = (await readOnly(f.t, () => f.t.query(api.accounting.listJournalEntries, f.ctx))).find(entry => entry.id === corrected.correctionEntryIds[0]);
    const mirror = await financeOnly(f.t, () => reverse(f.t, f.workspace.id, corrected.correctionEntryIds[0], { accountingDate: "2026-10-02", idempotencyKey: "mirror" }));
    expect(mirror.postedAt).toBe(correction?.postedAt);
    expect((await f.evaluate()).rows[0].actual.minorUnits).toBe(100);
    expect((await f.evaluate(10)).rows[0]).toMatchObject({ actual: { minorUnits: 0 }, planning: { remaining: { minorUnits: 50 } } });
    expect((await f.candidates())[0].remainingEligibleMinor).toBe(100);
    expect((await f.progress()).plans[0]).toMatchObject({ plan: frozen, status: { kind: "Suspended" } });
    expect((await financeOnly(f.t, () => reverse(f.t, f.workspace.id, corrected.correctionEntryIds[0], { accountingDate: "2026-10-02", idempotencyKey: "mirror" }))).replay).toBe(true);
    expect((await financeOnly(f.t, () => f.t.mutation(api.accounting.confirmCategoryReclassification, args))).replay).toBe(true);
    expect(await f.t.run(async ctx => (await ctx.db.query("journalSourceEffects").collect()).map(row => [row.sourceEntryId, row.sourceSequence, row.expenseDeltaMinorUnits])))
      .toEqual([[f.expense.id, 1, -100], [f.expense.id, 2, 100]]);
    const reconcile = { ...f.ctx, idempotencyKey: "reconcile" };
    await planningOnly(f.t, "Recovery", () => f.t.mutation(api.savingsRecovery.reconcilePlans, reconcile));
    const after = await planningBytes(f.t, "Recovery");
    await planningOnly(f.t, "Recovery", () => f.t.mutation(api.savingsRecovery.reconcilePlans, reconcile));
    expect(await planningBytes(f.t, "Recovery")).toBe(after);
    expect((await f.progress()).history.filter(event => event.data.kind === "suspended")).toHaveLength(1);
    const replacement = await planningOnly(f.t, "Recovery", () => f.t.mutation(api.savingsRecovery.replacePlan,
      { ...f.ctx, planId, terms: f.terms, reason: "Explicit restored source", idempotencyKey: "replace" }));
    await f.activate(replacement, "activate-replacement");
    expect((await f.progress()).plans.map(row => row.status.kind)).toEqual(["Cancelled", "Active"]);
    expect((await f.progress()).plans[1].plan.state).toMatchObject({ kind: "Activated", commitment: { sourceEffectCuts: { [f.expense.id]: 2 } } });
    expect((await readOnly(f.t, () => f.t.query(api.accounting.balances, f.ctx))).find(row => row.financialAccountProfileId === f.profile.id)?.balance.minorUnits).toBe(9900);
  });
}

test("unavailable Budget warning leaves independently authorized Recovery and Posting available", async () => {
  const f = await fixture("Personal");
  await planningOnly(f.t, "Budget", () => createRule(f, { limit: { currency: "COP", minorUnits: 50 } }));
  const planId = await f.draft();
  const client = f.t.withIdentity({ ...ownerIdentity, sid: "sess_unionheadroom", sts: "active" });
  const key = await fixtureKey(); const device = await registerFixture(client, key, "android");
  const args = { ...f.ctx, proposal: { financialAccountProfileId: f.profile.id, accountingDate: "2026-09-24", amount: { currency: "COP", minorUnits: 1 } } };
  const access = await fixtureProof(client, key, "budget.budgetImpactWarning", args, device.id);
  expect(await readOnly(f.t, () => client.query(ctx => ctx.runQuery(api.budget.budgetImpactWarning,
    { ...args, access }, { transactionLimits: { bytesRead: 8 * 1024 * 1024 } }))).catch(e => e))
    .toMatchObject({ data: { code: "planning_read_limit" } });
  await f.activate(planId);
  expect((await f.spend(1, "2026-09-24", "after-unavailable-warning")).amount.minorUnits).toBe(1);
  expect((await f.evaluate()).rows[0]).toMatchObject({ actual: { minorUnits: 101 }, planning: { overage: { minorUnits: 51 } } });
  const transfer = await financeOnly(f.t, () => f.t.mutation(api.accounting.recordAccountTransfer, { ...f.ctx,
    sourceFinancialAccountProfileId: f.profile.id, destinationFinancialAccountProfileId: f.destination.id,
    amount: { currency: "COP", minorUnits: 50 }, accountingDate: "2026-09-24", description: "Actual saving", idempotencyKey: "transfer" }));
  await planningOnly(f.t, "Recovery", () => f.t.mutation(api.savingsRecovery.recordContribution, { ...f.ctx,
    transferEntryId: transfer.id, allocations: [{ planId, amountMinor: 50 }], idempotencyKey: "contribute" }));
  expect((await f.progress()).plans[0]).toMatchObject({ status: { kind: "Active" }, verified: { amountMinor: 50, principalMinor: 50, premiumMinor: 0 } });
  expect((await f.evaluate()).rows[0].actual.minorUnits).toBe(101);
});
