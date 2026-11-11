import { expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { budgetAttention } from "../apps/mobile/src/features/attention/model";
import { postingBudgetImpact, batchPostingBudgetImpact } from "../apps/mobile/src/features/budget/postingImpact";
import { createTranslator } from "../src/i18n";
import { accountingFixture, fixtureIdentity, septNow, groceries, provisionWorkspace } from "../src/accounting/convexHarness";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
async function setup() {
  const fixture = await accountingFixture(modules);
  const { t } = fixture;
  vi.setSystemTime(Date.UTC(2026, 8, 1, 12));
  const { workspace, financialAccountProfile } = await t.action(api.accounting.ensurePersonalDefaults, { functionalCurrency: "COP", startingMinorUnits: 0, timeZone: "America/Bogota" });
  vi.setSystemTime(septNow);
  const category = async (name: string, answer: "spend" | "receive" = "spend") => {
    const result = await t.action(api.accounting.createUserCategory, {
      workspaceId: workspace.id,
      selection: { kind: "custom", name, answer, style: { emoji: "🛒", tone: "primary" } },
    });
    if (result.kind !== "category") throw new Error("Expected category");
    return result.category.id;
  };
  const categoryId = await category("Food");
  const request = {
    workspaceId: workspace.id, categoryId, effectiveMonth: "2026-09",
    limit: { currency: "COP", minorUnits: 100000 }, expectedRevisionId: null, idempotencyKey: "budget-food-1",
  };
  return {
    ...fixture, workspaceId: workspace.id, categoryId, request, category,
    read: (month?: string) => t.query(api.budget.evaluate, { workspaceId: workspace.id, ...(month ? { month } : {}) }),
    expense: { ...groceries(workspace.id, financialAccountProfile.id), userCategoryIds: [categoryId] },
    ledger: async () => ({
      entries: await t.query(api.accounting.listJournalEntries, { workspaceId: workspace.id }),
      balances: await t.query(api.accounting.balances, { workspaceId: workspace.id }),
      periods: await t.run((ctx) => ctx.db.query("accountingPeriods").collect()),
    }),
  };
}

test("a category limit repeats without rollover, cannot block overspending, and writes only planning revisions", async () => {
  const s = await setup();
  const before = await s.ledger();
  const saved = await s.t.action(api.budget.setCategoryLimit, s.request);
  expect(saved).toMatchObject({ replay: false, revision: { effectiveMonth: "2026-09", limitMinorUnits: 100000, sequence: 1 } });
  expect(await s.ledger()).toEqual(before);
  await s.t.action(api.accounting.recordCashExpense, s.expense);
  expect(await s.read()).toMatchObject({ month: "2026-09", currentMonth: "2026-09", totalsOverlap: true,
    jars: [{ category: { name: "Food" }, limitMinorUnits: 100000, consumptionMinorUnits: 150000 }] });
  expect((await s.read("2026-08")).jars).toEqual([]);
  expect((await s.read("2026-10")).jars).toMatchObject([{ limitMinorUnits: 100000, consumptionMinorUnits: 0 }]);
  expect((await s.read("2027-01")).jars).toMatchObject([{ limitMinorUnits: 100000, consumptionMinorUnits: 0 }]);
  expect((await s.t.query(api.accounting.postedActivity, { workspaceId: s.workspaceId, month: "2026-09" })).monthSpendMinorUnits).toBe(150000);
});

const explicitActs = [
  { kind: "remove", command: api.budget.removeCategoryLimit },
  { kind: "spendNothing", command: api.budget.setCategorySpendNothing },
] as const;

test.each(explicitActs)("$kind appends planning history, preserves the past, and repeats into future months", async ({ kind, command }) => {
  const s = await setup();
  const before = await s.ledger();
  const september = await s.t.action(api.budget.setCategoryLimit, s.request);
  vi.setSystemTime(Date.UTC(2026, 9, 17));
  const { limit, ...target } = s.request;
  const october = { ...target, effectiveMonth: "2026-10", expectedRevisionId: september.revision.id, idempotencyKey: "explicit-october" };
  const saved = await s.t.action(command, october);
  expect(saved).toMatchObject({ replay: false, revision: { kind, limitMinorUnits: 0, sequence: 2,
    effectiveMonth: "2026-10", expectedRevisionId: september.revision.id } });
  expect((await s.read("2026-09")).jars).toMatchObject([{ revisionId: september.revision.id, limitMinorUnits: 100000, consumptionMinorUnits: 0 }]);
  for (const month of ["2026-10", "2026-11", "2027-01"]) {
    const result = await s.read(month);
    if (kind === "remove") {
      expect(result).toMatchObject({ jars: [], availableCategories: [{ id: s.categoryId }],
        removedLimits: [{ categoryId: s.categoryId, revisionId: saved.revision.id, effectiveMonth: "2026-10" }] });
    } else {
      expect(result).toMatchObject({ jars: [{ revisionId: saved.revision.id, limitMinorUnits: 0, consumptionMinorUnits: 0 }],
        availableCategories: [], removedLimits: [] });
    }
  }
  expect(await s.ledger()).toEqual(before);
});

test.each(explicitActs)("$kind exact retries return the original receipt; changed intent and stale revisions write nothing", async ({ command, kind }) => {
  const s = await setup();
  const initial = await s.t.action(api.budget.setCategoryLimit, s.request);
  const { limit, ...target } = s.request;
  const request = { ...target, expectedRevisionId: initial.revision.id, idempotencyKey: "explicit-change" };
  const receipts = await Promise.all([s.t.action(command, request), s.t.action(command, request)]);
  expect(receipts.map((receipt) => receipt.replay).sort()).toEqual([false, true]);
  const saved = receipts[0];
  expect(receipts[1].revision).toEqual(saved.revision);
  const before = await s.t.run((ctx) => ctx.db.query("budgetLimitRevisions").collect());
  for (const change of [{ categoryId: "other" }, { effectiveMonth: "2026-10" }, { expectedRevisionId: null }])
    await expect(s.t.action(command, { ...request, ...change })).rejects.toMatchObject({ data: { kind: "budget", code: "idempotency_key_conflict" } });
  const other = kind === "remove" ? api.budget.setCategorySpendNothing : api.budget.removeCategoryLimit;
  await expect(s.t.action(other, request)).rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
  await expect(s.t.action(api.budget.setCategoryLimit, { ...request, limit })).rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
  await expect(s.t.action(command, { ...request, idempotencyKey: "stale" })).rejects.toMatchObject({ data: { code: "limit_changed" } });
  vi.setSystemTime(Date.UTC(2026, 9, 17));
  expect(await s.t.action(command, request)).toEqual({ revision: saved.revision, replay: true });
  await expect(s.t.action(command, { ...request, idempotencyKey: "ended" })).rejects.toMatchObject({ data: { code: "month_changed" } });
  expect(await s.t.run((ctx) => ctx.db.query("budgetLimitRevisions").collect())).toEqual(before);
});

test.each(explicitActs)("$kind checks current admission, device and membership even on exact replay", async ({ command }) => {
  const s = await setup();
  const initial = await s.t.action(api.budget.setCategoryLimit, s.request);
  const { limit, ...target } = s.request;
  const request = { ...target, expectedRevisionId: initial.revision.id, idempotencyKey: "authorized-change" };
  const before = await s.t.run((ctx) => ctx.db.query("budgetLimitRevisions").collect());
  await expect(s.root.action(command, request)).rejects.toMatchObject({ data: { code: "authentication_required" } });
  const foreign = await provisionWorkspace(s.t, { functionalCurrency: "COP" });
  await s.t.run(async (ctx) => {
    const workspaceId = ctx.db.normalizeId("workspaces", foreign.id);
    if (!workspaceId) throw new Error("Expected workspace id");
    const membership = await ctx.db.query("workspaceMemberships").withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", fixtureIdentity.subject)).unique();
    if (!membership) throw new Error("Expected membership");
    await ctx.db.delete(membership._id);
  });
  await expect(s.t.action(command, { ...request, workspaceId: foreign.id })).rejects.toMatchObject({ data: { code: "membership_required" } });
  await s.t.run((ctx) => ctx.db.patch(s.deviceId, { revokedAt: Date.now() }));
  await expect(s.t.action(command, request)).rejects.toMatchObject({ data: { code: "device_revoked", wipeLocalInput: true } });
  await s.t.run((ctx) => ctx.db.patch(s.deviceId, { revokedAt: undefined }));
  s.providerSession.status = "revoked";
  await expect(s.t.action(command, request)).rejects.toMatchObject({ data: { code: "session_inactive" } });
  expect(await s.t.run((ctx) => ctx.db.query("budgetLimitRevisions").collect())).toEqual(before);
  s.providerSession.status = "active";
  const saved = await s.t.action(command, request);
  s.providerSession.status = "revoked";
  await expect(s.t.action(command, request)).rejects.toMatchObject({ data: { code: "session_inactive" } });
  s.providerSession.status = "active";
  await s.t.run((ctx) => ctx.db.patch(s.deviceId, { revokedAt: Date.now() }));
  await expect(s.t.action(command, request)).rejects.toMatchObject({ data: { code: "device_revoked" } });
  await s.t.run(async (ctx) => {
    await ctx.db.patch(s.deviceId, { revokedAt: undefined });
    const workspaceId = ctx.db.normalizeId("workspaces", s.workspaceId);
    if (!workspaceId) throw new Error("Expected workspace id");
    const membership = await ctx.db.query("workspaceMemberships").withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", fixtureIdentity.subject)).unique();
    if (!membership) throw new Error("Expected membership");
    await ctx.db.delete(membership._id);
  });
  await expect(s.t.action(command, request)).rejects.toMatchObject({ data: { code: "membership_required" } });
  expect(await s.t.run((ctx) => ctx.db.query("budgetLimitRevisions").collect())).toMatchObject([
    { _id: initial.revision.id, limitMinorUnits: 100000 }, { _id: saved.revision.id, limitMinorUnits: 0 },
  ]);
});

test("removing an absent or removed limit is distinct from a stale save; setting it again leaves a gap", async () => {
  const s = await setup();
  const { limit, ...target } = s.request;
  expect(await s.read()).toMatchObject({ jars: [], removedLimits: [], availableCategories: [{ id: s.categoryId }] });
  await expect(s.t.action(api.budget.removeCategoryLimit, target)).rejects.toMatchObject({ data: { code: "limit_not_set" } });
  const initial = await s.t.action(api.budget.setCategoryLimit, s.request);
  vi.setSystemTime(Date.UTC(2026, 9, 17));
  const removed = await s.t.action(api.budget.removeCategoryLimit, { ...target, effectiveMonth: "2026-10",
    expectedRevisionId: initial.revision.id, idempotencyKey: "remove" });
  await expect(s.t.action(api.budget.removeCategoryLimit, { ...target, effectiveMonth: "2026-10",
    expectedRevisionId: removed.revision.id, idempotencyKey: "remove-again" })).rejects.toMatchObject({ data: { code: "limit_not_set" } });
  vi.setSystemTime(Date.UTC(2026, 11, 17));
  await expect(s.t.action(api.budget.setCategoryLimit, { ...s.request, effectiveMonth: "2026-12", idempotencyKey: "missing-revision" }))
    .rejects.toMatchObject({ data: { code: "limit_changed" } });
  const reset = await s.t.action(api.budget.setCategoryLimit, { ...s.request, effectiveMonth: "2026-12",
    expectedRevisionId: removed.revision.id, limit: { currency: "COP", minorUnits: 250000 }, idempotencyKey: "reset" });
  expect(reset.revision.sequence).toBe(3);
  expect((await s.read("2026-09")).jars).toMatchObject([{ limitMinorUnits: 100000 }]);
  for (const month of ["2026-10", "2026-11"])
    expect(await s.read(month)).toMatchObject({ jars: [], removedLimits: [{ revisionId: removed.revision.id, effectiveMonth: "2026-10" }] });
  expect(await s.read("2026-12")).toMatchObject({ jars: [{ revisionId: reset.revision.id, limitMinorUnits: 250000 }], removedLimits: [] });
});

test("zero and removed overlapping jars feed Alerts and posting impact without changing total spending", async () => {
  const s = await setup();
  const family = await s.category("Family");
  const food = await s.t.action(api.budget.setCategoryLimit, s.request);
  const { limit, ...target } = s.request;
  await s.t.action(api.budget.setCategorySpendNothing, { ...target, categoryId: family, idempotencyKey: "zero-family" });
  const attention = (board: Awaited<ReturnType<typeof s.read>>) => budgetAttention(board, createTranslator("en"));
  expect(attention(await s.read())).toEqual({ rows: [], home: null, bellLabel: "Alerts, nothing needs attention" });
  expect(postingBudgetImpact({ jars: (await s.read()).jars, categoryIds: [s.categoryId, family], expenseMinorUnits: 150000 }))
    .toEqual([{ category: { id: family, name: "Family", emoji: "🛒" }, overMinorUnits: 150000 },
      { category: { id: s.categoryId, name: "Food", emoji: "🛒" }, overMinorUnits: 50000 }]);
  await s.t.action(api.budget.removeCategoryLimit, { ...target, expectedRevisionId: food.revision.id, idempotencyKey: "remove-food" });
  const queued = { ...s.expense, userCategoryIds: [s.categoryId, family], primaryUserCategoryId: s.categoryId };
  expect(await batchPostingBudgetImpact([{ kind: "expense", payload: queued }], (input) => s.t.query(api.budget.evaluate, input)))
    .toEqual([{ category: { id: family, name: "Family", emoji: "🛒" }, overMinorUnits: 150000 }]);
  const entry = await s.t.action(api.accounting.recordCashExpense, queued);
  expect((await s.read()).jars).toMatchObject([{ category: { id: family }, limitMinorUnits: 0, consumptionMinorUnits: 150000 }]);
  expect(attention(await s.read())).toEqual({
    rows: [{ id: family, title: "🛒  Family is over", detail: "Spend nothing · COP 1.500 spent", destination: { pathname: "/category-look", params: { categoryId: family } } }],
    home: { title: "Family is over its spend-nothing limit", detail: "COP 1.500 over" }, bellLabel: "Alerts, 1 over the limit",
  });
  expect((await s.t.query(api.accounting.postedActivity, { workspaceId: s.workspaceId, month: "2026-09" })).monthSpendMinorUnits).toBe(150000);
  await s.t.action(api.accounting.lockAccountingPeriod, { workspaceId: s.workspaceId, period: { year: 2026, month: 9 } });
  vi.setSystemTime(Date.UTC(2026, 9, 17));
  await s.t.action(api.accounting.reversePostedEntry, { workspaceId: s.workspaceId, journalEntryId: entry.id, idempotencyKey: "later-reversal" });
  expect((await s.read("2026-09")).jars).toMatchObject([{ limitMinorUnits: 0, consumptionMinorUnits: 150000 }]);
  expect((await s.read()).jars).toMatchObject([{ limitMinorUnits: 0, consumptionMinorUnits: -150000 }]);
  expect(attention(await s.read())).toEqual({ rows: [], home: null, bellLabel: "Alerts, nothing needs attention" });
  expect(postingBudgetImpact({ jars: (await s.read()).jars, categoryIds: [family], expenseMinorUnits: 150000 }))
    .toEqual([{ category: { id: family, name: "Family", emoji: "🛒" }, overMinorUnits: 150000 }]);
  expect((await s.read("2026-11")).jars).toMatchObject([{ limitMinorUnits: 0, consumptionMinorUnits: 0 }]);
});

test("retirement and removal compose in either order, including spend-nothing jars", async () => {
  const s = await setup();
  const { limit, ...target } = s.request;
  const zero = await s.t.action(api.budget.setCategorySpendNothing, target);
  await s.t.action(api.accounting.deleteUserCategory, { workspaceId: s.workspaceId, categoryId: s.categoryId });
  expect((await s.read()).jars).toEqual([]);
  const removal = { ...target, expectedRevisionId: zero.revision.id, idempotencyKey: "remove-retired" };
  const removed = await s.t.action(api.budget.removeCategoryLimit, removal);
  expect(await s.read()).toMatchObject({ jars: [], availableCategories: [], removedLimits: [{ revisionId: removed.revision.id }] });
  expect(await s.t.action(api.budget.removeCategoryLimit, removal)).toEqual({ ...removed, replay: true });
  await expect(s.t.action(api.budget.setCategorySpendNothing, { ...target, expectedRevisionId: removed.revision.id, idempotencyKey: "resurrect" }))
    .rejects.toMatchObject({ data: { code: "category_not_found" } });
  const active = await s.category("Other");
  const second = { ...target, categoryId: active, idempotencyKey: "other-zero" };
  const secondZero = await s.t.action(api.budget.setCategorySpendNothing, second);
  await s.t.action(api.budget.removeCategoryLimit, { ...second, expectedRevisionId: secondZero.revision.id, idempotencyKey: "other-remove" });
  await s.t.action(api.accounting.deleteUserCategory, { workspaceId: s.workspaceId, categoryId: active });
  expect(await s.read()).toMatchObject({ jars: [], availableCategories: [] });
});

test("overlapping posted consumption counts fully in both jars until removal and counts total spending once", async () => {
  const s = await setup();
  const family = await s.category("Family");
  const food = await s.t.action(api.budget.setCategoryLimit, s.request);
  const { limit, ...target } = s.request;
  await s.t.action(api.budget.setCategorySpendNothing, { ...target, categoryId: family, idempotencyKey: "zero" });
  await s.t.action(api.accounting.recordCashExpense, { ...s.expense, userCategoryIds: [s.categoryId, family], primaryUserCategoryId: s.categoryId });
  expect((await s.read()).jars.map((jar) => [jar.category.name, jar.limitMinorUnits, jar.consumptionMinorUnits]))
    .toEqual([["Family", 0, 150000], ["Food", 100000, 150000]]);
  const ledger = await s.ledger();
  await s.t.action(api.budget.removeCategoryLimit, { ...target, expectedRevisionId: food.revision.id, idempotencyKey: "remove" });
  expect((await s.read()).jars.map((jar) => [jar.category.name, jar.limitMinorUnits, jar.consumptionMinorUnits]))
    .toEqual([["Family", 0, 150000]]);
  expect(await s.ledger()).toEqual(ledger);
  expect((await s.t.query(api.accounting.postedActivity, { workspaceId: s.workspaceId, month: "2026-09" })).monthSpendMinorUnits).toBe(150000);
});

test("competing removal and spend-nothing saves cannot both extend the same revision", async () => {
  const s = await setup();
  const first = await s.t.action(api.budget.setCategoryLimit, s.request);
  const { limit, ...target } = s.request;
  const results = await Promise.allSettled(explicitActs.map(({ kind, command }) => s.t.action(command, {
    ...target, expectedRevisionId: first.revision.id, idempotencyKey: kind,
  })));
  const successes = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const failures = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
  expect(successes).toHaveLength(1);
  expect(successes[0].revision.sequence).toBe(2);
  expect(failures).toMatchObject([{ data: { kind: "budget", code: "limit_changed" } }]);
  expect(await s.t.run((ctx) => ctx.db.query("budgetLimitRevisions").collect())).toHaveLength(2);
});

test.each(explicitActs)("$kind retains category, month and request-key validation", async ({ command }) => {
  const s = await setup();
  const income = await s.category("Salary", "receive");
  const other = await provisionWorkspace(s.t, { functionalCurrency: "COP" });
  const foreign = await s.t.action(api.accounting.createUserCategory, { workspaceId: other.id,
    selection: { kind: "preset", presetId: "groceries", style: { emoji: "🏷️", tone: "primary" } } });
  if (foreign.kind !== "category") throw new Error("Expected category");
  const { limit, ...target } = s.request;
  for (const [change, code] of [
    [{ categoryId: income }, "expense_category_required"],
    [{ categoryId: foreign.category.id }, "category_not_found"],
    [{ categoryId: "missing" }, "category_not_found"],
    [{ effectiveMonth: "2026-00" }, "month_invalid"],
    [{ effectiveMonth: "2026-10" }, "month_changed"],
    [{ idempotencyKey: " " }, "idempotency_key_invalid"],
  ] as const) await expect(s.t.action(command, { ...target, ...change })).rejects.toMatchObject({ data: { kind: "budget", code } });
  expect(await s.t.run((ctx) => ctx.db.query("budgetLimitRevisions").collect())).toEqual([]);
});

test("legacy revision rows remain readable and replayable without migration", async () => {
  const s = await setup();
  const original = await s.t.action(api.budget.setCategoryLimit, s.request);
  await s.t.run(async (ctx) => {
    const id = ctx.db.normalizeId("budgetLimitRevisions", original.revision.id);
    if (!id) throw new Error("Expected revision id");
    await ctx.db.patch(id, { kind: undefined });
  });
  expect((await s.read()).jars).toMatchObject([{ revisionId: original.revision.id, limitMinorUnits: 100000 }]);
  const { kind, ...legacy } = original.revision;
  expect(await s.t.action(api.budget.setCategoryLimit, s.request)).toEqual({ revision: legacy, replay: true });
  const { limit, ...target } = s.request;
  const removed = await s.t.action(api.budget.removeCategoryLimit, { ...target, expectedRevisionId: original.revision.id, idempotencyKey: "remove-legacy" });
  expect(removed.revision).toMatchObject({ kind: "remove", sequence: 2 });
});

test.each([internal.budgetWrites.removeCategoryLimit, internal.budgetWrites.setCategorySpendNothing])("explicit internal writes reject an expired admission observation", async (command) => {
  const s = await setup();
  const { limit, ...target } = s.request;
  await expect(s.t.mutation(command, { ...target, session: {
    userId: fixtureIdentity.subject, clerkSessionId: fixtureIdentity.sid, clerkClientId: s.providerSession.client_id,
    verifiedAt: Date.now() - 5001, expiresAt: s.providerSession.expire_at, abandonsAt: s.providerSession.abandon_at,
  } })).rejects.toMatchObject({ data: { code: "session_verification_required" } });
  expect(await s.t.run((ctx) => ctx.db.query("budgetLimitRevisions").collect())).toEqual([]);
});

test("current-month revisions change this month and future months, preserving all prior monthly limits", async () => {
  const s = await setup();
  const september = await s.t.action(api.budget.setCategoryLimit, s.request);
  vi.setSystemTime(Date.UTC(2026, 9, 17));
  const october = { ...s.request, effectiveMonth: "2026-10", expectedRevisionId: september.revision.id,
    limit: { currency: "COP", minorUnits: 200000 }, idempotencyKey: "october-limit" };
  const second = await s.t.action(api.budget.setCategoryLimit, october);
  const third = await s.t.action(api.budget.setCategoryLimit, { ...october, expectedRevisionId: second.revision.id,
    limit: { currency: "COP", minorUnits: 300000 }, idempotencyKey: "october-limit-2" });
  expect(third.revision.sequence).toBe(3);
  expect((await s.read("2026-09")).jars).toMatchObject([{ revisionId: september.revision.id, limitMinorUnits: 100000 }]);
  expect((await s.read("2026-10")).jars).toMatchObject([{ revisionId: third.revision.id, limitMinorUnits: 300000 }]);
  expect((await s.read("2027-02")).jars).toMatchObject([{ revisionId: third.revision.id, limitMinorUnits: 300000 }]);
  await expect(s.t.action(api.budget.setCategoryLimit, { ...october, idempotencyKey: "stale-overwrite" }))
    .rejects.toMatchObject({ data: { kind: "budget", code: "limit_changed" } });
  // Replaying an old acknowledged command after a month change never restores its old limit.
  expect(await s.t.action(api.budget.setCategoryLimit, s.request)).toEqual({ ...september, replay: true });
  expect((await s.read()).jars).toMatchObject([{ limitMinorUnits: 300000 }]);
  expect(await s.t.run((ctx) => ctx.db.query("budgetLimitRevisions").collect())).toHaveLength(3);
});

test("overlapping category Budgets each consume the full expense and a same-month reversal restores each jar", async () => {
  const s = await setup();
  const family = await s.category("Family");
  for (const [categoryId, key] of [[s.categoryId, "food"], [family, "family"]])
    await s.t.action(api.budget.setCategoryLimit, { ...s.request, categoryId, idempotencyKey: key });
  const entry = await s.t.action(api.accounting.recordCashExpense, { ...s.expense, userCategoryIds: [s.categoryId, family], primaryUserCategoryId: s.categoryId });
  expect((await s.read()).jars.map((jar) => [jar.category.name, jar.limitMinorUnits, jar.consumptionMinorUnits]))
    .toEqual([["Family", 100000, 150000], ["Food", 100000, 150000]]);
  const activity = await s.t.query(api.accounting.postedActivity, { workspaceId: s.workspaceId, month: "2026-09" });
  expect(activity).toMatchObject({ monthSpendMinorUnits: 150000, accounts: [{ balance: { minorUnits: -150000 } }] });
  await s.t.action(api.accounting.reversePostedEntry, { workspaceId: s.workspaceId, journalEntryId: entry.id, idempotencyKey: "reverse" });
  expect((await s.read()).jars.map((jar) => [jar.category.name, jar.consumptionMinorUnits])).toEqual([["Family", 0], ["Food", 0]]);
});

test("a later-month reversal affects only its correction month and never rolls consumption into later months", async () => {
  const s = await setup();
  await s.t.action(api.budget.setCategoryLimit, s.request);
  const entry = await s.t.action(api.accounting.recordCashExpense, s.expense);
  await s.t.action(api.accounting.lockAccountingPeriod, { workspaceId: s.workspaceId, period: { year: 2026, month: 9 } });
  vi.setSystemTime(Date.UTC(2026, 9, 17));
  await s.t.action(api.accounting.reversePostedEntry, { workspaceId: s.workspaceId, journalEntryId: entry.id, idempotencyKey: "later-reverse" });
  expect((await s.read("2026-09")).jars).toMatchObject([{ limitMinorUnits: 100000, consumptionMinorUnits: 150000 }]);
  expect((await s.read("2026-10")).jars).toMatchObject([{ limitMinorUnits: 100000, consumptionMinorUnits: -150000 }]);
  expect((await s.read("2026-11")).jars).toMatchObject([{ limitMinorUnits: 100000, consumptionMinorUnits: 0 }]);
});

test("exact retries create one revision and changed payloads conflict, even with an old expected revision", async () => {
  const s = await setup();
  const first = await s.t.action(api.budget.setCategoryLimit, s.request);
  expect(await s.t.action(api.budget.setCategoryLimit, s.request)).toEqual({ ...first, replay: true });
  for (const change of [{ limit: { currency: "COP", minorUnits: 200000 } }, { effectiveMonth: "2026-10" }, { expectedRevisionId: "other" }])
    await expect(s.t.action(api.budget.setCategoryLimit, { ...s.request, ...change }))
      .rejects.toMatchObject({ data: { kind: "budget", code: "idempotency_key_conflict" } });
  await expect(s.t.action(api.budget.setCategoryLimit, { ...s.request, idempotencyKey: "second-create" }))
    .rejects.toMatchObject({ data: { code: "limit_changed" } });
  expect((await s.read()).jars).toMatchObject([{ revisionId: first.revision.id, limitMinorUnits: 100000 }]);
  expect(await s.t.run((ctx) => ctx.db.query("budgetLimitRevisions").collect())).toHaveLength(1);
});

test("invalid limits, foreign/income categories and past/future edits leave the ledger and Budget unchanged", async () => {
  const s = await setup();
  const income = await s.category("Salary", "receive");
  const foreignWorkspace = await provisionWorkspace(s.t, { functionalCurrency: "USD" });
  const foreign = await s.t.action(api.accounting.createUserCategory, { workspaceId: foreignWorkspace.id,
    selection: { kind: "preset", presetId: "groceries", style: { emoji: "🏷️", tone: "primary" } } });
  if (foreign.kind !== "category") throw new Error("Expected category");
  const before = await s.ledger();
  const cases = [
    [{ limit: { currency: "USD", minorUnits: 100 } }, "currency_mismatch"],
    ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1].map((minorUnits) => [{ limit: { currency: "COP", minorUnits } }, "limit_must_be_positive"] as const),
    [{ categoryId: income }, "expense_category_required"],
    [{ categoryId: foreign.category.id }, "category_not_found"],
    [{ categoryId: "missing" }, "category_not_found"],
    [{ effectiveMonth: "2026-13" }, "month_invalid"],
    [{ effectiveMonth: "2026-08" }, "month_changed"],
    [{ effectiveMonth: "2026-10" }, "month_changed"],
    [{ idempotencyKey: " " }, "idempotency_key_invalid"],
  ] as const;
  for (const [change, code] of cases)
    await expect(s.t.action(api.budget.setCategoryLimit, { ...s.request, ...change })).rejects.toMatchObject({ data: { kind: "budget", code } });
  await expect(s.read("2026-2")).rejects.toMatchObject({ data: { code: "month_invalid" } });
  expect(await s.ledger()).toEqual(before);
  expect(await s.read()).toMatchObject({ jars: [], availableCategories: [{ id: s.categoryId, name: "Food" }] });
  const valid = await s.t.action(api.budget.setCategoryLimit, { ...s.request, limit: { currency: "COP", minorUnits: 1 } });
  expect(valid.revision.limitMinorUnits).toBe(1);
});

