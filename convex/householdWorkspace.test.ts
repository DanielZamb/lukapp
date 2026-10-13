import { expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { api } from "./_generated/api";
import schema from "./schema";
import * as stores from "./store";
import {
  caught, convexAccounting, createOwnedWorkspace, ownerIdentity, septNow, octNow,
} from "../src/accounting/convexHarness";
import type { TableNames } from "./_generated/dataModel";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
const household = { functionalCurrency: "USD", idempotencyKey: "household-1", now: septNow };
const personal = { functionalCurrency: "COP", now: septNow };
const tables = [
  "workspaces", "workspaceMemberships", "personalWorkspaceOwners", "householdWorkspaceCreations",
  "ledgerAccounts", "financialAccountProfiles", "openingPositions", "journalEntries",
  "journalLines", "accountingPeriods", "periodControlDecisions",
] satisfies TableNames[];

function snapshot(t: ReturnType<typeof convexAccounting>) {
  return t.run(async (ctx) => Promise.all(tables.map((table) => ctx.db.query(table).collect())));
}

async function pair() {
  const t = convexAccounting(modules);
  const first = await createOwnedWorkspace(t);
  const second = await t.mutation(api.accounting.createHouseholdWorkspace, household);
  return { t, first, second };
}

function setup(workspaceId: string, currency: string, extra?: { name?: string; key?: string; amount?: number }) {
  return {
    workspaceId, name: extra?.name ?? "Daily", productKind: "bankAccount" as const,
    amount: { currency, minorUnits: extra?.amount ?? 1000 }, accountingDate: "2026-09-20",
    description: "Start Tracking", idempotencyKey: extra?.key ?? "opening-1",
  };
}

test("Personal bootstrap stays canonical beside explicit Household creation and backend discovery", async () => {
  const { t, first, second } = await pair();
  expect(first).toMatchObject({ kind: "Personal", functionalCurrency: "COP" });
  expect(second).toMatchObject({ kind: "Household", functionalCurrency: "USD", chartOfAccountsTemplate: "co-puc-personal@1" });
  expect(second.id).not.toBe(first.id);
  expect(await t.mutation(api.accounting.createPersonalWorkspace, personal)).toEqual(first);
  expect(await t.mutation(api.accounting.createHouseholdWorkspace, household)).toEqual(second);
  expect(await t.query(api.accounting.personalWorkspace, { now: septNow })).toEqual({ status: "ready", workspace: first });
  expect(await t.query(api.accounting.listOwnedWorkspaces, { now: septNow })).toEqual([first, second]);
  const state = await t.run(async (ctx) => ({
    memberships: await ctx.db.query("workspaceMemberships").collect(),
    links: await ctx.db.query("personalWorkspaceOwners").collect(),
    receipts: await ctx.db.query("householdWorkspaceCreations").collect(),
    accounts: await ctx.db.query("ledgerAccounts").collect(),
    periods: await ctx.db.query("accountingPeriods").collect(),
  }));
  expect(state.memberships.map((m) => [m.workspaceId, m.userId, m.role])).toEqual([
    [first.id, ownerIdentity.tokenIdentifier, "Owner"], [second.id, ownerIdentity.tokenIdentifier, "Owner"],
  ]);
  expect(state.links).toHaveLength(1);
  expect(state.links[0]?.workspaceId).toBe(first.id);
  expect(state.receipts).toHaveLength(1);
  expect(state.receipts[0]).toMatchObject({ ownerUserId: ownerIdentity.tokenIdentifier, workspaceId: second.id, idempotencyKey: "household-1" });
  expect(state.accounts).toHaveLength(6);
  expect(new Set(state.accounts.map((a) => a._id)).size).toBe(6);
  expect(state.periods.map((p) => [p.workspaceId, p.year, p.month, p.status])).toEqual([
    [first.id, 2026, 9, "open"], [second.id, 2026, 9, "open"],
  ]);
});

test("Household can be created deliberately before Personal without changing first-run discovery", async () => {
  const t = convexAccounting(modules);
  const created = await t.mutation(api.accounting.createHouseholdWorkspace, household);
  expect(await t.query(api.accounting.personalWorkspace, { now: septNow })).toEqual({ status: "provisioning-required" });
  expect(await t.query(api.accounting.listOwnedWorkspaces, { now: septNow })).toEqual([created]);
  const first = await t.mutation(api.accounting.createPersonalWorkspace, personal);
  expect(await t.query(api.accounting.listOwnedWorkspaces, { now: septNow })).toEqual([created, first]);
});

test("parallel authenticated Household retries converge and fresh keys permit multiple Households", async () => {
  const t = convexAccounting(modules);
  const calls = await Promise.all(Array.from({ length: 8 }, () => t.mutation(api.accounting.createHouseholdWorkspace, household)));
  expect(new Set(calls.map((w) => w.id)).size).toBe(1);
  expect(await t.run((ctx) => ctx.db.query("workspaces").collect())).toHaveLength(1);
  expect(await t.run((ctx) => ctx.db.query("workspaceMemberships").collect())).toHaveLength(1);
  expect(await t.run((ctx) => ctx.db.query("householdWorkspaceCreations").collect())).toHaveLength(1);
  expect(await t.run((ctx) => ctx.db.query("ledgerAccounts").collect())).toHaveLength(3);
  const next = await t.mutation(api.accounting.createHouseholdWorkspace, { ...household, idempotencyKey: "household-2" });
  expect(next.id).not.toBe(calls[0]?.id);
  expect(await t.query(api.accounting.listOwnedWorkspaces, { now: septNow })).toHaveLength(2);
});

test.each(["co-puc-personal@1", "us-gaap-personal@1"])("Household applies published template %s without changing defaults", async (template) => {
  const t = convexAccounting(modules);
  const created = await t.mutation(api.accounting.createHouseholdWorkspace, { ...household, chartOfAccountsTemplate: template });
  const accounts = await t.query(api.accounting.listLedgerAccounts, { workspaceId: created.id });
  expect(accounts.map((a) => a.code).sort()).toEqual(template === "co-puc-personal@1" ? ["313001", "42959595", "51959595"] : ["3010", "4990", "5599"]);
  expect((await t.query(api.accounting.listCatalogAccounts, { workspaceId: created.id })).length).toBeGreaterThan(3);
  expect(await t.mutation(api.accounting.createHouseholdWorkspace, { ...household, chartOfAccountsTemplate: template })).toEqual(created);
});

test("creation retries compare resolved immutable facts and do not open another current period", async () => {
  const { t, second } = await pair();
  const before = await snapshot(t);
  expect(await t.mutation(api.accounting.createHouseholdWorkspace, { ...household, chartOfAccountsTemplate: "co-puc-personal@1" })).toEqual(second);
  for (const change of [{ functionalCurrency: "COP" }, { chartOfAccountsTemplate: "us-gaap-personal@1" }]) {
    expect(await caught(t.mutation(api.accounting.createHouseholdWorkspace, { ...household, ...change }))).toMatchObject({ data: { code: "idempotency_key_conflict" } });
    expect(await snapshot(t)).toEqual(before);
  }
  const again = await t.mutation(api.accounting.createHouseholdWorkspace, { ...household, now: octNow });
  expect(again).toMatchObject({ id: second.id, currentAccountingPeriod: { year: 2026, month: 10, status: "not_opened" } });
  expect(await snapshot(t)).toEqual(before);
});

test("invalid creation facts fail without provisioning or receipts and the same key remains usable", async () => {
  const t = convexAccounting(modules);
  const before = await snapshot(t);
  for (const { change, code } of [
    { change: { functionalCurrency: "ZZZ" }, code: "functional_currency_invalid" },
    { change: { chartOfAccountsTemplate: "business@1" }, code: "chart_of_accounts_template_unknown" },
    { change: { idempotencyKey: "" }, code: "idempotency_key_required" },
    { change: { idempotencyKey: "   " }, code: "idempotency_key_required" },
    { change: { now: Number.NaN }, code: "clock_required" },
  ]) {
    expect(await caught(t.mutation(api.accounting.createHouseholdWorkspace, { ...household, ...change }))).toMatchObject({ data: { code } });
    expect(await snapshot(t)).toEqual(before);
  }
  expect(await t.mutation(api.accounting.createHouseholdWorkspace, household)).toMatchObject({ kind: "Household" });
});

test("a transaction failure after real provisioning rolls back Household, membership, chart, period, and receipt", async () => {
  const t = convexAccounting(modules);
  await createOwnedWorkspace(t);
  const before = await snapshot(t);
  const realStore = stores.convexStore;
  const fail = vi.spyOn(stores, "convexStore").mockImplementation((db) => {
    const store = realStore(db);
    return { ...store, async saveHouseholdWorkspaceCreation(input) {
      await store.saveHouseholdWorkspaceCreation(input);
      throw new Error("Injected failure after receipt write");
    } };
  });
  try {
    await expect(t.mutation(api.accounting.createHouseholdWorkspace, household)).rejects.toThrow("Injected failure after receipt write");
  } finally {
    fail.mockRestore();
  }
  expect(await snapshot(t)).toEqual(before);
  await t.mutation(api.accounting.createHouseholdWorkspace, household);
  expect(await t.query(api.accounting.listOwnedWorkspaces, { now: septNow })).toHaveLength(2);
});

test.each(["Personal", "Household"])("%s uses shared setup, opening, cash activity, transfer, reversal, projections, and period control", async (kind) => {
  const { t, first, second } = await pair();
  const workspace = kind === "Personal" ? first : second;
  const currency = workspace.functionalCurrency;
  const source = await t.mutation(api.accounting.setupFinancialAccount, setup(workspace.id, currency));
  const destination = await t.mutation(api.accounting.setupFinancialAccount, setup(workspace.id, currency, { name: "Savings", key: "zero", amount: 0 }));
  expect(source.journalEntry?.policy).toBe("opening-position@1");
  expect(destination.journalEntry).toBeNull();
  expect((await t.mutation(api.accounting.setupFinancialAccount, setup(workspace.id, currency))).replay).toBe(true);
  const cash = { workspaceId: workspace.id, financialAccountProfileId: source.profile.id,
    amount: { currency, minorUnits: 100 }, accountingDate: "2026-09-24", description: "Activity", idempotencyKey: "expense" };
  await t.mutation(api.accounting.recordCashExpense, cash);
  await t.mutation(api.accounting.recordCashIncome, { ...cash, amount: { currency, minorUnits: 300 }, idempotencyKey: "income" });
  const transfer = await t.mutation(api.accounting.recordAccountTransfer, {
    workspaceId: workspace.id, sourceFinancialAccountProfileId: source.profile.id,
    destinationFinancialAccountProfileId: destination.profile.id, amount: { currency, minorUnits: 200 },
    accountingDate: "2026-09-24", description: "Save", idempotencyKey: "transfer",
  });
  const balances = () => t.query(api.accounting.balances, { workspaceId: workspace.id });
  expect((await balances()).map((b) => b.balance)).toEqual([{ currency, minorUnits: 1000 }, { currency, minorUnits: 200 }]);
  const reversal = await t.mutation(api.accounting.reversePostedEntry, { workspaceId: workspace.id, journalEntryId: transfer.id, idempotencyKey: "reverse" });
  expect(reversal.policy).toBe("reversal@1");
  expect((await balances()).map((b) => b.balance)).toEqual([{ currency, minorUnits: 1200 }, { currency, minorUnits: 0 }]);
  const trial = await t.query(api.accounting.trialBalance, { workspaceId: workspace.id });
  expect(trial.reduce((sum, r) => sum + r.debitMinorUnits, 0)).toBe(1800);
  expect(trial.reduce((sum, r) => sum + r.creditMinorUnits, 0)).toBe(1800);
  expect(await t.query(api.accounting.listJournalEntries, { workspaceId: workspace.id })).toHaveLength(5);
  expect(await t.query(api.accounting.listFinancialAccountProfiles, { workspaceId: workspace.id })).toHaveLength(2);
  expect(await t.query(api.accounting.balances, { workspaceId: kind === "Personal" ? second.id : first.id })).toEqual([]);
  await t.mutation(api.accounting.lockAccountingPeriod, { workspaceId: workspace.id, period: { year: 2026, month: 9 } });
  const before = await snapshot(t);
  expect(await caught(t.mutation(api.accounting.recordCashExpense, { ...cash, idempotencyKey: "locked" }))).toMatchObject({ data: { code: "locked_period" } });
  expect(await snapshot(t)).toEqual(before);
});

test("creation, opening, Posting, and period namespaces remain independent across both kinds", async () => {
  const { t, first, second } = await pair();
  for (const workspace of [first, second]) {
    await t.mutation(api.accounting.setupFinancialAccount, setup(workspace.id, workspace.functionalCurrency, { key: household.idempotencyKey }));
  }
  const receipts = await t.run((ctx) => ctx.db.query("openingPositions").collect());
  expect(receipts.map((r) => [r.workspaceId, r.idempotencyKey])).toEqual([[first.id, "household-1"], [second.id, "household-1"]]);
  const entries = await t.run((ctx) => ctx.db.query("journalEntries").collect());
  expect(new Set(entries.map((e) => e._id)).size).toBe(2);
  await t.mutation(api.accounting.lockAccountingPeriod, { workspaceId: first.id, period: { year: 2026, month: 9 } });
  expect(await t.query(api.accounting.openWorkspace, { workspaceId: second.id, now: septNow })).toMatchObject({ currentAccountingPeriod: { status: "open" } });
});

test.each(["Personal", "Household"])("%s rejects a failed account setup without orphan profiles or accounts", async (kind) => {
  const { t, first, second } = await pair();
  const workspace = kind === "Personal" ? first : second;
  const before = await snapshot(t);
  expect(await caught(t.mutation(api.accounting.setupFinancialAccount, setup(workspace.id, workspace.functionalCurrency, { amount: -1 })))).toMatchObject({ data: { code: "opening_amount_invalid" } });
  expect(await snapshot(t)).toEqual(before);
});

test("cross-Workspace profile, opening, entry, and both transfer-side references are denied", async () => {
  const { t, first, second } = await pair();
  const a = await t.mutation(api.accounting.setupFinancialAccount, setup(first.id, "COP"));
  const b = await t.mutation(api.accounting.setupFinancialAccount, setup(second.id, "USD"));
  const before = await snapshot(t);
  for (const [workspace, own, foreign] of [[first, a, b], [second, b, a]] as const) {
    const args = { workspaceId: workspace.id, amount: { currency: workspace.functionalCurrency, minorUnits: 1 },
      accountingDate: "2026-09-24", description: "Invalid", idempotencyKey: "cross" };
    for (const endpoint of [api.accounting.recordCashExpense, api.accounting.recordCashIncome, api.accounting.recordOpeningPosition]) {
      expect(await caught(t.mutation(endpoint, { ...args, financialAccountProfileId: foreign.profile.id }))).toMatchObject({ data: { code: "financial_account_profile_not_found" } });
    }
    expect(await caught(t.query(api.accounting.listJournalEntries, { workspaceId: workspace.id, financialAccountProfileId: foreign.profile.id }))).toMatchObject({ data: { code: "financial_account_profile_not_found" } });
    expect(await caught(t.mutation(api.accounting.reversePostedEntry, { workspaceId: workspace.id, journalEntryId: foreign.journalEntry?.id ?? "missing", idempotencyKey: "cross" }))).toMatchObject({ data: { code: "journal_entry_not_found" } });
    for (const [source, destination] of [[foreign.profile.id, own.profile.id], [own.profile.id, foreign.profile.id]]) {
      expect(await caught(t.mutation(api.accounting.recordAccountTransfer, { ...args, sourceFinancialAccountProfileId: source ?? "missing", destinationFinancialAccountProfileId: destination ?? "missing" }))).toMatchObject({ data: { code: "financial_account_profile_not_found" } });
    }
  }
  expect(await snapshot(t)).toEqual(before);
});

test("missing membership is excluded from discovery and never repaired by creation retry or sign-in discovery", async () => {
  const { t, first, second } = await pair();
  await t.run(async (ctx) => {
    const memberships = await ctx.db.query("workspaceMemberships").collect();
    for (const membership of memberships) await ctx.db.delete(membership._id);
  });
  const before = await snapshot(t);
  expect(await t.query(api.accounting.listOwnedWorkspaces, { now: septNow })).toEqual([]);
  for (const operation of [
    t.mutation(api.accounting.createHouseholdWorkspace, household),
    t.mutation(api.accounting.createPersonalWorkspace, personal),
    t.query(api.accounting.personalWorkspace, { now: septNow }),
    ...[first, second].map((w) => t.query(api.accounting.balances, { workspaceId: w.id })),
  ]) expect(await caught(operation)).toMatchObject({ data: { code: "workspace_membership_required" } });
  expect(await snapshot(t)).toEqual(before);
});

test("Household Owner downgrade removes discovery and creation authority without granting a new membership", async () => {
  const { t, first, second } = await pair();
  await t.run(async (ctx) => {
    const membership = await ctx.db.query("workspaceMemberships").filter((q) => q.eq(q.field("workspaceId"), second.id)).unique();
    if (!membership) throw new Error("Missing fixture membership");
    await ctx.db.patch(membership._id, { role: "Viewer" });
  });
  const before = await snapshot(t);
  expect(await t.query(api.accounting.listOwnedWorkspaces, { now: septNow })).toEqual([first]);
  expect(await caught(t.mutation(api.accounting.createHouseholdWorkspace, household))).toMatchObject({ data: { code: "workspace_permission_required" } });
  expect(await caught(t.mutation(api.accounting.setupFinancialAccount, setup(second.id, "USD")))).toMatchObject({ data: { code: "workspace_permission_required" } });
  expect(await snapshot(t)).toEqual(before);
});

test("discovery skips a deleted Workspace even with an orphan Owner membership", async () => {
  const { t, first, second } = await pair();
  await t.run(async (ctx) => {
    const stored = await ctx.db.query("workspaces").filter((q) => q.eq(q.field("_id"), second.id)).unique();
    if (!stored) throw new Error("Missing fixture Workspace");
    await ctx.db.delete(stored._id);
  });
  expect(await t.query(api.accounting.listOwnedWorkspaces, { now: septNow })).toEqual([first]);
  expect(await caught(t.mutation(api.accounting.createHouseholdWorkspace, household))).toMatchObject({ data: { code: "workspace_membership_required" } });
});

test("public creation and discovery reject actor claims, missing explicit currency, and Business activation", async () => {
  const t = convexAccounting(modules);
  const before = await snapshot(t);
  for (const change of [{ actor: { userId: ownerIdentity.tokenIdentifier } }, { userId: ownerIdentity.tokenIdentifier }, { kind: "Business" }]) {
    await expect(t.mutation(api.accounting.createHouseholdWorkspace, { ...household, ...change })).rejects.toThrow();
    await expect(t.mutation(api.accounting.createPersonalWorkspace, { ...personal, ...change })).rejects.toThrow();
  }
  const forgedDiscovery = { now: septNow, userId: ownerIdentity.tokenIdentifier };
  await expect(t.query(api.accounting.listOwnedWorkspaces, forgedDiscovery)).rejects.toThrow();
  await expect(t.mutation(makeFunctionReference<"mutation", Record<string, unknown>, unknown>("accounting:createHouseholdWorkspace"), { now: septNow, idempotencyKey: "missing-currency" })).rejects.toThrow();
  await expect(t.mutation(makeFunctionReference<"mutation", Record<string, unknown>, unknown>("accounting:createPersonalWorkspace"), { now: septNow })).rejects.toThrow();
  expect(await snapshot(t)).toEqual(before);
});

test("Household creation and owned discovery enforce Clerk admission and revoked configuration", async () => {
  const { t } = await pair();
  const before = await snapshot(t);
  for (const { caller, code } of [
    { caller: convexTest(schema, modules), code: "authentication_required" },
    { caller: t.withIdentity({ ...ownerIdentity, subject: "user_other" }), code: "owner_not_allowed" },
    { caller: t.withIdentity({ ...ownerIdentity, issuer: "https://wrong.clerk.accounts.dev" }), code: "owner_not_allowed" },
  ]) {
    expect(await caught(caller.mutation(api.accounting.createHouseholdWorkspace, household))).toMatchObject({ data: { code } });
    expect(await caught(caller.query(api.accounting.listOwnedWorkspaces, { now: septNow }))).toMatchObject({ data: { code } });
  }
  vi.stubEnv("LUKAPP_OWNER_CLERK_SUBJECT", "revoked-owner");
  expect(await caught(t.mutation(api.accounting.createHouseholdWorkspace, household))).toMatchObject({ data: { code: "owner_not_allowed" } });
  expect(await caught(t.query(api.accounting.listOwnedWorkspaces, { now: septNow }))).toMatchObject({ data: { code: "owner_not_allowed" } });
  vi.stubEnv("LUKAPP_OWNER_CLERK_SUBJECT", "");
  expect(await caught(t.query(api.accounting.listOwnedWorkspaces, { now: septNow }))).toMatchObject({ data: { code: "owner_configuration_required" } });
  expect(await snapshot(t)).toEqual(before);
  vi.stubEnv("LUKAPP_OWNER_CLERK_SUBJECT", ownerIdentity.subject);
});

test("empty discovery still validates its current clock", async () => {
  const t = convexAccounting(modules);
  expect(await caught(t.query(api.accounting.listOwnedWorkspaces, { now: Number.NaN }))).toMatchObject({ data: { code: "clock_required" } });
});
