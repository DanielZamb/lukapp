import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { convexAccounting, createDaily, createOwnedWorkspace, groceries, septNow, owner, ownerIdentity } from "../src/accounting/convexHarness";
import type { AccountingTest } from "../src/accounting/convexHarness";
import type { CategoryNature } from "../src/accounting/categoryTypes";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
afterEach(() => vi.unstubAllEnvs());
function testdb() { return convexAccounting(modules); }
async function custom(t: AccountingTest, workspaceId: string, name: string, answer: CategoryNature = "Expense") {
  const result = await t.mutation(api.accounting.createUserCategory, { workspaceId, name,
    selection: { kind: "custom", answer, confirmation: "answered" }, idempotencyKey: `${answer}:${name}` });
  if (result.kind !== "category") throw new Error("Expected User Category");
  return result.category;
}

for (const template of ["co-puc-personal@1", "us-gaap-personal@1"]) for (const kind of ["Personal", "Household"]) {
  test(`${kind}/${template}: confirmed names resolve actual posting accounts, provenance and literal totals`, async () => {
    const t = testdb();
    const args = { functionalCurrency: "COP", chartOfAccountsTemplate: template, now: septNow };
    const workspace = kind === "Personal" ? await t.mutation(api.accounting.createPersonalWorkspace, args) :
      await t.mutation(api.accounting.createHouseholdWorkspace, { ...args, idempotencyKey: "home" });
    const profile = await createDaily(t, workspace.id);
    const co = template.startsWith("co-");
    const fixtures = [
      ["Café", "Expense", co ? "519560" : "5320", "restaurants"],
      ["cafe", "Expense", co ? "519560" : "5320", "restaurants"],
      [" MERCÁDOO ", "Expense", co ? "51959501" : "5310", "groceries"],
      ["restaurnte", "Expense", co ? "519560" : "5320", "restaurants"],
      ["gasolna", "Expense", co ? "519535" : "5210", "fuel"],
      ["arriendo", "Expense", co ? "512010" : "5010", "rentPaid"],
      ["arriendo", "Income", co ? "42201001" : "4210", "rentReceived"],
    ] satisfies Array<[string, CategoryNature, string, string]>;
    for (const [name, nature, code, concept] of fixtures) {
      const category = await custom(t, workspace.id, name, nature);
      expect(category.classification).toEqual({ kind: "resolved", nature, natureProvenance: { kind: "answered" },
        account: { kind: "lexicon", concept, policy: "category-es-en@1", accountCode: code } });
      const input = { ...groceries(workspace.id, profile.id, { amount: 100, idempotencyKey: category.id }), userCategoryId: category.id };
      const posted = await t.mutation(nature === "Expense" ? api.accounting.recordCashExpense : api.accounting.recordCashIncome, input);
      const line = posted.lines.find(l => l.category);
      expect(line).toMatchObject({ code, category: { categoryId: category.id, revision: 1, name: name.trim(), nature,
        natureProvenance: { kind: "answered" }, account: { kind: "lexicon", policy: "category-es-en@1", accountCode: code } } });
    }
    const totals = await t.query(api.accounting.categoryTotals, { workspaceId: workspace.id });
    expect(totals.reduce((n, row) => n + row.expense.minorUnits, 0)).toBe(600);
    expect(totals.reduce((n, row) => n + row.income.minorUnits, 0)).toBe(100);
    expect((await t.query(api.accounting.balances, { workspaceId: workspace.id }))[0]?.balance.minorUnits).toBe(-500);
    expect((await t.query(api.accounting.trialBalance, { workspaceId: workspace.id })).reduce((n, r) => n + r.debitMinorUnits - r.creditMinorUnits, 0)).toBe(0);
  });
}

