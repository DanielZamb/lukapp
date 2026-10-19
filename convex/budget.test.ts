import { expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { accountingFixture, fixtureIdentity, groceries, provisionWorkspace } from "../src/accounting/convexHarness";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
async function setup() {
  const fixture = await accountingFixture(modules);
  const { t } = fixture;
  const { workspace, financialAccountProfile } = await t.action(api.accounting.ensurePersonalDefaults, { functionalCurrency: "COP", startingMinorUnits: 0, timeZone: "America/Bogota" });
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
