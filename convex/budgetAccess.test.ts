import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";
import { budgetFixture, createRule, updateRule, retireRule, evaluate, planningOnly, membership } from "../src/budget/convexHarness";
import { ownerIdentity, createDaily } from "../src/accounting/convexHarness";
import { fixtureKey, fixtureProof, registerFixture } from "../src/access/convexHarness";
import type { FinancialOperation } from "../src/access/protocol";
import type { BudgetFixture } from "../src/budget/convexHarness";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
async function client(f: BudgetFixture) {
  const t = f.t.withIdentity({ ...ownerIdentity, sid: "sess_budgetproof", sts: "active" });
  const key = await fixtureKey();
  const device = await registerFixture(t, key, "android");
  return { t, key, device };
}
type Proof = Awaited<ReturnType<typeof fixtureProof>>;
function publicCase(f: BudgetFixture, budgetId: string, operation: FinancialOperation): { args: Record<string, unknown>; mutation: boolean; call(access?: Proof): Promise<unknown> } {
  const workspaceId = f.workspace.id;
  switch (operation) {
    case "budget.createBudget": {
      const args = { workspaceId, name: "New rule", startMonth: { year: 2026, month: 9 }, target: { kind: "totalExpense" as const },
        cardinality: "multipleNamed" as const, rollover: { kind: "none" as const }, limit: { currency: "COP", minorUnits: 10 }, idempotencyKey: "new-rule" };
      return { args, mutation: true, call: (access?: Proof) => f.t.mutation(api.budget.createBudget, { ...args, access }) };
    }
    case "budget.updateBudget": {
      const args = { workspaceId, budgetId, revision: 1, change: { kind: "rename" as const, name: "Renamed" }, idempotencyKey: "rename" };
      return { args, mutation: true, call: (access?: Proof) => f.t.mutation(api.budget.updateBudget, { ...args, access }) };
    }
    case "budget.retireBudget": {
      const args = { workspaceId, budgetId, revision: 1, effective: { kind: "prospective" as const, month: { year: 2026, month: 11 } }, idempotencyKey: "retire" };
      return { args, mutation: true, call: (access?: Proof) => f.t.mutation(api.budget.retireBudget, { ...args, access }) };
    }
    case "budget.listBudgets": {
      const args = { workspaceId };
      return { args, mutation: false, call: (access?: Proof) => f.t.query(api.budget.listBudgets, { ...args, access }) };
    }
    case "budget.evaluateBudgets": {
      const args = { workspaceId, month: { year: 2026, month: 9 } };
      return { args, mutation: false, call: (access?: Proof) => f.t.query(api.budget.evaluateBudgets, { ...args, access }) };
    }
    case "budget.budgetImpactWarning": {
      const args = { workspaceId, proposal: { financialAccountProfileId: f.profile.id, accountingDate: "2026-09-30", amount: { currency: "COP", minorUnits: 12 } } };
      return { args, mutation: false, call: (access?: Proof) => f.t.query(api.budget.budgetImpactWarning, { ...args, access }) };
    }
    default: throw new Error("Budget operation required");
  }
}
const budgetOperations = ["budget.createBudget", "budget.updateBudget", "budget.retireBudget", "budget.listBudgets", "budget.evaluateBudgets", "budget.budgetImpactWarning"] satisfies FinancialOperation[];
for (const operation of budgetOperations) test(`${operation}: unchanged exact operation/payload/device proofs and mutation replay protection`, async () => {
  const f = await budgetFixture(modules);
  const created = await createRule(f, { cardinality: "multipleNamed" });
  const c = await client(f);
  const onClient = { ...f, t: c.t };
  const anonymous = publicCase({ ...f, t: convexTest(schema, modules) }, created.budget.id, operation);
  expect(await anonymous.call().catch(e => e)).toMatchObject({ data: { code: "authentication_required" } });
  const entry = publicCase(onClient, created.budget.id, operation);
  const call = (access?: Proof) => planningOnly(f.t, () => entry.call(access));
  expect(await call().catch(e => e)).toMatchObject({ data: { code: "device_proof_required", directive: "unlock-online" } });
  const wrong = await fixtureProof(c.t, c.key, "accounting.balances", entry.args, c.device.id);
  expect(await call(wrong).catch(e => e)).toMatchObject({ data: { code: "device_proof_invalid" } });
  const changed = await fixtureProof(c.t, c.key, operation, { ...entry.args, changedFact: 1 }, c.device.id);
  expect(await call(changed).catch(e => e)).toMatchObject({ data: { code: "device_request_mismatch" } });
  const proof = await fixtureProof(c.t, c.key, operation, entry.args, c.device.id);
  expect(await call(proof)).toBeDefined();
  if (entry.mutation) expect(await call(proof).catch(e => e)).toMatchObject({ data: { code: "device_challenge_replayed" } });
  const pending = await fixtureProof(c.t, c.key, operation, entry.args, c.device.id);
  const revokeArgs = { deviceId: c.device.id };
  await c.t.mutation(api.devices.revoke, { ...revokeArgs, access: await fixtureProof(c.t, c.key, "devices.revoke", revokeArgs, c.device.id) });
  expect(await call(pending).catch(e => e)).toMatchObject({ data: { code: "device_revoked", directive: "wipe-local-input-and-sign-out" } });
});