test("a save crossing the server's month boundary is rejected rather than applied to a different month", async () => {
  const s = await setup();
  vi.setSystemTime(Date.UTC(2026, 9, 1, 12));
  await expect(s.t.action(api.budget.setCategoryLimit, s.request)).rejects.toMatchObject({ data: { code: "month_changed" } });
  expect(await s.read()).toMatchObject({ currentMonth: "2026-10", month: "2026-10", jars: [] });
  const saved = await s.t.action(api.budget.setCategoryLimit, { ...s.request, effectiveMonth: "2026-10" });
  expect((await s.read()).jars).toMatchObject([{ revisionId: saved.revision.id, limitMinorUnits: 100000 }]);
});

test("Budget reads and writes require authentication, Workspace membership and an unrevoked registered device", async () => {
  const s = await setup();
  const saved = await s.t.action(api.budget.setCategoryLimit, s.request);
  await expect(s.root.query(api.budget.evaluate, { workspaceId: s.workspaceId })).rejects.toMatchObject({ data: { code: "authentication_required" } });
  const stranger = s.root.withIdentity({ ...fixtureIdentity, subject: "stranger" });
  await expect(stranger.query(api.budget.evaluate, { workspaceId: s.workspaceId })).rejects.toMatchObject({ data: { code: "device_registration_required" } });
  const foreignId = await s.t.run((ctx) => ctx.db.insert("workspaces", { kind: "Personal", functionalCurrency: "COP", chartOfAccountsTemplate: "co-puc-personal@1" }));
  await expect(s.t.query(api.budget.evaluate, { workspaceId: foreignId })).rejects.toMatchObject({ data: { code: "membership_required" } });
  await expect(s.t.action(api.budget.setCategoryLimit, { ...s.request, workspaceId: foreignId })).rejects.toMatchObject({ data: { code: "membership_required" } });
  await s.t.run((ctx) => ctx.db.patch(s.deviceId, { revokedAt: Date.now() }));
  await expect(s.read()).rejects.toMatchObject({ data: { code: "device_revoked", wipeLocalInput: true } });
  await expect(s.t.action(api.budget.setCategoryLimit, s.request)).rejects.toMatchObject({ data: { code: "device_revoked", wipeLocalInput: true } });
  expect(await s.t.run((ctx) => ctx.db.query("budgetLimitRevisions").collect())).toMatchObject([{ _id: saved.revision.id, limitMinorUnits: 100000 }]);
});