test("suggestions require confirmation; ambiguous and unknown names resolve to Otros and post", async () => {
  const t = testdb(); const workspace = await createOwnedWorkspace(t); const daily = await createDaily(t, workspace.id);
  expect(await t.query(api.accounting.suggestCategoryNature, { workspaceId: workspace.id, name: "Arriéndo" })).toEqual({ policy: "category-es-en@1", suggestions: ["Expense", "Income"], requiresConfirmation: true });
  for (const [name, answer] of [["ahorro", "stillMine"], ["inversión", "stillMine"], ["pago tarjeta", "payingDebt"], ["Préstamo a Juan", "stillMine"], ["debt to Mom", "payingDebt"]] satisfies Array<[string, "stillMine" | "payingDebt"]>) {
    expect(await t.query(api.accounting.suggestCategoryNature, { workspaceId: workspace.id, name })).toMatchObject({ suggestions: [answer] });
    expect(await t.mutation(api.accounting.createUserCategory, { workspaceId: workspace.id, name, selection: { kind: "custom", answer, confirmation: "lexiconConfirmed" }, idempotencyKey: name })).toEqual({ kind: "profileRequired", answer });
  }
  expect(await t.query(api.accounting.listUserCategories, { workspaceId: workspace.id })).toEqual([]);
  for (const name of ["seguro", "mi hobby raro", "caf"]) {
    const category = await custom(t, workspace.id, name);
    expect(category.classification).toEqual({ kind: "resolved", nature: "Expense", natureProvenance: { kind: "answered" },
      account: { kind: "fallback", accountCode: "51959595", policy: "category-es-en@1", candidates: name === "seguro" ? ["lifeInsurance", "vehicleInsurance"] : [] } });
    expect((await t.mutation(api.accounting.recordCashExpense, { ...groceries(workspace.id, daily.id, { amount: 50, idempotencyKey: name }), userCategoryId: category.id })).lines[0]?.debitMinorUnits).toBe(50);
  }
  const unknownIncome = await custom(t, workspace.id, "unlisted cash income", "Income");
  expect(unknownIncome.classification).toMatchObject({ kind: "resolved", nature: "Income", account: { kind: "fallback", accountCode: "42959595", candidates: [] } });
  expect((await t.mutation(api.accounting.recordCashIncome, { ...groceries(workspace.id, daily.id, { amount: 75, idempotencyKey: "income-fallback" }), userCategoryId: unknownIncome.id })).lines[1]).toMatchObject({ code: "42959595", creditMinorUnits: 75 });
  expect(await t.mutation(api.accounting.createUserCategory, { workspaceId: workspace.id, name: "unknown", selection: { kind: "custom", answer: "Income", confirmation: "lexiconConfirmed" }, idempotencyKey: "bad-confirm" }).catch(e => e)).toMatchObject({ data: { code: "category_suggestion_invalid" } });
});

