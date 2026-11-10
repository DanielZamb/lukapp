import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { accountingFixture, createProfile, provisionWorkspace, reverse } from "../src/accounting/convexHarness";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
const money = (minorUnits: number) => ({ currency: "COP", minorUnits });
afterEach(() => vi.useRealTimers());
async function setup(defaultPlace = false) {
  vi.useFakeTimers();
  const f = await accountingFixture(modules);
  const defaults = defaultPlace ? await f.t.action(api.accounting.ensurePersonalDefaults, { functionalCurrency: "COP", startingMinorUnits: 0, timeZone: "America/Bogota" }) : null;
  const workspace = defaults?.workspace ?? await provisionWorkspace(f.t, { functionalCurrency: "COP" });
  const place = defaults?.financialAccountProfile ?? await createProfile(f.t, workspace.id, "Target", "cash");
  const other = await createProfile(f.t, workspace.id, "Other", "cash");
  const target = { workspaceId: workspace.id, financialAccountProfileId: place.id };
  await f.t.action(api.accounting.recordOpeningPosition, { ...target, amount: money(1000), accountingDate: "2026-09-24", description: "Opening", idempotencyKey: "opening" });
  const category = await f.t.action(api.accounting.createUserCategory, { workspaceId: workspace.id, selection: { kind: "preset", presetId: "groceries", style: { emoji: "F", tone: "primary" } } });
  if (category.kind !== "category") throw new Error("category missing");
  const expense = (key: string, amount = 1) => f.t.action(api.accounting.recordCashExpense, { ...target, userCategoryId: category.category.id, amount: money(amount), accountingDate: "2026-09-24", description: key, idempotencyKey: key });
  const close = { ...target, idempotencyKey: "close", reviewedBalance: money(1000), reviewedAccountingDate: "2026-09-24", lines: [{ kind: "transfer" as const, otherFinancialAccountProfileId: other.id, amount: money(1000) }] };
  return { ...f, workspace, place, other, target, category: category.category, expense, close };
}
async function facts(s: Awaited<ReturnType<typeof setup>>) {
  return s.t.run(async ctx => ({ entries: await ctx.db.query("journalEntries").collect(), lines: await ctx.db.query("journalLines").collect(), endings: await ctx.db.query("placeEndings").collect(), operations: await ctx.db.query("placeUndoOperations").collect() }));
}

test.each([{ amount: 2000, adjustment: false }, { amount: 1, adjustment: false }, { amount: 2000, adjustment: true }])("Close refuses reviewed balance after expense $amount, adjustment=$adjustment, without moving Other's money", async ({ amount, adjustment }) => {
  const s = await setup();
  await s.expense("other-device", amount);
  const before = await facts(s);
  await expect(s.t.action(api.accounting.closePlace, adjustment ? { ...s.close, lines: [{ kind: "adjustment", amount: money(1000) }] } : s.close)).rejects.toMatchObject({ data: { code: "place_close_balance_stale" } });
  expect(await facts(s)).toEqual(before);
  expect((await s.t.query(api.accounting.balances, { workspaceId: s.workspace.id })).find(p => p.financialAccountProfileId === s.other.id)?.balance).toEqual(money(0));
});

test.each(["2026-09-25T05:00:00Z", "2026-10-01T05:00:00Z"])("Close binds reviewed date across workspace midnight %s", async now => {
  const s = await setup();
  const before = await facts(s);
  vi.setSystemTime(new Date(now));
  await expect(s.t.action(api.accounting.closePlace, s.close)).rejects.toMatchObject({ data: { code: "place_close_date_stale" } });
  expect(await facts(s)).toEqual(before);
});

