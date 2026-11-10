import { expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { accountingFixture, createProfile, provisionWorkspace, reverse, lock, type AccountingTest } from "../src/accounting/convexHarness";
import type { Infer } from "convex/values";
import type { closingLine } from "./accountingPlaceValues";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
const money = (minorUnits: number, currency = "COP") => ({ currency, minorUnits });
async function setup(template = "co-puc-personal@1", productKind: "cash" | "creditCard" = "cash", amount = 0) {
  const fixture = await accountingFixture(modules);
  const { t } = fixture;
  const workspace = await provisionWorkspace(t, { functionalCurrency: "COP", chartOfAccountsTemplate: template });
  const place = await createProfile(t, workspace.id, "Ending", productKind);
  const other = await createProfile(t, workspace.id, "Open", "bankAccount");
  const opening = await t.action(api.accounting.recordOpeningPosition, {
    workspaceId: workspace.id, financialAccountProfileId: place.id, amount: money(amount),
    accountingDate: "2026-09-24", description: "Starting amount", idempotencyKey: "opening",
  });
  const args = { workspaceId: workspace.id, financialAccountProfileId: place.id, idempotencyKey: "close", lines: [] as Infer<typeof closingLine>[] };
  return { ...fixture, workspace, place, other, opening, args };
}
async function snapshot(t: AccountingTest) {
  return t.run(async ctx => ({
    entries: await ctx.db.query("journalEntries").collect(), lines: await ctx.db.query("journalLines").collect(),
    endings: await ctx.db.query("placeEndings").collect(), categories: await ctx.db.query("userCategories").collect(),
    totals: await ctx.db.query("ledgerAccountTotals").collect(), accounts: await ctx.db.query("ledgerAccounts").collect(),
    settings: await ctx.db.query("workspaceSettingChanges").collect(), workspaces: await ctx.db.query("workspaces").collect(),
  }));
}
async function expectBalanced(t: AccountingTest, workspaceId: string, placeId: string) {
  const entries = await t.query(api.accounting.listJournalEntries, { workspaceId });
  for (const entry of entries) {
    expect(entry.lines.reduce((sum, line) => sum + line.debitMinorUnits, 0)).toBe(entry.amount.minorUnits);
    expect(entry.lines.reduce((sum, line) => sum + line.creditMinorUnits, 0)).toBe(entry.amount.minorUnits);
  }
  expect((await t.query(api.accounting.balances, { workspaceId })).find(row => row.financialAccountProfileId === placeId)?.balance).toEqual(money(0));
}

test("zero balance closes with an appended fact, disappears from choices, keeps identity and replays without writes", async () => {
  const s = await setup();
  expect(await s.t.query(api.accounting.placeClosure, { workspaceId: s.workspace.id, financialAccountProfileId: s.place.id })).toMatchObject({
    status: "open", canClose: true, blockers: [], isDefault: false, openPlaceCount: 2, balance: money(0), nature: "Asset", accountingDate: "2026-09-24",
  });
  const receipt = await s.t.action(api.accounting.closePlace, s.args);
  expect(receipt).toMatchObject({ replay: false, ending: { act: "close", endedBy: "owner-1", occurredAt: Date.now(), recordedAt: Date.now(), entries: [], financialAccountProfileId: s.place.id } });
  const after = await snapshot(s.t);
  vi.setSystemTime(Date.UTC(2026, 9, 20, 12));
  expect(await s.t.action(api.accounting.closePlace, s.args)).toEqual({ ...receipt, replay: true });
  expect(await snapshot(s.t)).toEqual(after);
  expect(await s.t.query(api.accounting.listFinancialAccountProfiles, { workspaceId: s.workspace.id })).toEqual([s.other]);
  expect(await s.t.query(api.accounting.listFinancialAccountProfiles, { workspaceId: s.workspace.id, status: "closed" })).toEqual([{ ...s.place, status: "closed" }]);
  expect((await s.t.query(api.accounting.postedActivity, { workspaceId: s.workspace.id, month: "2026-09" })).accounts.map(p => p.financialAccountProfileId)).toEqual([s.other.id]);
  expect((await s.t.query(api.accounting.postedActivity, { workspaceId: s.workspace.id, month: "2026-09", status: "closed" })).accounts.map(p => p.financialAccountProfileId)).toEqual([s.place.id]);
  await expect(s.t.action(api.accounting.closePlace, { ...s.args, idempotencyKey: "again" })).rejects.toThrow("financial_account_profile_ended");
  await expect(s.t.action(api.accounting.closePlace, { ...s.args, replacementDefaultFinancialAccountProfileId: s.other.id })).rejects.toThrow("idempotency_key_conflict");
  await expectBalanced(s.t, s.workspace.id, s.place.id);
});

test.each(["co-puc-personal@1", "us-gaap-personal@1"])("%s settles several lines as ordinary entries on today's workspace date", async template => {
  const s = await setup(template, "cash", 1000);
  const category = await s.t.action(api.accounting.createUserCategory, { workspaceId: s.workspace.id,
    selection: { kind: "preset", presetId: "groceries", style: { emoji: "F", tone: "primary" } } });
  if (category.kind !== "category") throw new Error("Missing category");
  vi.setSystemTime(new Date("2026-09-25T00:30:00Z"));
  const args = { ...s.args, lines: [
    { kind: "transfer", otherFinancialAccountProfileId: s.other.id, amount: money(600) },
    { kind: "expense", userCategoryId: category.category.id, amount: money(300) },
    { kind: "adjustment", amount: money(100) },
  ] satisfies Infer<typeof closingLine>[] };
  const before = await snapshot(s.t);
  await expect(s.t.action(api.accounting.closePlace, { ...args, lines: args.lines.slice(0, 2) })).rejects.toThrow("place_close_balance_mismatch");
  expect(await snapshot(s.t)).toEqual(before);
  const receipt = await s.t.action(api.accounting.closePlace, args);
  expect(receipt.ending.entries.map(e => [e.policy, e.accountingDate, e.amount.minorUnits])).toEqual([
    ["account-transfer@1", "2026-09-24", 600], ["cash-expense@1", "2026-09-24", 300], ["cash-expense@1", "2026-09-24", 100],
  ]);
  const adjustment = receipt.ending.entries[2];
  expect(adjustment?.lines[0]).toMatchObject({ code: template === "co-puc-personal@1" ? "53959501" : "6170", debitMinorUnits: 100, creditMinorUnits: 0,
    userCategoryName: "Closing Adjustment (expense)" });
  expect((await s.t.query(api.accounting.balances, { workspaceId: s.workspace.id })).find(r => r.financialAccountProfileId === s.other.id)?.balance).toEqual(money(600));
  const state = await snapshot(s.t);
  expect(await s.t.action(api.accounting.closePlace, args)).toEqual({ ...receipt, replay: true });
  expect(await snapshot(s.t)).toEqual(state);
  await expect(s.t.action(api.accounting.closePlace, { ...args, lines: [...args.lines].reverse() })).rejects.toThrow("idempotency_key_conflict");
  await expect(s.t.action(api.accounting.closePlace, { ...args, lines: [{ kind: "adjustment", amount: money(1000) }] })).rejects.toThrow("idempotency_key_conflict");
  const history = await s.t.query(api.accounting.listJournalEntries, { workspaceId: s.workspace.id });
  expect(history.find(e => e.id === s.opening?.id)?.financialAccountProfileName).toBe("Ending");
  expect(await s.t.query(api.accounting.postedEntry, { workspaceId: s.workspace.id, journalEntryId: receipt.ending.entries[0]!.id, financialAccountProfileId: s.place.id })).toMatchObject({ row: { transfer: { from: { id: s.place.id, name: "Ending" }, to: { id: s.other.id, name: "Open" } } } });
  await expectBalanced(s.t, s.workspace.id, s.place.id);
});

test.each(["co-puc-personal@1", "us-gaap-personal@1"])("%s forgives a debt with income, or pays it through an ordinary transfer", async template => {
  for (const kind of ["transfer", "adjustment"] as const) {
    const s = await setup(template, "creditCard", 1000);
    const line = kind === "transfer" ? { kind, otherFinancialAccountProfileId: s.other.id, amount: money(1000) } : { kind, amount: money(1000) };
    const receipt = await s.t.action(api.accounting.closePlace, { ...s.args, lines: [line] });
    expect(receipt.ending.entries[0]).toMatchObject({ policy: kind === "transfer" ? "account-transfer@1" : "cash-income@1", amount: money(1000),
      lines: [{ ledgerAccountId: s.place.ledgerAccountId, debitMinorUnits: 1000, creditMinorUnits: 0 },
        { debitMinorUnits: 0, creditMinorUnits: 1000 }] });
    if (kind === "adjustment") expect(receipt.ending.entries[0]?.lines[1]).toMatchObject({ code: template === "co-puc-personal@1" ? "42959503" : "4970", userCategoryName: "Closing Adjustment (income)" });
    await expectBalanced(s.t, s.workspace.id, s.place.id);
  }
});

test.each([
  { productKind: "cash", policy: "cash-expense@1", closingPolicy: "cash-income@1", otherBalance: -100 },
  { productKind: "creditCard", policy: "cash-income@1", closingPolicy: "cash-expense@1", otherBalance: 100 },
] as const)("$productKind handles a negative normal-side balance without inverting the journal", async ({ productKind, policy, closingPolicy, otherBalance }) => {
  for (const kind of ["transfer", "adjustment"] as const) {
    const s = await setup("co-puc-personal@1", productKind);
    const post = policy === "cash-expense@1" ? api.accounting.recordCashExpense : api.accounting.recordCashIncome;
    await s.t.action(post, { workspaceId: s.workspace.id, financialAccountProfileId: s.place.id, amount: money(100), accountingDate: "2026-09-24", description: "Negative balance", idempotencyKey: "negative" });
    const before = await snapshot(s.t);
    await expect(s.t.action(api.accounting.closePlace, { ...s.args, lines: [{ kind: "expense", userCategoryId: "irrelevant", amount: money(100) }] })).rejects.toThrow("place_close_line_invalid");
    expect(await snapshot(s.t)).toEqual(before);
    const line = kind === "transfer" ? { kind, otherFinancialAccountProfileId: s.other.id, amount: money(100) } : { kind, amount: money(100) };
    const receipt = await s.t.action(api.accounting.closePlace, { ...s.args, lines: [line] });
    expect(receipt.ending.entries[0]?.policy).toBe(kind === "transfer" ? "account-transfer@1" : closingPolicy);
    if (kind === "transfer") expect((await s.t.query(api.accounting.balances, { workspaceId: s.workspace.id })).find(r => r.financialAccountProfileId === s.other.id)?.balance).toEqual(money(otherBalance));
    await expectBalanced(s.t, s.workspace.id, s.place.id);
  }
});

test("a single transfer settles a positive asset", async () => {
  const s = await setup("co-puc-personal@1", "cash", 100);
  const receipt = await s.t.action(api.accounting.closePlace, { ...s.args, lines: [{ kind: "transfer", otherFinancialAccountProfileId: s.other.id, amount: money(100) }] });
  expect(receipt.ending.entries[0]?.lines.map(line => [line.ledgerAccountId, line.debitMinorUnits, line.creditMinorUnits])).toEqual([[s.other.ledgerAccountId, 100, 0], [s.place.ledgerAccountId, 0, 100]]);
  await expectBalanced(s.t, s.workspace.id, s.place.id);
});

test("the last open Place cannot close, including after another Place ended", async () => {
  const s = await setup();
  await s.t.action(api.accounting.closePlace, s.args);
  const args = { ...s.args, financialAccountProfileId: s.other.id, idempotencyKey: "last" };
  expect(await s.t.query(api.accounting.placeClosure, { workspaceId: s.workspace.id, financialAccountProfileId: s.other.id })).toMatchObject({ canClose: false, blockers: [{ code: "place_last_open" }] });
  const before = await snapshot(s.t);
  await expect(s.t.action(api.accounting.closePlace, args)).rejects.toThrow("place_last_open");
  expect(await snapshot(s.t)).toEqual(before);
});

test("closing the Default Place requires and atomically changes its replacement", async () => {
  const { t } = await accountingFixture(modules);
  const original = await t.action(api.accounting.ensurePersonalDefaults, { functionalCurrency: "COP", startingMinorUnits: 100, timeZone: "America/Bogota" });
  const { workspace, financialAccountProfile: place } = original;
  const second = await createProfile(t, workspace.id, "Second", "cash");
  const third = await createProfile(t, workspace.id, "Third", "cash");
  await t.action(api.accounting.closePlace, { workspaceId: workspace.id, financialAccountProfileId: third.id, idempotencyKey: "third", lines: [] });
  const args = { workspaceId: workspace.id, financialAccountProfileId: place.id, idempotencyKey: "default-close", lines: [{ kind: "adjustment", amount: money(100) }] as Infer<typeof closingLine>[] };
  expect(await t.query(api.accounting.placeClosure, { workspaceId: workspace.id, financialAccountProfileId: place.id })).toMatchObject({ canClose: true, isDefault: true, requiresReplacementDefault: true });
  const before = await snapshot(t);
  await expect(t.action(api.accounting.closePlace, args)).rejects.toThrow("place_default_replacement_required");
  await expect(t.action(api.accounting.closePlace, { ...args, replacementDefaultFinancialAccountProfileId: third.id })).rejects.toThrow("financial_account_profile_ended");
  await expect(t.action(api.accounting.closePlace, { ...args, replacementDefaultFinancialAccountProfileId: place.id })).rejects.toThrow("place_default_replacement_invalid");
  expect(await snapshot(t)).toEqual(before);
  const payload = { ...args, replacementDefaultFinancialAccountProfileId: second.id };
  const receipt = await t.action(api.accounting.closePlace, payload);
  expect((await t.query(api.accounting.personalDefaults, {}))?.financialAccountProfile.id).toBe(second.id);
  expect(await t.query(api.accounting.workspaceSettings, { workspaceId: workspace.id })).toMatchObject({ defaultFinancialAccountProfileId: second.id });
  expect((await t.query(api.accounting.workspaceSettingHistory, { workspaceId: workspace.id }))[0]).toMatchObject({ setting: "defaultPlace", previousValue: place.id, value: second.id, changed: true });
  expect(await t.action(api.accounting.closePlace, payload)).toEqual({ ...receipt, replay: true });
  await expect(t.action(api.accounting.closePlace, { ...payload, replacementDefaultFinancialAccountProfileId: third.id })).rejects.toThrow("idempotency_key_conflict");
  await expect(t.action(api.accounting.changeDefaultPlace, { workspaceId: workspace.id, financialAccountProfileId: place.id, expectedFinancialAccountProfileId: second.id, idempotencyKey: "ended-default" })).rejects.toThrow("financial_account_profile_ended");
  expect(await t.action(api.accounting.ensurePersonalDefaults, { functionalCurrency: "COP", startingMinorUnits: 100, timeZone: "America/Bogota" })).toEqual(original);
});

test("locked current period and a later line failure roll back every write", async () => {
  const s = await setup("co-puc-personal@1", "cash", 100);
  const args = { ...s.args, lines: [{ kind: "adjustment", amount: money(100) }] as Infer<typeof closingLine>[] };
  await lock(s.t, s.workspace.id, { year: 2026, month: 9 });
  const before = await snapshot(s.t);
  await expect(s.t.action(api.accounting.closePlace, args)).rejects.toThrow("locked_period");
  expect(await snapshot(s.t)).toEqual(before);
  vi.setSystemTime(Date.UTC(2026, 9, 2, 12));
  await expect(s.t.action(api.accounting.closePlace, { ...args, lines: [
    { kind: "transfer", otherFinancialAccountProfileId: s.other.id, amount: money(50) },
    { kind: "expense", userCategoryId: "missing", amount: money(50) },
  ] })).rejects.toThrow("category_not_found");
  expect(await snapshot(s.t)).toEqual(before);
  const receipt = await s.t.action(api.accounting.closePlace, args);
  expect(receipt.ending.entries[0]?.accountingDate).toBe("2026-10-02");
  await lock(s.t, s.workspace.id, { year: 2026, month: 10 });
  expect(await s.t.action(api.accounting.closePlace, args)).toEqual({ ...receipt, replay: true });
});

test("all activity and metadata commands reject an ended Place while pre-close receipts still replay", async () => {
  const s = await setup();
  const expenseArgs = { workspaceId: s.workspace.id, financialAccountProfileId: s.place.id,
    amount: money(50), accountingDate: "2026-09-24", description: "Before", idempotencyKey: "before" };
  const expense = await s.t.action(api.accounting.recordCashExpense, expenseArgs);
  const reversal = await reverse(s.t, s.workspace.id, expense.id);
  const transferArgs = { workspaceId: s.workspace.id, sourceFinancialAccountProfileId: s.other.id,
    destinationFinancialAccountProfileId: s.place.id, amount: money(100), accountingDate: "2026-09-24", description: "Transfer before", idempotencyKey: "transfer-before" };
  const transfer = await s.t.action(api.accounting.recordAccountTransfer, transferArgs);
  const receipt = await s.t.action(api.accounting.closePlace, { ...s.args, lines: [{ kind: "adjustment", amount: money(100) }] });
  const before = await snapshot(s.t);
  const common = { ...expenseArgs, idempotencyKey: "new" };
  const ended = { data: { code: "financial_account_profile_ended" } };
  await expect(s.t.action(api.accounting.recordCashExpense, common)).rejects.toMatchObject(ended);
  await expect(s.t.action(api.accounting.recordCashIncome, common)).rejects.toMatchObject(ended);
  await expect(s.t.action(api.accounting.recordAccountTransfer, { ...transferArgs, idempotencyKey: "new-transfer" })).rejects.toMatchObject(ended);
  await expect(s.t.action(api.accounting.recordAccountTransfer, { ...transferArgs, sourceFinancialAccountProfileId: s.place.id, destinationFinancialAccountProfileId: s.other.id, idempotencyKey: "new-transfer" })).rejects.toMatchObject(ended);
  for (const amount of [0, 50]) await expect(s.t.action(api.accounting.recordOpeningPosition, { ...common, amount: money(amount) })).rejects.toMatchObject(ended);
  await expect(s.t.action(api.accounting.renameAccount, { workspaceId: s.workspace.id, financialAccountProfileId: s.place.id, name: s.place.name, expectedName: s.place.name })).rejects.toMatchObject(ended);
  await expect(s.t.action(api.accounting.changeAccountLook, { workspaceId: s.workspace.id, financialAccountProfileId: s.place.id, emoji: "X" })).rejects.toMatchObject(ended);
  await expect(reverse(s.t, s.workspace.id, transfer.id)).rejects.toMatchObject(ended);
  await expect(reverse(s.t, s.workspace.id, receipt.ending.entries[0]!.id)).rejects.toMatchObject(ended);
  await expect(s.t.action(api.accounting.recordCashIncome, { ...common, accountingDate: "2026-09-01" })).rejects.toMatchObject(ended);
  expect(await reverse(s.t, s.workspace.id, expense.id)).toEqual({ ...reversal, replay: true });
  expect(await s.t.action(api.accounting.recordCashExpense, expenseArgs)).toMatchObject({ id: expense.id, replay: true });
  expect(await s.t.action(api.accounting.recordAccountTransfer, transferArgs)).toMatchObject({ id: transfer.id, replay: true });
  expect(await snapshot(s.t)).toEqual(before);
  const newPlace = await createProfile(s.t, s.workspace.id, " Ending ", "cash");
  expect(newPlace.id).not.toBe(s.place.id);
  await s.t.action(api.accounting.renameAccount, { workspaceId: s.workspace.id, financialAccountProfileId: newPlace.id, name: "New", expectedName: "Ending" });
  expect(await s.t.action(api.accounting.renameAccount, { workspaceId: s.workspace.id, financialAccountProfileId: s.other.id, name: "Ending", expectedName: "Open" })).toMatchObject({ name: "Ending", status: "open" });
  expect((await s.t.query(api.accounting.listFinancialAccountProfiles, { workspaceId: s.workspace.id, status: "all" })).find(p => p.id === s.place.id)).toMatchObject({ name: "Ending", status: "closed" });
  expect(await s.t.query(api.accounting.postedHistory, { workspaceId: s.workspace.id, financialAccountProfileId: s.place.id, paginationOpts: { cursor: null, numItems: 50 } })).toMatchObject({ page: expect.arrayContaining([expect.objectContaining({ id: transfer.id, transfer: { from: { id: s.other.id, name: "Ending" }, to: { id: s.place.id, name: "Ending" } } })]) });
});

test("setup replays retain the ended profile rather than recreating or reopening it", async () => {
  const s = await setup();
  const args = { workspaceId: s.workspace.id, name: "Setup", productKind: "cash" as const, amount: money(0), accountingDate: "2026-09-24", idempotencyKey: "setup" };
  const original = await s.t.action(api.accounting.setupFinancialAccountProfile, args);
  await s.t.action(api.accounting.closePlace, { ...s.args, financialAccountProfileId: original.financialAccountProfile.id });
  expect(await s.t.action(api.accounting.setupFinancialAccountProfile, args)).toMatchObject({ replay: true, financialAccountProfile: { id: original.financialAccountProfile.id, status: "closed" } });
  expect((await s.t.query(api.accounting.listFinancialAccountProfiles, { workspaceId: s.workspace.id })).map(p => p.id)).toEqual([s.place.id, s.other.id]);
});

test.each([false, true])("Recovery destination blocks closing, including suspended=%s plans", async suspended => {
  const s = await setup();
  const expense = await s.t.action(api.accounting.recordCashExpense, { workspaceId: s.workspace.id, financialAccountProfileId: s.other.id, amount: money(100), accountingDate: "2026-09-24", description: "Laptop repair", idempotencyKey: "repair" });
  const plan = await s.t.action(api.savingsRecovery.activatePlan, { workspaceId: s.workspace.id, sourceJournalEntryId: expense.id, destinationFinancialAccountProfileId: s.place.id, installmentCount: 6, installmentMinorUnits: 20, idempotencyKey: "plan" });
  if (suspended) await reverse(s.t, s.workspace.id, expense.id);
  expect(await s.t.query(api.accounting.placeClosure, { workspaceId: s.workspace.id, financialAccountProfileId: s.place.id })).toMatchObject({ canClose: false, blockers: [{ code: "place_recovery_destination", plans: [{ id: plan.plan.id, title: "Laptop repair" }] }] });
  const before = await snapshot(s.t);
  await expect(s.t.action(api.accounting.closePlace, s.args)).rejects.toThrow("place_recovery_destination");
  expect(await snapshot(s.t)).toEqual(before);
  await s.t.action(api.savingsRecovery.cancelPlan, { workspaceId: s.workspace.id, planId: plan.plan.id, idempotencyKey: "cancel" });
  expect((await s.t.action(api.accounting.closePlace, s.args)).ending.act).toBe("close");
});

test("Recovery rejects ended destinations and contribution sources and still returns saved contribution receipts", async () => {
  const s = await setup();
  const savings = await createProfile(s.t, s.workspace.id, "Savings", "savingsAccount");
  const expense = await s.t.action(api.accounting.recordCashExpense, { workspaceId: s.workspace.id, financialAccountProfileId: s.other.id, amount: money(100), accountingDate: "2026-09-24", description: "Recover", idempotencyKey: "expense" });
  const activation = { workspaceId: s.workspace.id, sourceJournalEntryId: expense.id, destinationFinancialAccountProfileId: savings.id, installmentCount: 6, installmentMinorUnits: 20, idempotencyKey: "plan" };
  const plan = await s.t.action(api.savingsRecovery.activatePlan, activation);
  const moveArgs = { workspaceId: s.workspace.id, planId: plan.plan.id, sourceFinancialAccountProfileId: s.place.id, amount: money(50), accountingDate: "2026-09-24", description: "Recovery", idempotencyKey: "contribute" };
  const contribution = await s.t.action(api.savingsRecovery.recordContribution, moveArgs);
  await s.t.action(api.accounting.closePlace, { ...s.args, lines: [{ kind: "adjustment", amount: money(50) }] });
  expect(await s.t.action(api.savingsRecovery.recordContribution, moveArgs)).toEqual({ ...contribution, replay: true });
  const before = await snapshot(s.t);
  await expect(s.t.action(api.savingsRecovery.recordContribution, { ...moveArgs, idempotencyKey: "new" })).rejects.toMatchObject({ data: { code: "financial_account_profile_ended" } });
  const nextExpense = await s.t.action(api.accounting.recordCashExpense, { workspaceId: s.workspace.id, financialAccountProfileId: s.other.id, amount: money(50), accountingDate: "2026-09-24", description: "Next", idempotencyKey: "next-expense" });
  await expect(s.t.action(api.savingsRecovery.activatePlan, { ...activation, sourceJournalEntryId: nextExpense.id, destinationFinancialAccountProfileId: s.place.id, idempotencyKey: "next-plan" })).rejects.toMatchObject({ data: { code: "financial_account_profile_ended" } });
  const board = await s.t.query(api.savingsRecovery.evaluate, { workspaceId: s.workspace.id });
  expect(board.sources.map(p => p.id)).not.toContain(s.place.id);
  expect(board.destinations.map(p => p.id)).not.toContain(s.place.id);
  expect((await snapshot(s.t)).endings).toEqual(before.endings);
});

test.each(["device", "membership", "provider", "unauthenticated"] as const)("close retries recheck current %s authorization", async boundary => {
  const s = await setup();
  await s.t.action(api.accounting.closePlace, s.args);
  const before = await snapshot(s.t);
  let code: string;
  if (boundary === "device") {
    await s.t.run(ctx => ctx.db.patch(s.deviceId, { revokedAt: Date.now() }));
    code = "device_revoked";
  } else if (boundary === "membership") {
    await s.t.run(async ctx => { const membership = await ctx.db.query("workspaceMemberships").unique(); if (!membership) throw new Error("Missing membership"); await ctx.db.delete(membership._id); });
    code = "membership_required";
  } else if (boundary === "provider") {
    s.providerSession.status = "revoked";
    code = "session_inactive";
  } else code = "authentication_required";
  const caller = boundary === "unauthenticated" ? s.root : s.t;
  await expect(caller.action(api.accounting.closePlace, s.args)).rejects.toMatchObject({ data: { code } });
  expect(await snapshot(s.t)).toEqual(before);
});

test.each([0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])("invalid closing amount %s posts nothing", async amount => {
  const s = await setup("co-puc-personal@1", "cash", 100);
  const before = await snapshot(s.t);
  await expect(s.t.action(api.accounting.closePlace, { ...s.args, lines: [{ kind: "adjustment", amount: money(amount) }] })).rejects.toThrow("amount_must_be_positive");
  expect(await snapshot(s.t)).toEqual(before);
});

test("closing validates currency, category nature, profile identity and direction without writing", async () => {
  const s = await setup("co-puc-personal@1", "creditCard", 100);
  const income = await s.t.action(api.accounting.createUserCategory, { workspaceId: s.workspace.id, selection: { kind: "preset", presetId: "salary", style: { emoji: "S", tone: "positive" } } });
  if (income.kind !== "category") throw new Error("Missing category");
  const foreignWorkspace = await provisionWorkspace(s.t, { functionalCurrency: "COP" });
  const foreign = await createProfile(s.t, foreignWorkspace.id, "Foreign", "cash");
  const ended = await createProfile(s.t, s.workspace.id, "Ended", "cash");
  await s.t.action(api.accounting.closePlace, { ...s.args, financialAccountProfileId: ended.id, idempotencyKey: "end" });
  const before = await snapshot(s.t);
  await expect(s.t.action(api.accounting.closePlace, { ...s.args, lines: [{ kind: "expense", userCategoryId: income.category.id, amount: money(100) }] })).rejects.toThrow("place_close_line_invalid");
  await expect(s.t.action(api.accounting.closePlace, { ...s.args, lines: [{ kind: "adjustment", amount: money(100, "USD") }] })).rejects.toThrow("currency_mismatch");
  for (const [otherFinancialAccountProfileId, error] of [[s.place.id, "transfer_profiles_must_differ"], [foreign.id, "financial_account_profile_not_found"], [ended.id, "financial_account_profile_ended"], ["malformed", "financial_account_profile_not_found"]])
    await expect(s.t.action(api.accounting.closePlace, { ...s.args, lines: [{ kind: "transfer", otherFinancialAccountProfileId, amount: money(100) }] })).rejects.toThrow(error);
  const assetArgs = { ...s.args, financialAccountProfileId: s.other.id, lines: [{ kind: "expense", userCategoryId: income.category.id, amount: money(100) }] as Infer<typeof closingLine>[] };
  await s.t.action(api.accounting.recordCashIncome, { workspaceId: s.workspace.id, financialAccountProfileId: s.other.id, amount: money(100), accountingDate: "2026-09-24", description: "Income", idempotencyKey: "income" });
  const funded = await snapshot(s.t);
  await expect(s.t.action(api.accounting.closePlace, assetArgs)).rejects.toThrow("category_nature_mismatch");
  expect(await snapshot(s.t)).toEqual(funded);
  expect(funded.endings).toEqual(before.endings);
});

test("a guessed derived journal key cannot adopt an earlier posting", async () => {
  const s = await setup("co-puc-personal@1", "cash", 200);
  await s.t.action(api.accounting.recordAccountTransfer, { workspaceId: s.workspace.id, sourceFinancialAccountProfileId: s.place.id, destinationFinancialAccountProfileId: s.other.id,
    amount: money(100), accountingDate: "2026-09-24", description: "Closing a Place", idempotencyKey: 'place-close:["close",0]' });
  const before = await snapshot(s.t);
  await expect(s.t.action(api.accounting.closePlace, { ...s.args, lines: [{ kind: "transfer", otherFinancialAccountProfileId: s.other.id, amount: money(100) }] })).rejects.toThrow("idempotency_key_conflict");
  expect(await snapshot(s.t)).toEqual(before);
});

test("a guessed default-change key cannot leave the ended Place as default", async () => {
  const { t } = await accountingFixture(modules);
  const initial = await t.action(api.accounting.ensurePersonalDefaults, { functionalCurrency: "COP", startingMinorUnits: 100, timeZone: "America/Bogota" });
  const other = await createProfile(t, initial.workspace.id, "Other", "cash");
  await t.action(api.accounting.changeDefaultPlace, { workspaceId: initial.workspace.id, financialAccountProfileId: other.id, expectedFinancialAccountProfileId: initial.financialAccountProfile.id, idempotencyKey: "place-close-default:close" });
  await t.action(api.accounting.changeDefaultPlace, { workspaceId: initial.workspace.id, financialAccountProfileId: initial.financialAccountProfile.id, expectedFinancialAccountProfileId: other.id, idempotencyKey: "back" });
  const before = await snapshot(t);
  await expect(t.action(api.accounting.closePlace, { workspaceId: initial.workspace.id, financialAccountProfileId: initial.financialAccountProfile.id,
    replacementDefaultFinancialAccountProfileId: other.id, idempotencyKey: "close", lines: [{ kind: "adjustment", amount: money(100) }] })).rejects.toThrow("idempotency_key_conflict");
  expect(await snapshot(t)).toEqual(before);
});

test("legacy setup receipts need no migration and remain stable after their Place closes", async () => {
  const { t } = await accountingFixture(modules);
  const args = { functionalCurrency: "COP", startingMinorUnits: 0, timeZone: "America/Bogota" };
  const original = await t.action(api.accounting.ensurePersonalDefaults, args);
  await t.run(async ctx => {
    const row = await ctx.db.query("personalDefaults").unique();
    if (!row?.setupResult) throw new Error("Missing setup receipt");
    const { status, ...profile } = row.setupResult.financialAccountProfile;
    await ctx.db.patch(row._id, { setupResult: { ...row.setupResult, financialAccountProfile: profile } });
  });
  const other = await createProfile(t, original.workspace.id, "Other", "cash");
  await t.action(api.accounting.closePlace, { workspaceId: original.workspace.id, financialAccountProfileId: original.financialAccountProfile.id,
    idempotencyKey: "close", replacementDefaultFinancialAccountProfileId: other.id, lines: [] });
  expect(await t.action(api.accounting.ensurePersonalDefaults, args)).toEqual(original);
});

test("ended status also protects Undo's future state without a second family of activity guards", async () => {
  const s = await setup();
  await s.t.run(ctx => {
    const workspaceId = ctx.db.normalizeId("workspaces", s.workspace.id);
    const financialAccountProfileId = ctx.db.normalizeId("financialAccountProfiles", s.place.id);
    if (!workspaceId || !financialAccountProfileId) throw new Error("Missing IDs");
    return ctx.db.insert("placeEndings", {
    act: "undo", workspaceId, financialAccountProfileId, endedBy: "owner-1",
    occurredAt: Date.now(), recordedAt: Date.now(), idempotencyKey: "future-undo-fixture", request: "fixture-only", entries: [],
    });
  });
  expect(await s.t.query(api.accounting.listFinancialAccountProfiles, { workspaceId: s.workspace.id, status: "undone" })).toEqual([{ ...s.place, status: "undone" }]);
  const before = await snapshot(s.t);
  await expect(s.t.action(api.accounting.recordCashExpense, { workspaceId: s.workspace.id, financialAccountProfileId: s.place.id, amount: money(1), accountingDate: "2026-09-24", description: "New", idempotencyKey: "new" })).rejects.toThrow("financial_account_profile_ended");
  expect(await snapshot(s.t)).toEqual(before);
});

test("a completed Recovery plan keeps its destination name and no longer blocks closing", async () => {
  const s = await setup();
  const expense = await s.t.action(api.accounting.recordCashExpense, { workspaceId: s.workspace.id, financialAccountProfileId: s.other.id, amount: money(100), accountingDate: "2026-09-24", description: "Finished", idempotencyKey: "expense" });
  const plan = await s.t.action(api.savingsRecovery.activatePlan, { workspaceId: s.workspace.id, sourceJournalEntryId: expense.id, destinationFinancialAccountProfileId: s.place.id, installmentCount: 4, installmentMinorUnits: 25, idempotencyKey: "plan" });
  await s.t.action(api.savingsRecovery.recordContribution, { workspaceId: s.workspace.id, planId: plan.plan.id, sourceFinancialAccountProfileId: s.other.id, amount: money(100), accountingDate: "2026-09-24", description: "Complete", idempotencyKey: "contribution" });
  expect(await s.t.query(api.accounting.placeClosure, { workspaceId: s.workspace.id, financialAccountProfileId: s.place.id })).toMatchObject({ canClose: true, blockers: [], balance: money(100) });
  await s.t.action(api.accounting.closePlace, { ...s.args, lines: [{ kind: "transfer", otherFinancialAccountProfileId: s.other.id, amount: money(100) }] });
  expect((await s.t.query(api.savingsRecovery.evaluate, { workspaceId: s.workspace.id })).plans[0]).toMatchObject({ status: "completed", destinationName: "Ending" });
});

test("Closing Adjustments reuse the built-in category by identity and recreate a deleted choice without losing history", async () => {
  const s = await setup("co-puc-personal@1", "cash", 100);
  const first = await s.t.action(api.accounting.closePlace, { ...s.args, lines: [{ kind: "adjustment", amount: money(100) }] });
  const categoryId = first.ending.entries[0]?.lines[0]?.userCategoryId;
  if (!categoryId) throw new Error("Missing adjustment category");
  await s.t.action(api.accounting.updateUserCategory, { workspaceId: s.workspace.id, categoryId, name: "Unexplained money", style: { emoji: "X", tone: "warning" } });
  async function another(name: string) {
    const setup = await s.t.action(api.accounting.setupFinancialAccountProfile, { workspaceId: s.workspace.id, name, productKind: "cash", amount: money(50), accountingDate: "2026-09-24", idempotencyKey: name });
    return s.t.action(api.accounting.closePlace, { ...s.args, financialAccountProfileId: setup.financialAccountProfile.id, idempotencyKey: `close-${name}`, lines: [{ kind: "adjustment", amount: money(50) }] });
  }
  const second = await another("Second");
  expect(second.ending.entries[0]?.lines[0]).toMatchObject({ userCategoryId: categoryId, userCategoryName: "Unexplained money" });
  expect(await s.t.action(api.accounting.closePlace, { ...s.args, lines: [{ kind: "adjustment", amount: money(100) }] })).toEqual({ ...first, replay: true });
  await s.t.action(api.accounting.deleteUserCategory, { workspaceId: s.workspace.id, categoryId });
  const third = await another("Third");
  expect(third.ending.entries[0]?.lines[0]?.userCategoryId).not.toBe(categoryId);
  expect((await s.t.query(api.accounting.listJournalEntries, { workspaceId: s.workspace.id })).find(entry => entry.id === first.ending.entries[0]?.id)?.lines[0]).toMatchObject({ userCategoryId: categoryId, userCategoryName: "Unexplained money", debitMinorUnits: 100, code: "53959501" });
});

test("notification confirmation cannot create activity in an ended Place", async () => {
  const s = await setup();
  await s.t.action(api.accounting.closePlace, s.args);
  const confirmed = { direction: "out" as const, description: "Notification", amount: { currency: "COP" as const, minorUnits: 100 },
    accountingDate: "2026-09-24", financialAccountProfileId: s.place.id, userCategoryIds: [], primaryUserCategoryId: null };
  const before = await snapshot(s.t);
  await expect(s.t.action(api.notificationIntake.confirmOne, { workspaceId: s.workspace.id, candidateId: "ended-candidate", confirmed, suggestion: confirmed, parserVersion: "test@1", consentVersion: "test@1" })).rejects.toThrow("financial_account_profile_ended");
  expect(await snapshot(s.t)).toEqual(before);
});

test("closing entries respect the existing opening date rule and roll back", async () => {
  const s = await setup();
  const future = await s.t.action(api.accounting.setupFinancialAccountProfile, { workspaceId: s.workspace.id, name: "Future opening", productKind: "cash", amount: money(100), accountingDate: "2026-10-01", idempotencyKey: "future" });
  const before = await snapshot(s.t);
  await expect(s.t.action(api.accounting.closePlace, { ...s.args, financialAccountProfileId: future.financialAccountProfile.id, lines: [{ kind: "adjustment", amount: money(100) }] })).rejects.toThrow("place_future_entries");
  expect(await snapshot(s.t)).toEqual(before);
});