test("presets, advanced overrides, future defaults, rename, archive and merge preserve stable Posted history and retries", async () => {
  const t = testdb(); const workspace = await createOwnedWorkspace(t); const daily = await createDaily(t, workspace.id);
  const input = { workspaceId: workspace.id, name: "Comida", selection: { kind: "preset" as const, concept: "groceries" }, idempotencyKey: "preset" };
  const created = await t.mutation(api.accounting.createUserCategory, input);
  if (created.kind !== "category") throw new Error("Expected category");
  const category = created.category;
  expect((await t.mutation(api.accounting.createUserCategory, input))).toEqual({ ...created, replay: true });
  const expenseInput = { ...groceries(workspace.id, daily.id, { amount: 200 }), userCategoryId: category.id, categoryRevision: 1, ledgerAccountCode: "519560" };
  const old = await t.mutation(api.accounting.recordCashExpense, expenseInput);
  expect(old.lines[0]?.category).toEqual({ categoryId: category.id, revision: 1, name: "Comida", nature: "Expense", natureProvenance: { kind: "preset", concept: "groceries" }, account: { kind: "advanced", accountCode: "519560" } });
  expect(await t.mutation(api.accounting.recordCashExpense, { ...expenseInput, idempotencyKey: "bad-override", ledgerAccountCode: "421005" }).catch(e => e)).toMatchObject({ data: { code: "cash_expense_account_invalid" } });
  const rename = { workspaceId: workspace.id, categoryId: category.id, revision: 1, confirmed: true as const, change: { kind: "rename" as const, name: "Comida nueva" }, idempotencyKey: "rename" };
  await t.mutation(api.accounting.changeUserCategory, rename);
  expect((await t.mutation(api.accounting.changeUserCategory, rename)).replay).toBe(true);
  await t.mutation(api.accounting.changeUserCategory, { ...rename, revision: 2, change: { kind: "defaultAccount", accountCode: "512010" }, idempotencyKey: "default" });
  const next = await t.mutation(api.accounting.recordCashExpense, { ...expenseInput, ledgerAccountCode: undefined, categoryRevision: 3, idempotencyKey: "next" });
  expect(next.lines[0]).toMatchObject({ code: "512010", category: { name: "Comida nueva", revision: 3, account: { kind: "advanced", accountCode: "512010" } } });
  const target = await custom(t, workspace.id, "mercado");
  await t.mutation(api.accounting.changeUserCategory, { ...rename, revision: 3, change: { kind: "merge", targetCategoryId: target.id }, idempotencyKey: "merge" });
  expect(await t.mutation(api.accounting.recordCashExpense, { ...expenseInput, idempotencyKey: "archived" }).catch(e => e)).toMatchObject({ data: { code: "category_inactive" } });
  expect(await t.mutation(api.accounting.recordCashExpense, expenseInput)).toEqual({ ...old, replay: true });
  const entries = await t.query(api.accounting.listJournalEntries, { workspaceId: workspace.id });
  expect(entries.find(e => e.id === old.id)).toEqual(old);
  expect((await t.query(api.accounting.categoryTotals, { workspaceId: workspace.id }))).toEqual([{ categoryId: category.id, year: 2026, month: 9, expense: { currency: "COP", minorUnits: 400 }, income: { currency: "COP", minorUnits: 0 } }]);
});

test("unresolved legacy category, nature mismatch, stale revision and foreign Workspace are rejected by public handlers", async () => {
  const t = testdb(); const workspace = await createOwnedWorkspace(t); const daily = await createDaily(t, workspace.id);
  const unresolved = await t.run(ctx => ctx.db.insert("userCategories", { workspaceId: workspace.id, name: "GAS legacy", revision: 1, status: "active", classification: { kind: "unresolved" } }));
  const base = groceries(workspace.id, daily.id);
  expect(await t.mutation(api.accounting.recordCashExpense, { ...base, userCategoryId: unresolved }).catch(e => e)).toMatchObject({ data: { code: "category_unresolved" } });
  const income = await custom(t, workspace.id, "salario", "Income");
  expect(await t.mutation(api.accounting.recordCashExpense, { ...base, userCategoryId: income.id }).catch(e => e)).toMatchObject({ data: { code: "category_nature_mismatch" } });
  expect(await t.mutation(api.accounting.recordCashIncome, { ...base, userCategoryId: income.id, categoryRevision: 2 }).catch(e => e)).toMatchObject({ data: { code: "category_revision_stale" } });
  const household = await t.mutation(api.accounting.createHouseholdWorkspace, { functionalCurrency: "COP", now: septNow, idempotencyKey: "house" });
  const foreign = await custom(t, household.id, "cafe");
  expect(await t.mutation(api.accounting.recordCashExpense, { ...base, userCategoryId: foreign.id }).catch(e => e)).toMatchObject({ data: { code: "category_not_found" } });
  expect(await t.query(api.accounting.listJournalEntries, { workspaceId: workspace.id })).toEqual([]);
});