test("Close exact replay returns original date and compares both reviewed values", async () => {
  const s = await setup();
  const receipt = await s.t.action(api.accounting.closePlace, s.close);
  expect(receipt.ending.accountingDate).toBe("2026-09-24");
  expect(receipt.ending.entries.map(e => e.accountingDate)).toEqual(["2026-09-24"]);
  vi.setSystemTime(new Date("2026-10-01T05:00:00Z"));
  expect(await s.t.action(api.accounting.closePlace, s.close)).toEqual({ ...receipt, replay: true });
  for (const change of [{ reviewedBalance: money(-1000) }, { reviewedAccountingDate: "2026-10-01" }])
    await expect(s.t.action(api.accounting.closePlace, { ...s.close, ...change })).rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
  expect(await s.t.query(api.accounting.listFinancialAccountProfiles, { workspaceId: s.workspace.id, status: "closed" })).toMatchObject([{ id: s.place.id, endedAt: receipt.ending.occurredAt }]);
});

test.each(["added", "reversed", "changed"])("Undo refuses snapshot after original is %s", async change => {
  const s = await setup();
  const entry = await s.expense("before", 20);
  const preview = await s.t.query(api.accounting.previewUndoPlace, s.target);
  if (change === "added") await s.expense("after", 30);
  if (change === "reversed") await reverse(s.t, s.workspace.id, entry.id);
  if (change === "changed") await s.t.run(async ctx => {
    const lines = await ctx.db.query("journalLines").withIndex("by_entry", q => q.eq("journalEntryId", entry.id as Id<"journalEntries">)).collect();
    for (const line of lines) await ctx.db.patch(line._id, { debitMinorUnits: line.debitMinorUnits ? 21 : 0, creditMinorUnits: line.creditMinorUnits ? 21 : 0 });
  });
  const before = await facts(s);
  await expect(s.t.action(api.accounting.startUndoPlace, { ...s.target, idempotencyKey: "undo", previewFingerprint: preview.fingerprint })).rejects.toMatchObject({ data: { code: "place_undo_preview_stale" } });
  expect(await facts(s)).toEqual(before);
});