for (const household of [false, true]) test(`${household ? "Household" : "Personal"}: current permissions and membership protect fresh calls and idempotent retries`, async () => {
  const f = await budgetFixture(modules, household);
  const created = await createRule(f);
  const c = await client(f);
  const args = { workspaceId: f.workspace.id, budgetId: created.budget.id, revision: 1, change: { kind: "rename" as const, name: "Changed" }, idempotencyKey: "pending-rename" };
  const pending = await fixtureProof(c.t, c.key, "budget.updateBudget", args, c.device.id);
  for (const role of ["Accountant", "Preparer", "Viewer"] as const) {
    await membership(f, role);
    expect(await planningOnly(f.t, () => c.t.mutation(api.budget.updateBudget, { ...args, access: pending })).catch(e => e)).toMatchObject({ data: { code: "workspace_permission_required" } });
    expect(await createRule(f).catch(e => e)).toMatchObject({ data: { code: "workspace_permission_required" } });
    expect((await evaluate(f, 9)).rows[0]).toMatchObject({ budgetId: created.budget.id, actual: { minorUnits: 0 } });
    expect((await f.t.query(api.budget.listBudgets, { workspaceId: f.workspace.id }))[0]?.id).toBe(created.budget.id);
    expect(await f.t.query(api.budget.budgetImpactWarning, { workspaceId: f.workspace.id,
      proposal: { financialAccountProfileId: f.profile.id, accountingDate: "2026-09-30", amount: { currency: "COP", minorUnits: 1 } } })).toMatchObject({ blocksPosting: false });
  }
  await membership(f, "Owner");
  expect(await planningOnly(f.t, () => c.t.mutation(api.budget.updateBudget, { ...args, access: pending }))).toMatchObject({ budget: { revision: 2 } });
  expect(await createRule(f)).toEqual({ ...created, replay: true });
  const queryArgs = { workspaceId: f.workspace.id, month: { year: 2026, month: 9 } };
  const readProof = await fixtureProof(c.t, c.key, "budget.evaluateBudgets", queryArgs, c.device.id);
  const retryProof = await fixtureProof(c.t, c.key, "budget.updateBudget", args, c.device.id);
  await membership(f, null);
  expect(await planningOnly(f.t, () => c.t.query(api.budget.evaluateBudgets, { ...queryArgs, access: readProof })).catch(e => e)).toMatchObject({ data: { code: "workspace_membership_required" } });
  expect(await planningOnly(f.t, () => c.t.mutation(api.budget.updateBudget, { ...args, access: retryProof })).catch(e => e)).toMatchObject({ data: { code: "workspace_membership_required" } });
  expect(await createRule(f).catch(e => e)).toMatchObject({ data: { code: "workspace_membership_required" } });
});

test("foreign Workspace Budget/Category/account/proposal references and client actors give no authority", async () => {
  const f = await budgetFixture(modules);
  const local = await createRule(f);
  const other = await f.t.mutation(api.accounting.createHouseholdWorkspace, { functionalCurrency: "USD", now: Date.UTC(2026, 8, 24), idempotencyKey: "other" });
  const profile = await createDaily(f.t, other.id);
  const category = await f.t.mutation(api.accounting.createUserCategory, { workspaceId: other.id, name: "Other", selection: { kind: "preset", concept: "groceries" }, idempotencyKey: "other-category" });
  if (category.kind !== "category") throw new Error("Category expected");
  const foreign = await f.t.mutation(api.accounting.recordCashExpense, { workspaceId: other.id, financialAccountProfileId: profile.id,
    amount: { currency: "USD", minorUnits: 10 }, accountingDate: "2026-09-30", description: "Other", idempotencyKey: "expense" });
  const account = foreign.lines.find(l => l.nature === "Expense"); if (!account) throw new Error("Account expected");
  expect(await createRule(f, { target: { kind: "expenseAccount", ledgerAccountId: account.ledgerAccountId }, idempotencyKey: "foreign-account" }).catch(e => e)).toMatchObject({ data: { code: "budget_target_invalid" } });
  expect(await createRule(f, { target: { kind: "category", categoryId: category.category.id }, idempotencyKey: "foreign-category" }).catch(e => e)).toMatchObject({ data: { code: "category_not_found" } });
  expect(await planningOnly(f.t, () => f.t.query(api.budget.evaluateBudgets, { workspaceId: other.id, month: { year: 2026, month: 9 }, selection: { kind: "revision", budgetId: local.budget.id, revision: 1 } })).catch(e => e)).toMatchObject({ data: { code: "budget_not_found" } });
  expect(await planningOnly(f.t, () => f.t.mutation(api.budget.updateBudget, { workspaceId: other.id, budgetId: local.budget.id, revision: 1, change: { kind: "rename", name: "Cross scope" }, idempotencyKey: "wrong-scope" })).catch(e => e)).toMatchObject({ data: { code: "budget_not_found" } });
  const proposal = { financialAccountProfileId: profile.id, accountingDate: "2026-09-30", amount: { currency: "COP", minorUnits: 1 } };
  expect(await f.t.query(api.budget.budgetImpactWarning, { workspaceId: f.workspace.id, proposal }).catch(e => e)).toMatchObject({ data: { code: "financial_account_profile_not_found" } });
  expect(await f.t.query(api.budget.budgetImpactWarning, { workspaceId: f.workspace.id, proposal: { ...proposal, financialAccountProfileId: f.profile.id, userCategoryId: category.category.id } }).catch(e => e)).toMatchObject({ data: { code: "category_not_found" } });
  expect(await f.t.withIdentity({ ...ownerIdentity, subject: "other-owner" }).query(api.budget.listBudgets, { workspaceId: f.workspace.id }).catch(e => e)).toMatchObject({ data: { code: "owner_not_allowed" } });
  expect(await f.t.withIdentity({ ...ownerIdentity, issuer: "https://other-issuer.example" }).query(api.budget.listBudgets, { workspaceId: f.workspace.id }).catch(e => e)).toMatchObject({ data: { code: "owner_not_allowed" } });
  const forged = { workspaceId: f.workspace.id, userId: ownerIdentity.tokenIdentifier };
  await expect(f.t.query(api.budget.listBudgets, forged)).rejects.toThrow();
});

