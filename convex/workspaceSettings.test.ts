import { expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { accountingFixture, createProfile, provisionWorkspace, type AccountingTest } from "../src/accounting/convexHarness";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
const monthEnd = new Date("2026-10-31T23:30:00-05:00");
const setupAnswers = { functionalCurrency: "COP", startingMinorUnits: 0, timeZone: "America/Bogota" };
async function setup(startingMinorUnits = 0, timeZone = "America/Bogota", now = monthEnd) {
  const fixture = await accountingFixture(modules);
  vi.setSystemTime(now);
  const original = await fixture.t.action(api.accounting.ensurePersonalDefaults, { ...setupAnswers, startingMinorUnits, timeZone });
  return { ...fixture, original, workspaceId: original.workspace.id, profileId: original.financialAccountProfile.id };
}
function expense(t: AccountingTest, workspaceId: string, profileId: string, date = "2026-10-31", key = "expense", currency = "COP") {
  return t.action(api.accounting.recordCashExpense, {
    workspaceId, financialAccountProfileId: profileId, accountingDate: date,
    amount: { currency, minorUnits: 100 }, description: "Food", idempotencyKey: key,
  });
}
function zone(s: Awaited<ReturnType<typeof setup>>, timeZone = "Pacific/Auckland", expectedTimeZone = "America/Bogota", idempotencyKey = "zone") {
  return s.t.action(api.accounting.changeWorkspaceTimeZone, { workspaceId: s.workspaceId, timeZone, expectedTimeZone, idempotencyKey });
}
function currency(s: Awaited<ReturnType<typeof setup>>, functionalCurrency = "USD", expectedFunctionalCurrency = "COP", idempotencyKey = "currency") {
  return s.t.action(api.accounting.changeFunctionalCurrency, { workspaceId: s.workspaceId, functionalCurrency, expectedFunctionalCurrency, idempotencyKey });
}
async function state(t: AccountingTest) {
  return t.run(async ctx => ({
    entries: await ctx.db.query("journalEntries").collect(), lines: await ctx.db.query("journalLines").collect(),
    openings: await ctx.db.query("financialAccountOpenings").collect(), periods: await ctx.db.query("accountingPeriods").collect(),
  }));
}

test("Default Place is an explicit preselection, with compare-and-set and immutable replay", async () => {
  const s = await setup(500);
  const second = await createProfile(s.t, s.workspaceId, "Bank", "bankAccount");
  const third = await createProfile(s.t, s.workspaceId, "Savings", "savingsAccount");
  const before = await state(s.t);
  const args = { workspaceId: s.workspaceId, financialAccountProfileId: second.id, expectedFinancialAccountProfileId: s.profileId, idempotencyKey: "default" };
  const receipt = await s.t.action(api.accounting.changeDefaultPlace, args);
  expect(receipt).toMatchObject({ setting: "defaultPlace", previousValue: s.profileId, value: second.id, changed: true, changedBy: "owner-1", changedAt: monthEnd.getTime() });
  expect((await s.t.query(api.accounting.personalDefaults, {}))?.financialAccountProfile.id).toBe(second.id);
  expect((await s.t.query(api.accounting.workspaceSettings, { workspaceId: s.workspaceId })).defaultFinancialAccountProfileId).toBe(second.id);
  await expect(s.t.action(api.accounting.changeDefaultPlace, { ...args, idempotencyKey: "stale", financialAccountProfileId: third.id })).rejects.toMatchObject({ data: { code: "default_place_stale" } });
  expect(await s.t.action(api.accounting.changeDefaultPlace, { ...args, idempotencyKey: "same" })).toMatchObject({ changed: false, previousValue: second.id, value: second.id });
  await s.t.action(api.accounting.changeDefaultPlace, { ...args, expectedFinancialAccountProfileId: second.id, financialAccountProfileId: third.id, idempotencyKey: "third" });
  expect(await s.t.action(api.accounting.changeDefaultPlace, args)).toEqual(receipt);
  expect((await s.t.query(api.accounting.personalDefaults, {}))?.financialAccountProfile.id).toBe(third.id);
  await expect(s.t.action(api.accounting.changeDefaultPlace, { ...args, financialAccountProfileId: third.id })).rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
  await expect(s.t.action(api.accounting.changeDefaultPlace, { ...args, expectedFinancialAccountProfileId: third.id })).rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
  expect(await s.t.action(api.accounting.ensurePersonalDefaults, { ...setupAnswers, startingMinorUnits: 500 })).toEqual(s.original);
  expect(await state(s.t)).toEqual(before);
});

test("Default Place rejects missing, malformed and foreign Places", async () => {
  const s = await setup();
  const foreignWorkspace = await provisionWorkspace(s.t, { functionalCurrency: "COP" });
  const foreign = await createProfile(s.t, foreignWorkspace.id, "Foreign", "cash");
  const missingProfile = await createProfile(s.t, s.workspaceId, "Gone", "cash");
  const missing = await s.t.run(async ctx => {
    const id = ctx.db.normalizeId("financialAccountProfiles", missingProfile.id);
    if (!id) throw new Error("Missing profile ID");
    await ctx.db.delete(id);
    return id;
  });
  for (const financialAccountProfileId of [foreign.id, missing, "missing"]) {
    await expect(s.t.action(api.accounting.changeDefaultPlace, { workspaceId: s.workspaceId, financialAccountProfileId, expectedFinancialAccountProfileId: s.profileId, idempotencyKey: financialAccountProfileId })).rejects.toMatchObject({ data: { code: "financial_account_profile_not_found" } });
  }
  expect(await s.t.query(api.accounting.workspaceSettingHistory, { workspaceId: s.workspaceId })).toEqual([]);
});

test("time zone changes today immediately, keeps October facts and Budget consumption, and replays exactly", async () => {
  const s = await setup(1000);
  const categoryResult = await s.t.action(api.accounting.createUserCategory, { workspaceId: s.workspaceId, selection: { kind: "preset", presetId: "groceries", style: { emoji: "F", tone: "primary" } } });
  if (categoryResult.kind !== "category") throw new Error("Category required");
  const categoryId = categoryResult.category.id;
  const limit = await s.t.action(api.budget.setCategoryLimit, { workspaceId: s.workspaceId, categoryId, effectiveMonth: "2026-10", limit: { currency: "COP", minorUnits: 500 }, expectedRevisionId: null, idempotencyKey: "limit" });
  await s.t.action(api.accounting.recordCashExpense, { workspaceId: s.workspaceId, financialAccountProfileId: s.profileId, amount: { currency: "COP", minorUnits: 100 }, accountingDate: "2026-10-31", description: "Food", idempotencyKey: "oct-food", userCategoryId: categoryId });
  const oldEntries = await s.t.query(api.accounting.listJournalEntries, { workspaceId: s.workspaceId });
  const oldBudget = await s.t.query(api.budget.evaluate, { workspaceId: s.workspaceId, month: "2026-10" });
  expect(oldBudget).toMatchObject({ currentMonth: "2026-10", jars: [{ limitMinorUnits: 500, consumptionMinorUnits: 100 }] });
  const receipt = await zone(s);
  expect(receipt).toMatchObject({ previousValue: "America/Bogota", value: "Pacific/Auckland", changed: true, changedAt: monthEnd.getTime() });
  expect(await s.t.query(api.accounting.workspaceSettings, { workspaceId: s.workspaceId })).toMatchObject({ today: "2026-11-01", timeZone: "Pacific/Auckland" });
  expect((await s.t.query(api.accounting.openWorkspace, { workspaceId: s.workspaceId })).currentAccountingPeriod).toEqual({ year: 2026, month: 11, status: "not_opened" });
  expect(await s.t.query(api.accounting.listJournalEntries, { workspaceId: s.workspaceId })).toEqual(oldEntries);
  expect(await s.t.query(api.budget.evaluate, { workspaceId: s.workspaceId, month: "2026-10" })).toEqual({ ...oldBudget, currentMonth: "2026-11" });
  expect(await s.t.action(api.budget.setCategoryLimit, { workspaceId: s.workspaceId, categoryId, effectiveMonth: "2026-10", limit: { currency: "COP", minorUnits: 500 }, expectedRevisionId: null, idempotencyKey: "limit" })).toEqual({ ...limit, replay: true });
  expect((await s.t.query(api.budget.evaluate, { workspaceId: s.workspaceId })).month).toBe("2026-11");
  await expense(s.t, s.workspaceId, s.profileId, "2026-11-01", "after");
  expect((await s.t.query(api.accounting.listJournalEntries, { workspaceId: s.workspaceId })).map(e => e.accountingDate).sort()).toEqual(["2026-10-31", "2026-10-31", "2026-11-01"]);
  await expect(zone(s, "UTC")).rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
  await expect(zone(s, "UTC", "America/Bogota", "stale")).rejects.toMatchObject({ data: { code: "time_zone_stale" } });
  await zone(s, "UTC", "Pacific/Auckland", "next");
  expect(await zone(s)).toEqual(receipt);
  expect((await s.t.query(api.accounting.workspaceSettings, { workspaceId: s.workspaceId })).timeZone).toBe("UTC");
  expect(await s.t.action(api.accounting.ensurePersonalDefaults, { ...setupAnswers, startingMinorUnits: 1000 })).toEqual(s.original);
  expect(await s.t.query(api.accounting.workspaceSettingHistory, { workspaceId: s.workspaceId })).toHaveLength(2);
});

for (const [oldZone, newZone, lockedMonth, openMonth, openDate, setupTime] of [
  ["America/Bogota", "Pacific/Auckland", 10, 11, "2026-11-01", "2026-10-01T12:00:00Z"],
] as const) test(`zone boundary ${oldZone} to ${newZone} preserves locks and permits the other month`, async () => {
  const s = await setup(0, oldZone, new Date(setupTime));
  vi.setSystemTime(monthEnd);
  await s.t.action(api.accounting.lockAccountingPeriod, { workspaceId: s.workspaceId, period: { year: 2026, month: lockedMonth } });
  const before = await state(s.t);
  await zone(s, newZone, oldZone);
  expect((await s.t.query(api.accounting.openWorkspace, { workspaceId: s.workspaceId })).currentAccountingPeriod).toMatchObject({ month: openMonth });
  expect(await state(s.t)).toEqual(before);
  await expect(expense(s.t, s.workspaceId, s.profileId, `2026-${lockedMonth}-01`, "locked")).rejects.toMatchObject({ data: { code: "locked_period" } });
  expect(await expense(s.t, s.workspaceId, s.profileId, openDate, "legitimate")).toMatchObject({ accountingDate: openDate });
});

test("zone changes preserve a Place creation date even without an opening marker", async () => {
  const s = await setup();
  const extra = await createProfile(s.t, s.workspaceId, "Extra", "cash");
  expect((await s.t.query(api.accounting.postedActivity, { workspaceId: s.workspaceId, month: "2026-10" })).accounts.find(a => a.financialAccountProfileId === extra.id)?.trackingFrom).toBe("2026-10-31");
  await zone(s);
  expect((await s.t.query(api.accounting.postedActivity, { workspaceId: s.workspaceId, month: "2026-10" })).accounts.find(a => a.financialAccountProfileId === extra.id)?.trackingFrom).toBe("2026-10-31");
  const after = await createProfile(s.t, s.workspaceId, "New", "cash");
  expect((await s.t.query(api.accounting.postedActivity, { workspaceId: s.workspaceId, month: "2026-11" })).accounts.find(a => a.financialAccountProfileId === after.id)?.trackingFrom).toBe("2026-11-01");
});

test("currency can change once with a zero start, retains setup replay, and new entries use the new currency", async () => {
  const s = await setup();
  expect(await s.t.query(api.accounting.workspaceSettings, { workspaceId: s.workspaceId })).toMatchObject({ functionalCurrency: "COP", canChangeFunctionalCurrency: true, currencyChangeBlockedReason: null });
  await expect(currency(s, "USD", "EUR", "stale")).rejects.toMatchObject({ data: { code: "functional_currency_stale" } });
  const receipt = await currency(s);
  expect(receipt).toMatchObject({ setting: "functionalCurrency", previousValue: "COP", value: "USD", changed: true });
  expect(await s.t.query(api.accounting.workspaceSettings, { workspaceId: s.workspaceId })).toMatchObject({ functionalCurrency: "USD", canChangeFunctionalCurrency: false, currencyChangeBlockedReason: "functional_currency_already_changed" });
  expect((await s.t.query(api.accounting.personalDefaults, {}))?.workspace.functionalCurrency).toBe("USD");
  expect(await s.t.action(api.accounting.ensurePersonalDefaults, setupAnswers)).toEqual(s.original);
  expect(await currency(s)).toEqual(receipt);
  await expect(currency(s, "EUR")).rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
  await expect(currency(s, "EUR", "USD", "again")).rejects.toMatchObject({ data: { code: "functional_currency_already_changed" } });
  const snapshot = await state(s.t);
  expect(snapshot.entries).toEqual([]);
  expect(snapshot.openings).toMatchObject([{ amount: { currency: "USD", minorUnits: 0 } }]);
  expect(await expense(s.t, s.workspaceId, s.profileId, "2026-10-31", "usd-expense", "USD")).toMatchObject({ amount: { currency: "USD", minorUnits: 100 }, lines: [{ debitMinorUnits: 100, creditMinorUnits: 0 }, { debitMinorUnits: 0, creditMinorUnits: 100 }] });
  expect(await currency(s)).toEqual(receipt);
  await expect(currency(s, "EUR", "USD", "after-entry")).rejects.toMatchObject({ data: { code: "functional_currency_has_entries" } });
});

for (const kind of ["opening", "expense", "reversed"] as const) test(`currency permanently refuses after ${kind}`, async () => {
  const s = await setup(kind === "opening" ? 1 : 0);
  if (kind !== "opening") {
    const entry = await expense(s.t, s.workspaceId, s.profileId);
    if (kind === "reversed") await s.t.action(api.accounting.reversePostedEntry, { workspaceId: s.workspaceId, journalEntryId: entry.id, idempotencyKey: "reverse" });
  }
  const before = await state(s.t);
  await expect(currency(s)).rejects.toMatchObject({ data: { code: "functional_currency_has_entries" } });
  expect(await s.t.query(api.accounting.workspaceSettings, { workspaceId: s.workspaceId })).toMatchObject({ canChangeFunctionalCurrency: false, currencyChangeBlockedReason: "functional_currency_has_entries" });
  expect(await state(s.t)).toEqual(before);
});

test("a Budget limit blocks currency before the first entry", async () => {
  const s = await setup();
  const result = await s.t.action(api.accounting.createUserCategory, { workspaceId: s.workspaceId, selection: { kind: "preset", presetId: "groceries", style: { emoji: "F", tone: "primary" } } });
  if (result.kind !== "category") throw new Error("Category required");
  await s.t.action(api.budget.setCategoryLimit, { workspaceId: s.workspaceId, categoryId: result.category.id, effectiveMonth: "2026-10", limit: { currency: "COP", minorUnits: 500 }, expectedRevisionId: null, idempotencyKey: "budget" });
  await expect(currency(s)).rejects.toMatchObject({ data: { code: "functional_currency_has_records" } });
  expect((await state(s.t)).entries).toEqual([]);
});

test("invalid settings and empty keys have structured errors and no effects", async () => {
  const s = await setup();
  await expect(zone(s, "Mars/Olympus")).rejects.toMatchObject({ data: { code: "time_zone_invalid" } });
  await expect(currency(s, "ZZZ")).rejects.toMatchObject({ data: { code: "functional_currency_invalid" } });
  await expect(zone(s, "UTC", "America/Bogota", " ")).rejects.toMatchObject({ data: { code: "idempotency_key_required" } });
  expect(await s.t.query(api.accounting.workspaceSettingHistory, { workspaceId: s.workspaceId })).toEqual([]);
});

for (const failure of ["signed-out", "non-member", "revoked", "session-inactive"] as const) test(`every settings command denies ${failure}, including retries`, async () => {
  const s = await setup();
  const commands = [
    () => s.t.action(api.accounting.changeDefaultPlace, { workspaceId: s.workspaceId, financialAccountProfileId: s.profileId, expectedFinancialAccountProfileId: s.profileId, idempotencyKey: "place" }),
    () => zone(s), () => currency(s),
  ];
  for (const command of commands) await command();
  let caller = s.t;
  const code = { "signed-out": "authentication_required", "non-member": "membership_required", revoked: "device_revoked", "session-inactive": "session_inactive" }[failure];
  if (failure === "signed-out") caller = s.root;
  if (failure === "non-member") await s.t.run(async ctx => { const membership = await ctx.db.query("workspaceMemberships").first(); if (membership) await ctx.db.delete(membership._id); });
  if (failure === "revoked") await s.t.run(ctx => ctx.db.patch(s.deviceId, { revokedAt: Date.now() }));
  if (failure === "session-inactive") s.providerSession.status = "revoked";
  const calls = [
    (key: string) => caller.action(api.accounting.changeDefaultPlace, { workspaceId: s.workspaceId, financialAccountProfileId: s.profileId, expectedFinancialAccountProfileId: s.profileId, idempotencyKey: key }),
    (key: string) => caller.action(api.accounting.changeWorkspaceTimeZone, { workspaceId: s.workspaceId, timeZone: "Pacific/Auckland", expectedTimeZone: "America/Bogota", idempotencyKey: key }),
    (key: string) => caller.action(api.accounting.changeFunctionalCurrency, { workspaceId: s.workspaceId, functionalCurrency: "USD", expectedFunctionalCurrency: "COP", idempotencyKey: key }),
  ];
  for (const [i, call] of calls.entries()) {
    await expect(call(["place", "zone", "currency"][i])).rejects.toMatchObject({ data: { code } });
    await expect(call("fresh")).rejects.toMatchObject({ data: { code } });
  }
});

test("zero account setup and opening retries retain their request currency after the functional currency changes", async () => {
  const s = await setup();
  const setupArgs = { workspaceId: s.workspaceId, name: "Bank", productKind: "bankAccount" as const, amount: { currency: "COP", minorUnits: 0 }, accountingDate: "2026-10-31", idempotencyKey: "bank-setup" };
  const first = await s.t.action(api.accounting.setupFinancialAccountProfile, setupArgs);
  const openingArgs = { workspaceId: s.workspaceId, financialAccountProfileId: s.profileId, amount: { currency: "COP", minorUnits: 0 }, accountingDate: "2026-10-31", description: "Starting amount", idempotencyKey: "personal-defaults-opening@1" };
  await currency(s);
  expect(await s.t.action(api.accounting.setupFinancialAccountProfile, setupArgs)).toEqual({ ...first, replay: true });
  await expect(s.t.action(api.accounting.setupFinancialAccountProfile, { ...setupArgs, amount: { currency: "USD", minorUnits: 0 } })).rejects.toMatchObject({ data: { code: "account_setup_conflict" } });
  const openings = await s.t.run(ctx => ctx.db.query("financialAccountOpenings").collect());
  expect(openings.map(o => o.amount)).toEqual([{ currency: "USD", minorUnits: 0 }, { currency: "USD", minorUnits: 0 }]);
  expect(openings.map(o => o.originalCurrency)).toEqual(["COP", "COP"]);
  expect(await s.t.action(api.accounting.recordOpeningPosition, { ...openingArgs, financialAccountProfileId: first.financialAccountProfile.id, description: "Starting amount", idempotencyKey: "bank-setup" })).toBeNull();
});

test("a legacy setup gets an immutable receipt and frozen Place creation dates before settings change", async () => {
  const s = await setup();
  const extra = await createProfile(s.t, s.workspaceId, "Legacy Place", "cash");
  await s.t.run(async ctx => {
    const defaults = await ctx.db.query("personalDefaults").unique();
    const workspaceId = ctx.db.normalizeId("workspaces", s.workspaceId);
    const profileId = ctx.db.normalizeId("financialAccountProfiles", extra.id);
    if (!defaults || !workspaceId || !profileId) throw new Error("Missing fixture");
    await ctx.db.patch(defaults._id, { setupResult: undefined });
    await ctx.db.patch(workspaceId, { defaultFinancialAccountProfileId: undefined });
    await ctx.db.patch(profileId, { createdAccountingDate: undefined });
  });
  vi.setSystemTime(new Date("2026-12-15T12:00:00Z"));
  await s.t.action(api.accounting.renameAccount, { workspaceId: s.workspaceId, financialAccountProfileId: s.profileId, expectedName: "My money", name: "Renamed" });
  await zone(s);
  await currency(s);
  await s.t.action(api.accounting.changeDefaultPlace, { workspaceId: s.workspaceId, financialAccountProfileId: extra.id, expectedFinancialAccountProfileId: s.profileId, idempotencyKey: "place" });
  expect(await s.t.action(api.accounting.ensurePersonalDefaults, setupAnswers)).toEqual(s.original);
  expect((await s.t.query(api.accounting.postedActivity, { workspaceId: s.workspaceId, month: "2026-10" })).accounts.find(a => a.financialAccountProfileId === extra.id)?.trackingFrom).toBe("2026-10-31");
  await expect(s.t.action(api.accounting.ensurePersonalDefaults, { ...setupAnswers, timeZone: "Pacific/Auckland" })).rejects.toMatchObject({ data: { code: "setup_conflict" } });
  await expect(s.t.action(api.accounting.ensurePersonalDefaults, { ...setupAnswers, functionalCurrency: "USD" })).rejects.toMatchObject({ data: { code: "setup_conflict" } });
});

async function recoveryAtMonthEnd(now = monthEnd, date = "2026-10-31") {
  const s = await setup(0, "America/Bogota", now);
  const destination = await createProfile(s.t, s.workspaceId, "Savings", "savingsAccount");
  const entry = await expense(s.t, s.workspaceId, s.profileId, date);
  const activation = await s.t.action(api.savingsRecovery.activatePlan, { workspaceId: s.workspaceId, sourceJournalEntryId: entry.id, destinationFinancialAccountProfileId: destination.id, installmentCount: 4, installmentMinorUnits: 25, idempotencyKey: "plan" });
  const contribution = { workspaceId: s.workspaceId, planId: activation.plan.id, sourceFinancialAccountProfileId: s.profileId, amount: { currency: "COP", minorUnits: 25 }, accountingDate: "2026-10-31", description: "Recovery", idempotencyKey: "contribution" };
  return { ...s, activation, contribution };
}

test("Recovery's stored activation month and existing contribution dates stay in October", async () => {
  const s = await recoveryAtMonthEnd();
  const contribution = await s.t.action(api.savingsRecovery.recordContribution, s.contribution);
  expect(s.activation.plan.activationMonth).toBe("2026-10");
  expect((await s.t.run(ctx => ctx.db.query("savingsRecoveryPlans").unique()))?.activationDate).toBe("2026-10-31");
  expect(contribution.contribution.contributionDate).toBe("2026-10-31");
  await zone(s);
  expect(await s.t.query(api.savingsRecovery.evaluate, { workspaceId: s.workspaceId, month: "2026-10" })).toMatchObject({ currentMonth: "2026-11", plans: [{ activationMonth: "2026-10", recoveredMinorUnits: 25, contributionHistory: [{ contributionDate: "2026-10-31" }] }] });
  expect(await s.t.action(api.savingsRecovery.recordContribution, s.contribution)).toEqual({ ...contribution, replay: true });
});

test.each(["Pacific/Auckland", "America/Los_Angeles"])("Recovery keeps its activation day after changing to %s", async targetZone => {
  const s = await recoveryAtMonthEnd();
  vi.setSystemTime(monthEnd.getTime() + 1000);
  await zone(s, targetZone);
  await expect(s.t.action(api.savingsRecovery.recordContribution, { ...s.contribution, accountingDate: "2026-10-30", idempotencyKey: "too-early" }))
    .rejects.toMatchObject({ data: { code: "transfer_predates_activation" } });
  expect(await s.t.action(api.savingsRecovery.recordContribution, s.contribution)).toMatchObject({ contribution: { contributionDate: "2026-10-31" } });
});

test.each([
  ["Pacific/Auckland", "2026-10-02T00:30:00-05:00"],
  ["America/Los_Angeles", "2026-10-02T00:30:00-05:00"],
  ["Pacific/Auckland", "2026-10-31T23:30:00-05:00"],
  ["America/Los_Angeles", "2026-10-01T00:30:00-05:00"],
])("Recovery keeps a past cancellation month after changing to %s at %s", async (targetZone, cancelledAt) => {
  const s = await recoveryAtMonthEnd(new Date("2026-09-01T12:00:00-05:00"), "2026-09-01");
  vi.setSystemTime(new Date(cancelledAt));
  await s.t.action(api.savingsRecovery.cancelPlan, { workspaceId: s.workspaceId, planId: s.activation.plan.id, idempotencyKey: "cancel" });
  expect((await s.t.run(ctx => ctx.db.query("savingsRecoveryCancellations").unique()))?.cancellationDate).toBe(cancelledAt.slice(0, 10));
  vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
  await zone(s, targetZone);
  expect(await s.t.query(api.savingsRecovery.evaluate, { workspaceId: s.workspaceId, month: "2026-09" })).toMatchObject({ plans: [{ status: "active" }] });
  expect(await s.t.query(api.savingsRecovery.evaluate, { workspaceId: s.workspaceId, month: "2026-10" })).toMatchObject({ plans: [{ status: "cancelled" }] });
});

test.each(["Pacific/Auckland", "America/Los_Angeles"])("Recovery activation after a change follows %s", async targetZone => {
  const s = await setup();
  await zone(s, targetZone);
  vi.setSystemTime(monthEnd.getTime() + 1000);
  const destination = await createProfile(s.t, s.workspaceId, "Savings", "savingsAccount");
  const entry = await expense(s.t, s.workspaceId, s.profileId);
  const { plan } = await s.t.action(api.savingsRecovery.activatePlan, { workspaceId: s.workspaceId, sourceJournalEntryId: entry.id, destinationFinancialAccountProfileId: destination.id, installmentCount: 4, installmentMinorUnits: 25, idempotencyKey: "plan" });
  const date = targetZone === "Pacific/Auckland" ? "2026-11-01" : "2026-10-31";
  const previousDate = targetZone === "Pacific/Auckland" ? "2026-10-31" : "2026-10-30";
  const contribution = { workspaceId: s.workspaceId, planId: plan.id, sourceFinancialAccountProfileId: s.profileId, amount: { currency: "COP", minorUnits: 25 }, accountingDate: date, description: "Recovery", idempotencyKey: "gift" };
  expect(plan.activationMonth).toBe(date.slice(0, 7));
  expect((await s.t.run(ctx => ctx.db.query("savingsRecoveryPlans").unique()))?.activationDate).toBe(date);
  await expect(s.t.action(api.savingsRecovery.recordContribution, { ...contribution, accountingDate: previousDate, idempotencyKey: "early" }))
    .rejects.toMatchObject({ data: { code: "transfer_predates_activation" } });
  expect(await s.t.action(api.savingsRecovery.recordContribution, contribution)).toMatchObject({ contribution: { contributionDate: date } });
});

test("a retry key compares the exact zone request and expected value, and cannot switch command kinds", async () => {
  const s = await setup();
  const receipt = await zone(s, " Pacific/Auckland ");
  expect(receipt).toMatchObject({ value: "Pacific/Auckland", requestedValue: " Pacific/Auckland " });
  expect(await zone(s, " Pacific/Auckland ")).toEqual(receipt);
  await expect(zone(s, "Pacific/Auckland")).rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
  await expect(zone(s, " Pacific/Auckland ", "Pacific/Auckland")).rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
  await expect(currency(s, "USD", "COP", "zone")).rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
});

test("currency no-op leaves its single actual change available", async () => {
  const s = await setup();
  expect(await currency(s, "COP", "COP", "same")).toMatchObject({ changed: false, previousValue: "COP", value: "COP" });
  expect((await s.t.query(api.accounting.workspaceSettings, { workspaceId: s.workspaceId })).canChangeFunctionalCurrency).toBe(true);
  expect(await currency(s)).toMatchObject({ changed: true, value: "USD" });
});

test("a retained Recovery plan blocks currency even in a legacy workspace without journal rows", async () => {
  const s = await recoveryAtMonthEnd();
  await s.t.run(async ctx => {
    for (const row of await ctx.db.query("ledgerAccountTotals").collect()) await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("journalLines").collect()) await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("journalEntries").collect()) await ctx.db.delete(row._id);
  });
  await expect(currency(s)).rejects.toMatchObject({ data: { code: "functional_currency_has_records" } });
  expect((await s.t.query(api.accounting.workspaceSettings, { workspaceId: s.workspaceId })).currencyChangeBlockedReason).toBe("functional_currency_has_records");
});