test("Undo fingerprint spans all pages, receipt retains initial counts and effects, totals retain un-reversed money", async () => {
  const s = await setup();
  for (let i = 0; i < 12; i++) await s.expense(`e-${i}`, 10);
  const preview = await s.t.query(api.accounting.previewUndoPlace, s.target);
  expect(preview.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  const next = await s.t.query(api.accounting.previewUndoPlace, { ...s.target, cursor: preview.page.continueCursor });
  expect(next.fingerprint).toBe(preview.fingerprint);
  expect((await s.t.query(api.accounting.previewUndoPlace, s.target)).fingerprint).toBe(preview.fingerprint);
  expect((await s.t.query(api.accounting.postedActivity, { workspaceId: s.workspace.id, month: "2026-09" })).accounts.map(p => p.balance)).toEqual([money(880), money(0)]);
  const args = { ...s.target, idempotencyKey: "undo", previewFingerprint: preview.fingerprint };
  const receipt = await s.t.action(api.accounting.startUndoPlace, args);
  expect(receipt.operation).toMatchObject({ totalEntriesToReverse: 13, startedPreview: { fingerprint: preview.fingerprint, entriesToReverse: 13, otherPlaces: [], earlierOpenMonthEntries: 0, lockedMonthEntries: 0 } });
  const assertBalances = async (targetBalance: number, status: string) => {
    const activity = await s.t.query(api.accounting.postedActivity, { workspaceId: s.workspace.id, month: "2026-09", includeRows: false });
    const ledger = await s.t.query(api.accounting.balances, { workspaceId: s.workspace.id });
    expect(activity.accounts.find(p => p.financialAccountProfileId === s.place.id)).toMatchObject({ status, balance: money(targetBalance) });
    expect(activity.accounts.reduce((n, p) => n + p.balance.minorUnits, 0)).toBe(ledger.reduce((n, p) => n + p.balance.minorUnits, 0));
  };
  await assertBalances(880, "undoing");
  expect(await s.t.query(api.accounting.listFinancialAccountProfiles, { workspaceId: s.workspace.id })).toMatchObject([{ id: s.other.id }]);
  await s.t.mutation(internal.accountingUndo.drive, { operationId: receipt.operation.id as Id<"placeUndoOperations">, version: 0 });
  await assertBalances(-30, "undoing");
  await s.root.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect((await s.t.query(api.accounting.postedActivity, { workspaceId: s.workspace.id, month: "2026-09" })).accounts.map(p => p.financialAccountProfileId)).toEqual([s.other.id]);
  expect((await s.t.query(api.accounting.balances, { workspaceId: s.workspace.id })).map(p => p.balance)).toEqual([money(0), money(0)]);
  expect(await s.t.query(api.accounting.placeUndoStatus, s.target)).toMatchObject({ totalEntriesToReverse: 13, startedPreview: receipt.operation.startedPreview });
  await expect(s.t.action(api.accounting.startUndoPlace, { ...args, previewFingerprint: "changed" })).rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
});

test.each([false, true])("zero-progress public abort restores default only if untouched, changed=%s", async changed => {
  const s = await setup(true);
  const third = await createProfile(s.t, s.workspace.id, "Third", "cash");
  const preview = await s.t.query(api.accounting.previewUndoPlace, s.target);
  const started = await s.t.action(api.accounting.startUndoPlace, { ...s.target, idempotencyKey: "undo", previewFingerprint: preview.fingerprint, replacementDefaultFinancialAccountProfileId: s.other.id });
  const operationId = started.operation.id as Id<"placeUndoOperations">;
  await s.t.run(async ctx => { await ctx.db.patch(operationId, { state: { kind: "needs_attention", code: "place_undo_stalled", detail: "No driver progress" } }); });
  expect((await s.t.query(api.accounting.postedActivity, { workspaceId: s.workspace.id, month: "2026-09" })).accounts.find(p => p.financialAccountProfileId === s.place.id)).toMatchObject({ balance: money(1000), status: "undoing" });
  if (changed) await s.t.action(api.accounting.changeDefaultPlace, { workspaceId: s.workspace.id, financialAccountProfileId: third.id, expectedFinancialAccountProfileId: s.other.id, idempotencyKey: "manual-default" });
  const result = await s.t.action(api.accounting.abortUndoPlace, { workspaceId: s.workspace.id, operationId });
  expect(result.operation.state).toMatchObject({ kind: "aborted", defaultRestored: !changed });
  expect(await s.t.query(api.accounting.workspaceSettings, { workspaceId: s.workspace.id })).toMatchObject({ defaultFinancialAccountProfileId: changed ? third.id : s.place.id });
  expect(await s.t.action(api.accounting.abortUndoPlace, { workspaceId: s.workspace.id, operationId })).toEqual({ ...result, replay: true });
  expect((await s.t.query(api.accounting.balances, { workspaceId: s.workspace.id })).find(p => p.financialAccountProfileId === s.place.id)?.balance).toEqual(money(1000));
});

test("public abort checks live provider, device and Owner, and refuses any committed reversal", async () => {
  const s = await setup();
  const preview = await s.t.query(api.accounting.previewUndoPlace, s.target);
  const started = await s.t.action(api.accounting.startUndoPlace, { ...s.target, idempotencyKey: "undo", previewFingerprint: preview.fingerprint });
  const operationId = started.operation.id as Id<"placeUndoOperations">;
  const args = { workspaceId: s.workspace.id, operationId };
  await s.t.run(async ctx => { await ctx.db.patch(operationId, { state: { kind: "needs_attention", code: "place_undo_stalled", detail: "No progress" } }); });
  s.providerSession.status = "revoked";
  await expect(s.t.action(api.accounting.abortUndoPlace, args)).rejects.toMatchObject({ data: { code: "session_inactive" } });
  s.providerSession.status = "active";
  await s.t.run(async ctx => { await ctx.db.patch(s.deviceId, { revokedAt: Date.now() }); });
  await expect(s.t.action(api.accounting.abortUndoPlace, args)).rejects.toMatchObject({ data: { code: "device_revoked" } });
  await s.t.run(async ctx => {
    await ctx.db.patch(s.deviceId, { revokedAt: undefined });
    const member = await ctx.db.query("workspaceMemberships").first();
    if (member) await ctx.db.patch(member._id, { userId: "other-owner" });
  });
  await expect(s.t.action(api.accounting.abortUndoPlace, args)).rejects.toMatchObject({ data: { code: "membership_required" } });
  await s.t.run(async ctx => {
    const member = await ctx.db.query("workspaceMemberships").first();
    if (member) await ctx.db.patch(member._id, { userId: "owner-1" });
    await ctx.db.patch(operationId, { reversedCount: 1 });
  });
  await expect(s.t.action(api.accounting.abortUndoPlace, args)).rejects.toMatchObject({ data: { code: "place_undo_abort_forbidden" } });
});

test("preview distinguishes earlier open months and locked months and dates every reversal now", async () => {
  const s = await setup();
  await s.expense("september", 100);
  vi.setSystemTime(new Date("2026-10-20T15:00:00Z"));
  await s.t.action(api.accounting.recordCashExpense, { ...s.target, userCategoryId: s.category.id, amount: money(40), accountingDate: "2026-10-20", description: "now", idempotencyKey: "now" });
  const preview = await s.t.query(api.accounting.previewUndoPlace, s.target);
  expect(preview).toMatchObject({ snapshot: { entriesToReverse: 3, earlierOpenMonthEntries: 2, lockedMonthEntries: 0 }, page: { earlierOpenMonthEntries: 2, lockedMonthEntries: 0 } });
  await s.t.action(api.accounting.startUndoPlace, { ...s.target, idempotencyKey: "undo", previewFingerprint: preview.fingerprint });
  await s.root.finishAllScheduledFunctions(() => vi.runAllTimers());
  const entries = await s.t.query(api.accounting.listJournalEntries, { workspaceId: s.workspace.id });
  expect(entries.filter(e => e.reversesEntryId).map(e => e.accountingDate)).toEqual(["2026-10-20", "2026-10-20", "2026-10-20"]);
  expect(await s.t.query(api.accounting.listFinancialAccountProfiles, { workspaceId: s.workspace.id, status: "undone" })).toMatchObject([{ id: s.place.id, endedAt: Date.now() }]);
});

test.each(["plans", "contributions", "cancellations", "corrections", "endings", "operations"])("ending refuses an incomplete bounded %s check", async collection => {
  const s = await setup();
  await s.t.run(async ctx => {
    const workspaceId = s.workspace.id as Id<"workspaces">;
    const financialAccountProfileId = s.place.id as Id<"financialAccountProfiles">;
    const source = (await ctx.db.query("journalEntries").first())!._id;
    const plan = { workspaceId, sourceJournalEntryId: source, destinationFinancialAccountProfileId: s.other.id as Id<"financialAccountProfiles">, title: "Plan", principalMinorUnits: 100, installmentCount: 1, installmentMinorUnits: 100, impliedAnnualRateBps: 0, currency: "COP", activationMonth: "2026-09", activationDate: "2026-09-24", idempotencyKey: "plan", createdBy: "owner-1", createdAt: Date.now() };
    const planId = await ctx.db.insert("savingsRecoveryPlans", plan);
    const contribution = { workspaceId, planId, transferJournalEntryId: source, amountMinorUnits: 1, contributionDate: "2026-09-24", idempotencyKey: "c", createdBy: "owner-1", recordedAt: Date.now() };
    const contributionId = await ctx.db.insert("savingsRecoveryContributions", contribution);
    for (let i = 0; i < 1001; i++) {
      if (collection === "plans") await ctx.db.insert("savingsRecoveryPlans", { ...plan, idempotencyKey: `p-${i}` });
      if (collection === "contributions") await ctx.db.insert("savingsRecoveryContributions", { ...contribution, idempotencyKey: `c-${i}` });
      if (collection === "cancellations") await ctx.db.insert("savingsRecoveryCancellations", { workspaceId, planId, eventTime: Date.now(), cancellationDate: "2026-09-24", recordedAt: Date.now(), createdBy: "owner-1", idempotencyKey: `x-${i}` });
      if (collection === "corrections") await ctx.db.insert("savingsRecoveryCorrections", { workspaceId, contributionId, reason: "test", contributionDate: "2026-09-24", recordedAt: Date.now(), createdBy: "owner-1", idempotencyKey: `r-${i}` });
      if (collection === "endings") await ctx.db.insert("placeEndings", { workspaceId, financialAccountProfileId: s.other.id as Id<"financialAccountProfiles">, act: "close", occurredAt: Date.now(), recordedAt: Date.now(), endedBy: "owner-1", idempotencyKey: `end-${i}`, request: "test", entries: [] });
      if (collection === "operations") await ctx.db.insert("placeUndoOperations", { workspaceId, financialAccountProfileId, idempotencyKey: `u-${i}`, request: "test", authorizedBy: "owner-1", startedAt: Date.now(), state: { kind: "aborted", abortedAt: Date.now(), abortedBy: "owner-1" }, version: 0, cursor: null, reversedCount: 0, alreadyReversedCount: 0, scannedLineCount: 0, lockedMonthCount: 0 });
    }
  });
  await expect(s.t.query(api.accounting.placeClosure, s.target)).rejects.toMatchObject({ data: { code: "place_ending_scan_limit" } });
  await expect(s.t.action(api.accounting.closePlace, s.close)).rejects.toMatchObject({ data: { code: "place_ending_scan_limit" } });
});

test("Close retains chosen identity across a rename and never substitutes an ended destination or retired category", async () => {
  const renamed = await setup();
  await renamed.t.action(api.accounting.renameAccount, { workspaceId: renamed.workspace.id, financialAccountProfileId: renamed.other.id, name: "Renamed", expectedName: "Other" });
  const receipt = await renamed.t.action(api.accounting.closePlace, renamed.close);
  expect(receipt.ending.entries[0]?.lines.find(l => l.ledgerAccountId === renamed.other.ledgerAccountId)).toMatchObject({ name: "Renamed", debitMinorUnits: 1000 });
  const ended = await setup();
  const third = await createProfile(ended.t, ended.workspace.id, "Third", "cash");
  await ended.t.action(api.accounting.closePlace, { workspaceId: ended.workspace.id, financialAccountProfileId: ended.other.id, reviewedBalance: money(0), reviewedAccountingDate: "2026-09-24", idempotencyKey: "end-other", lines: [] });
  const before = await facts(ended);
  await expect(ended.t.action(api.accounting.closePlace, ended.close)).rejects.toMatchObject({ data: { code: "financial_account_profile_ended" } });
  expect(await facts(ended)).toEqual(before);
  expect((await ended.t.query(api.accounting.balances, { workspaceId: ended.workspace.id })).find(p => p.financialAccountProfileId === third.id)?.balance).toEqual(money(0));
  const retired = await setup();
  await retired.t.action(api.accounting.deleteUserCategory, { workspaceId: retired.workspace.id, categoryId: retired.category.id });
  const beforeRetired = await facts(retired);
  await expect(retired.t.action(api.accounting.closePlace, { ...retired.close, lines: [{ kind: "expense", userCategoryId: retired.category.id, amount: money(1000) }] })).rejects.toMatchObject({ data: { code: "category_not_found" } });
  expect(await facts(retired)).toEqual(beforeRetired);
  const renamedCategory = await setup();
  await renamedCategory.t.action(api.accounting.updateUserCategory, { workspaceId: renamedCategory.workspace.id, categoryId: renamedCategory.category.id, name: "New label", style: { emoji: "F", tone: "primary" } });
  const categoryReceipt = await renamedCategory.t.action(api.accounting.closePlace, { ...renamedCategory.close, lines: [{ kind: "expense", userCategoryId: renamedCategory.category.id, amount: money(1000) }] });
  expect(categoryReceipt.ending.entries[0]?.lines[0]).toMatchObject({ userCategoryId: renamedCategory.category.id, userCategoryName: "New label", debitMinorUnits: 1000 });
});

test("Undo's immutable start receipt lists other Places and locked-month counts", async () => {
  const s = await setup();
  await s.t.action(api.accounting.recordAccountTransfer, { workspaceId: s.workspace.id, sourceFinancialAccountProfileId: s.place.id, destinationFinancialAccountProfileId: s.other.id, amount: money(300), accountingDate: "2026-09-24", description: "transfer", idempotencyKey: "transfer" });
  await s.t.action(api.accounting.lockAccountingPeriod, { workspaceId: s.workspace.id, period: { year: 2026, month: 9 } });
  vi.setSystemTime(new Date("2026-10-20T15:00:00Z"));
  const preview = await s.t.query(api.accounting.previewUndoPlace, s.target);
  expect(preview.snapshot).toMatchObject({ entriesToReverse: 2, lockedMonthEntries: 2, earlierOpenMonthEntries: 0, otherPlaces: [{ financialAccountProfileId: s.other.id, name: "Other", balanceChange: money(-300) }] });
  const receipt = await s.t.action(api.accounting.startUndoPlace, { ...s.target, idempotencyKey: "undo", previewFingerprint: preview.fingerprint });
  await s.root.finishAllScheduledFunctions(() => vi.runAllTimers());
  const status = await s.t.query(api.accounting.placeUndoStatus, s.target);
  expect(status).toMatchObject({ totalEntriesToReverse: 2, reversedCount: 2, startedPreview: { entriesToReverse: 2, lockedMonthEntries: 2, otherPlaces: [{ financialAccountProfileId: s.other.id, name: "Other", balanceChange: money(-300) }] } });
  expect(status?.startedPreview).toEqual(receipt.operation.startedPreview);
});

test("legacy Recovery calendar resolution refuses an incomplete time-zone history", async () => {
  const s = await setup();
  await s.t.run(async ctx => {
    const workspaceId = s.workspace.id as Id<"workspaces">;
    const source = (await ctx.db.query("journalEntries").first())!._id;
    await ctx.db.insert("savingsRecoveryPlans", { workspaceId, sourceJournalEntryId: source, destinationFinancialAccountProfileId: s.other.id as Id<"financialAccountProfiles">, title: "Legacy", principalMinorUnits: 1, installmentCount: 1, installmentMinorUnits: 1, impliedAnnualRateBps: 0, currency: "COP", activationMonth: "2026-09", idempotencyKey: "legacy", createdBy: "owner-1", createdAt: Date.now() });
    for (let i = 0; i < 1001; i++) await ctx.db.insert("workspaceSettingChanges", { workspaceId, setting: "timeZone", value: "America/Bogota", previousValue: "America/Bogota", requestedValue: "America/Bogota", expectedValue: "America/Bogota", changed: false, changedBy: "owner-1", changedAt: Date.now(), idempotencyKey: `zone-${i}` });
  });
  await expect(s.t.query(api.accounting.placeClosure, s.target)).rejects.toMatchObject({ data: { code: "place_ending_scan_limit" } });
});

test("paused Undo status keeps its reason code, support detail and initial total with zero progress", async () => {
  const s = await setup();
  const preview = await s.t.query(api.accounting.previewUndoPlace, s.target);
  const receipt = await s.t.action(api.accounting.startUndoPlace, { ...s.target, idempotencyKey: "undo", previewFingerprint: preview.fingerprint });
  await s.t.run(async ctx => {
    const period = await ctx.db.query("accountingPeriods").first();
    if (!period) throw new Error("missing period");
    await ctx.db.patch(period._id, { status: "locked" });
  });
  await s.t.mutation(internal.accountingUndo.drive, { operationId: receipt.operation.id as Id<"placeUndoOperations">, version: 0 });
  expect(await s.t.query(api.accounting.placeUndoStatus, s.target)).toMatchObject({ totalEntriesToReverse: 1, reversedCount: 0, state: { kind: "paused", code: "place_undo_current_period_locked", detail: "Undo needs the current month to be open", retryAt: Date.now() + 60_000 } });
  expect((await s.t.query(api.accounting.postedActivity, { workspaceId: s.workspace.id, month: "2026-09" })).accounts.find(p => p.financialAccountProfileId === s.place.id)).toMatchObject({ balance: money(1000), status: "undoing" });
});