test("changed signed facts and stale commands roll back challenge consumption and all planning state", async () => {
  const f = await budgetFixture(modules);
  const created = await createRule(f);
  const c = await client(f);
  const args = { workspaceId: f.workspace.id, budgetId: created.budget.id, revision: 1,
    change: { kind: "rename" as const, name: "Original signed name" }, idempotencyKey: "signed" };
  const proof = await fixtureProof(c.t, c.key, "budget.updateBudget", args, c.device.id);
  const state = () => f.t.run(async ctx => JSON.stringify({ budgets: await ctx.db.query("budgets").collect(), versions: await ctx.db.query("budgetVersions").collect(), receipts: await ctx.db.query("budgetReceipts").collect() }));
  const initial = await state();
  expect(await planningOnly(f.t, () => c.t.mutation(api.budget.updateBudget, { ...args, change: { kind: "rename", name: "Altered payload" }, access: proof })).catch(e => e)).toMatchObject({ data: { code: "device_request_mismatch" } });
  expect(await state()).toBe(initial);
  await updateRule(f, { ...args, idempotencyKey: "different-success" });
  const before = await state();
  expect(await planningOnly(f.t, () => c.t.mutation(api.budget.updateBudget, { ...args, access: proof })).catch(e => e)).toMatchObject({ data: { code: "budget_revision_stale" } });
  expect(await state()).toBe(before);
  const challenge = await f.t.run(ctx => {
    const id = ctx.db.normalizeId("deviceChallenges", proof.challengeId); if (!id) throw new Error("Challenge expected"); return ctx.db.get(id);
  });
  expect(challenge?.consumedAt).toBeUndefined();
  expect((await f.t.query(api.budget.listBudgets, { workspaceId: f.workspace.id }))[0]?.revision).toBe(2);
});

test("local simultaneous singleton creates and same-revision edits converge without silent overwrites", async () => {
  const f = await budgetFixture(modules, true);
  const creates = await Promise.all([
    createRule(f, { name: "First", idempotencyKey: "first" }).catch(e => e),
    createRule(f, { name: "Second", idempotencyKey: "second" }).catch(e => e),
  ]);
  expect(creates.filter(r => r.budget)).toHaveLength(1);
  expect(creates.filter(r => r.data?.code === "budget_cardinality_conflict")).toHaveLength(1);
  const [budget] = await f.t.query(api.budget.listBudgets, { workspaceId: f.workspace.id }); if (!budget) throw new Error("Budget expected");
  const updates = await Promise.all([
    updateRule(f, { budgetId: budget.id, revision: 1, change: { kind: "rename", name: "A" }, idempotencyKey: "a" }).catch(e => e),
    updateRule(f, { budgetId: budget.id, revision: 1, change: { kind: "rename", name: "B" }, idempotencyKey: "b" }).catch(e => e),
  ]);
  expect(updates.filter(r => r.budget)).toHaveLength(1);
  expect(updates.filter(r => r.data?.code === "budget_revision_stale")).toHaveLength(1);
  expect((await f.t.query(api.budget.listBudgets, { workspaceId: f.workspace.id }))[0]?.revision).toBe(2);
});

for (const [sts, code] of [[undefined, "session_state_unverified"], ["pending", "session_not_active"]])
  test(`Budget warning preserves session denial and wipe directive: ${code}`, async () => {
    const f = await budgetFixture(modules);
    const proposal = { financialAccountProfileId: f.profile.id, accountingDate: "2026-09-30", amount: { currency: "COP", minorUnits: 1 } };
    expect(await planningOnly(f.t, () => f.t.withIdentity({ ...ownerIdentity, sid: "sess_budgetdenied", sts })
      .query(api.budget.budgetImpactWarning, { workspaceId: f.workspace.id, proposal })).catch(e => e))
      .toMatchObject({ data: { code, directive: "wipe-local-input-and-sign-out" } });
  });