test("category reads and writes recheck current Workspace authority and device revocation", async () => {
  const t = testdb(); const workspace = await createOwnedWorkspace(t); const cat = await custom(t, workspace.id, "cafe");
  await t.run(async ctx => { const membershipWorkspaceId = ctx.db.normalizeId("workspaces", workspace.id); if (!membershipWorkspaceId) throw new Error("Workspace missing"); const member = await ctx.db.query("workspaceMemberships").withIndex("by_workspace_user", q => q.eq("workspaceId", membershipWorkspaceId).eq("userId", owner.userId)).unique(); if (!member) throw new Error("Membership missing"); await ctx.db.patch(member._id, { role: "Viewer" }); });
  expect(await t.mutation(api.accounting.changeUserCategory, { workspaceId: workspace.id, categoryId: cat.id, revision: 1, change: { kind: "archive" }, confirmed: true, idempotencyKey: "no-permission" }).catch(e => e)).toMatchObject({ data: { code: "workspace_permission_required" } });
  expect((await t.query(api.accounting.listUserCategories, { workspaceId: workspace.id }))).toHaveLength(1);
  await t.run(async ctx => { const device = await ctx.db.query("mobileDevices").withIndex("by_identity", q => q.eq("tokenIdentifier", ownerIdentity.tokenIdentifier)).unique(); if (!device) throw new Error("Device missing"); await ctx.db.patch(device._id, { state: { kind: "revoked", at: Date.now(), reason: "owner" } }); });
  expect(await t.query(api.accounting.listUserCategories, { workspaceId: workspace.id }).catch(e => e)).toMatchObject({ data: { code: "device_revoked" } });
});

test("category retries preserve whether an advanced account and revision were submitted", async () => {
  const t = testdb(); const w = await createOwnedWorkspace(t); const daily = await createDaily(t, w.id); const cat = await custom(t, w.id, "mercado");
  const input = { ...groceries(w.id, daily.id, { amount: 100, idempotencyKey: "override" }), userCategoryId: cat.id, ledgerAccountCode: "512010" };
  const original = await t.mutation(api.accounting.recordCashExpense, input);
  expect(await t.mutation(api.accounting.recordCashExpense, { ...input, ledgerAccountCode: undefined }).catch(e => e)).toMatchObject({ data: { code: "idempotency_key_conflict" } });
  expect(await t.mutation(api.accounting.recordCashExpense, input)).toEqual({ ...original, replay: true });
  const defaultInput = { ...input, ledgerAccountCode: undefined, idempotencyKey: "default" };
  await t.mutation(api.accounting.recordCashExpense, defaultInput);
  expect(await t.mutation(api.accounting.recordCashExpense, { ...defaultInput, ledgerAccountCode: "51959501" }).catch(e => e)).toMatchObject({ data: { code: "idempotency_key_conflict" } });
  expect(await t.mutation(api.accounting.recordCashExpense, { ...defaultInput, categoryRevision: 1 }).catch(e => e)).toMatchObject({ data: { code: "idempotency_key_conflict" } });
});

test("a committed category key cannot be reused to return a profile route", async () => {
  const t = testdb(); const w = await createOwnedWorkspace(t);
  const args = { workspaceId: w.id, name: "mine", selection: { kind: "custom" as const, answer: "Expense" as const, confirmation: "answered" as const }, idempotencyKey: "same" };
  const created = await t.mutation(api.accounting.createUserCategory, args);
  for (const answer of ["stillMine", "payingDebt"] as const) for (const confirmation of ["answered", "lexiconConfirmed"] as const) {
    expect(await t.mutation(api.accounting.createUserCategory, { ...args, selection: { ...args.selection, answer, confirmation } }).catch(e => e)).toMatchObject({ data: { code: "idempotency_key_conflict" } });
  }
  expect(await t.mutation(api.accounting.createUserCategory, args)).toEqual({ ...created, replay: true });
  expect((await t.query(api.accounting.listUserCategories, { workspaceId: w.id }))).toHaveLength(1);
});