test("a retained currency-denominated ledger summary blocks a currency change without journal rows", async () => {
  const s = await setup();
  await s.t.run(async ctx => {
    const workspaceId = ctx.db.normalizeId("workspaces", s.workspaceId);
    const ledgerAccountId = ctx.db.normalizeId("ledgerAccounts", s.original.financialAccountProfile.ledgerAccountId);
    if (!workspaceId || !ledgerAccountId) throw new Error("Missing fixture IDs");
    await ctx.db.insert("ledgerAccountTotals", { workspaceId, ledgerAccountId, period: "2026-10", debitMinorUnits: 100, creditMinorUnits: 0 });
  });
  await expect(currency(s)).rejects.toMatchObject({ data: { code: "functional_currency_has_records" } });
});

test("a zone change that would put the workspace back in the previous month is refused, and allowed once that month has started there", async () => {
  const s = await setup(0, "Pacific/Auckland", new Date("2026-10-31T21:00:00Z"));
  expect((await s.t.query(api.accounting.workspaceSettings, { workspaceId: s.workspaceId })).today).toBe("2026-11-01");
  await expect(zone(s, "America/Los_Angeles", "Pacific/Auckland", "west"))
    .rejects.toMatchObject({ data: { code: "time_zone_month_behind" } });
  expect((await s.t.query(api.accounting.workspaceSettings, { workspaceId: s.workspaceId })).timeZone).toBe("Pacific/Auckland");
  expect(await s.t.run(ctx => ctx.db.query("workspaceSettingChanges").collect())).toEqual([]);
  expect(await zone(s, "Asia/Tokyo", "Pacific/Auckland", "same-month")).toMatchObject({ changed: true, value: "Asia/Tokyo" });
  vi.setSystemTime(new Date("2026-11-01T07:30:00Z"));
  expect(await zone(s, "America/Los_Angeles", "Asia/Tokyo", "west-later")).toMatchObject({ changed: true, value: "America/Los_Angeles" });
  expect((await s.t.query(api.accounting.workspaceSettings, { workspaceId: s.workspaceId })).today).toBe("2026-11-01");
});