test("a live provider denial blocks saving before any Budget persistence", async () => {
  const s = await setup();
  s.providerSession.status = "revoked";
  await expect(s.t.action(api.budget.setCategoryLimit, s.request)).rejects.toMatchObject({ data: { code: "session_inactive" } });
  s.providerSession.status = "active";
  const saved = await s.t.action(api.budget.setCategoryLimit, s.request);
  expect((await s.read()).jars).toMatchObject([{ revisionId: saved.revision.id, limitMinorUnits: 100000 }]);
});

test("concurrent exact retries produce one revision while competing edits cannot overwrite it", async () => {
  const s = await setup();
  const receipts = await Promise.all([s.t.action(api.budget.setCategoryLimit, s.request), s.t.action(api.budget.setCategoryLimit, s.request)]);
  expect(receipts.map((receipt) => receipt.replay).sort()).toEqual([false, true]);
  const id = receipts[0].revision.id;
  expect(receipts[1].revision.id).toBe(id);
  const edits = await Promise.allSettled([200000, 300000].map((minorUnits) => s.t.action(api.budget.setCategoryLimit, {
    ...s.request, expectedRevisionId: id, limit: { currency: "COP", minorUnits }, idempotencyKey: `concurrent-${minorUnits}`,
  })));
  const success = edits.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const failure = edits.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
  expect(success).toHaveLength(1);
  expect(failure).toMatchObject([{ data: { kind: "budget", code: "limit_changed" } }]);
  expect((await s.read()).jars).toMatchObject([{ revisionId: success[0].revision.id, limitMinorUnits: success[0].revision.limitMinorUnits }]);
  expect(await s.t.run((ctx) => ctx.db.query("budgetLimitRevisions").collect())).toHaveLength(2);
});

test("batch preflight uses posted consumption per month and accumulates every queued expense before posting", async () => {
  const { batchPostingBudgetImpact } = await import("../apps/mobile/src/features/budget/postingImpact");
  const s = await setup();
  await s.t.action(api.budget.setCategoryLimit, s.request);
  const expense = (date: string, minorUnits: number, key: string) => ({
    ...s.expense, accountingDate: date,
    amount: { currency: "COP" as const, minorUnits }, idempotencyKey: key,
  });
  await s.t.action(api.accounting.recordCashExpense, expense("2026-09-17", 80000, "posted-september"));
  await s.t.action(api.accounting.recordCashExpense, expense("2026-10-17", 70000, "posted-october"));
  const commands = [
    expense("2026-09-18", 15000, "queued-first"),
    expense("2026-10-18", 30000, "queued-october"),
    expense("2026-09-19", 10000, "queued-second"),
    expense("2026-09-20", 5000, "queued-third"),
  ].map((payload) => ({ kind: "expense" as const, payload }));
  const before = await s.ledger();
  expect(await batchPostingBudgetImpact(commands, (input) => s.t.query(api.budget.evaluate, input))).toEqual([
    { category: (await s.read("2026-09")).jars[0].category, overMinorUnits: 10000 },
  ]);
  expect(await s.ledger()).toEqual(before);
  for (const command of commands) await s.t.action(api.accounting.recordCashExpense, command.payload);
  expect((await s.read("2026-09")).jars[0].consumptionMinorUnits).toBe(110000);
  expect((await s.read("2026-10")).jars[0].consumptionMinorUnits).toBe(100000);
});
