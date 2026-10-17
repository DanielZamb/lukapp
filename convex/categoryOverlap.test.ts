import { expect, test } from "vitest";
import type { FunctionArgs } from "convex/server";
import { api } from "./_generated/api";
import { accountingFixture, groceries, provisionWorkspace, createDaily } from "../src/accounting/convexHarness";
import type { CategorySelection } from "../src/accounting/categories/types";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
const style = { emoji: "🏷️", tone: "primary" } as const;
async function setup() {
  const { t } = await accountingFixture(modules);
  const { workspace, financialAccountProfile } = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP", startingMinorUnits: 0,
  });
  const create = async (selection: CategorySelection) => {
    const result = await t.action(api.accounting.createUserCategory, { workspaceId: workspace.id, selection });
    if (result.kind !== "category") throw new Error("Expected category");
    return result.category.id;
  };
  const custom = (name: string) => create({ kind: "custom", name, answer: "spend", style });
  const preset = (presetId: string) => create({ kind: "preset", presetId, style });
  return {
    t, workspaceId: workspace.id, create, custom, preset,
    input: groceries(workspace.id, financialAccountProfile.id),
    read: (month = "2026-09") => t.query(api.accounting.postedActivity, { workspaceId: workspace.id, month }),
    totals: (month = "2026-09") => t.query(api.accounting.categoryTotals, { workspaceId: workspace.id, month }),
  };
}

test.each([
  { kind: "expense", write: api.accounting.recordCashExpense },
  { kind: "income", write: api.accounting.recordCashIncome },
])("empty scalar and array categories reject a public $kind without changing money or activity", async ({ kind, write }) => {
  const s = await setup();
  const seed = await s.t.action(api.accounting.recordCashExpense, {
    ...s.input,
    idempotencyKey: "existing-expense",
  });
  const before = {
    ledger: await s.t.query(api.accounting.listJournalEntries, { workspaceId: s.workspaceId }),
    balances: await s.t.query(api.accounting.balances, { workspaceId: s.workspaceId }),
    activity: await s.read(),
  };
  expect(before.activity).toMatchObject({
    monthSpendMinorUnits: 150000,
    accounts: [{ balance: { minorUnits: -150000 } }],
    rows: [{ id: seed.id, amount: { minorUnits: -150000 } }],
  });
  for (const selection of [{ userCategoryId: "" }, { userCategoryIds: [""] }]) {
    await expect(s.t.action(write, {
      ...s.input,
      idempotencyKey: `invalid-category-${kind}`,
      ...selection,
    })).rejects.toMatchObject({ data: { kind: "accounting", code: "category_selection_invalid" } });
    expect({
      ledger: await s.t.query(api.accounting.listJournalEntries, { workspaceId: s.workspaceId }),
      balances: await s.t.query(api.accounting.balances, { workspaceId: s.workspaceId }),
      activity: await s.read(),
    }).toEqual(before);
  }
});

test("three categories count the full amount each while the ledger, cash and spending count once", async () => {
  const s = await setup();
  const ids = await Promise.all([s.custom("Weekend"), s.custom("Family"), s.custom("Essentials")]);
  const args = { ...s.input, userCategoryIds: ids };
  const entry = await s.t.action(api.accounting.recordCashExpense, args);
  expect(entry.lines.map((line) => [line.code, line.debitMinorUnits, line.creditMinorUnits])).toEqual([
    ["51959595", 150000, 0], ["11050501", 0, 150000],
  ]);
  expect(entry.lines[0]?.userCategoryIds).toEqual([...ids].sort());
  expect(entry.lines[0]?.primaryUserCategoryId).toBeUndefined();
  const activity = await s.read();
  expect(activity.monthSpendMinorUnits).toBe(150000);
  expect(activity.accounts[0]?.balance.minorUnits).toBe(-150000);
  expect(activity.rows).toHaveLength(1);
  expect(activity.rows[0]?.userCategories.map((category) => category.name).sort()).toEqual(["Essentials", "Family", "Weekend"]);
  expect(await s.totals()).toMatchObject({ totalsOverlap: true, currency: "COP", month: "2026-09", categories: [
    { name: "Essentials", minorUnits: 150000 }, { name: "Family", minorUnits: 150000 }, { name: "Weekend", minorUnits: 150000 },
  ] });
  expect((await s.t.action(api.accounting.recordCashExpense, { ...args, userCategoryIds: [...ids].reverse() })).replay).toBe(true);
  expect((await s.read()).rows).toHaveLength(1);
});

test("mixed classifications require an explicit selected primary, never the first category", async () => {
  const s = await setup();
  const food = await s.preset("groceries");
  const dining = await s.preset("dining");
  const args = { ...s.input, userCategoryIds: [food, dining] };
  for (const ids of [[food, dining], [dining, food]])
    await expect(s.t.action(api.accounting.recordCashExpense, { ...args, userCategoryIds: ids }))
      .rejects.toMatchObject({ data: { kind: "accounting", code: "category_primary_required" } });
  const posted = await s.t.action(api.accounting.recordCashExpense, { ...args, primaryUserCategoryId: dining });
  expect(posted.lines[0]).toMatchObject({ code: "519560", primaryUserCategoryId: dining, debitMinorUnits: 150000 });
  expect(posted.lines[0]?.userCategories.map((category) => category.name).sort()).toEqual(["Dining", "Food"]);
  expect((await s.read()).monthSpendMinorUnits).toBe(150000);
  expect((await s.totals()).categories.map((category) => [category.name, category.minorUnits])).toEqual([["Dining", 150000], ["Food", 150000]]);
  await expect(s.t.action(api.accounting.recordCashExpense, { ...args, primaryUserCategoryId: food }))
    .rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
  const again = await s.t.action(api.accounting.recordCashExpense, { ...args, userCategoryIds: [dining, food], primaryUserCategoryId: dining });
  expect(again).toEqual({ ...posted, replay: true });
  expect((await s.read()).accounts[0]?.balance.minorUnits).toBe(-150000);
});

test("every selected identity, uniqueness, max three and primary membership are guarded atomically", async () => {
  const s = await setup();
  const ids = await Promise.all([s.custom("A weekend"), s.custom("B family"), s.custom("C leisure"), s.custom("D extras")]);
  const [a, b, c, d] = ids;
  if (!a || !b || !c || !d) throw new Error("Missing category");
  const income = await s.create({ kind: "custom", name: "Salary", answer: "receive", style });
  const legacy = await s.custom("Unresolved legacy");
  await s.t.run(async (ctx) => {
    const id = ctx.db.normalizeId("userCategories", legacy);
    if (!id) throw new Error("Missing category");
    await ctx.db.patch(id, { nature: undefined, natureSource: "legacy" });
  });
  const foreign = await s.t.run(async (ctx) => {
    const workspaceId = await ctx.db.insert("workspaces", { kind: "Personal", functionalCurrency: "COP", chartOfAccountsTemplate: "co-puc-personal@1" });
    return ctx.db.insert("userCategories", { workspaceId, name: "Foreign", normalizedName: "foreign", nature: "Expense", natureSource: "answered", classification: { kind: "fallback", version: "test" }, style });
  });
  const cases: Array<[Partial<FunctionArgs<typeof api.accounting.recordCashExpense>>, string]> = [
    [{ userCategoryIds: ids }, "category_limit_exceeded"],
    [{ userCategoryIds: [a, a] }, "category_selection_invalid"],
    [{ userCategoryIds: [a], userCategoryId: a }, "category_selection_invalid"],
    [{ userCategoryIds: [a, b], primaryUserCategoryId: d }, "category_primary_invalid"],
    [{ primaryUserCategoryId: a }, "category_primary_invalid"],
    [{ userCategoryIds: [a, "", c] }, "category_selection_invalid"],
    [{ userCategoryIds: [a, foreign, c], primaryUserCategoryId: a }, "category_not_found"],
    [{ userCategoryIds: [a, income, c], primaryUserCategoryId: a }, "category_nature_mismatch"],
    [{ userCategoryIds: [a, legacy, c], primaryUserCategoryId: a, ledgerAccountCode: "51959595" }, "category_nature_required"],
    [{ userCategoryIds: [a, "missing", c], primaryUserCategoryId: a }, "category_not_found"],
  ];
  for (const [selection, code] of cases)
    await expect(s.t.action(api.accounting.recordCashExpense, { ...s.input, ...selection })).rejects.toMatchObject({ data: { code } });
  const posted = await s.t.action(api.accounting.recordCashExpense, { ...s.input, userCategoryIds: [a, b, c] });
  expect((await s.read()).rows.map((row) => row.id)).toEqual([posted.id]);
  expect((await s.read()).accounts[0]?.balance.minorUnits).toBe(-150000);
  for (const selection of [[a, b], [a, b, d], []])
    await expect(s.t.action(api.accounting.recordCashExpense, { ...s.input, userCategoryIds: selection }))
      .rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
});

test("legacy scalar entries replay through the array API without rewriting history and reverse with the same identity", async () => {
  const s = await setup();
  const id = await s.preset("groceries");
  const original = await s.t.action(api.accounting.recordCashExpense, { ...s.input, userCategoryId: id });
  const before = await s.t.run((ctx) => ctx.db.query("journalLines").collect());
  expect((await s.t.action(api.accounting.recordCashExpense, { ...s.input, userCategoryIds: [id] })).id).toBe(original.id);
  const reversed = await s.t.action(api.accounting.reversePostedEntry, { workspaceId: s.workspaceId, journalEntryId: original.id, idempotencyKey: "reverse-old" });
  expect(reversed.lines[0]).toMatchObject({ userCategoryId: id, userCategories: [{ id, name: "Food" }], creditMinorUnits: 150000 });
  const after = await s.t.run((ctx) => ctx.db.query("journalLines").collect());
  expect(after.filter((line) => line.journalEntryId === original.id)).toEqual(before);
  expect((await s.totals()).categories).toMatchObject([{ categoryId: id, minorUnits: 0 }]);
  expect((await s.read()).monthSpendMinorUnits).toBe(0);
});

test("a reversal preserves every category and explicit primary and nets each month without duplicate money", async () => {
  const s = await setup();
  const food = await s.preset("groceries");
  const dining = await s.preset("dining");
  const entry = await s.t.action(api.accounting.recordCashExpense, { ...s.input, userCategoryIds: [food, dining], primaryUserCategoryId: food });
  await s.t.action(api.accounting.lockAccountingPeriod, { workspaceId: s.workspaceId, period: { year: 2026, month: 9 } });
  const args = { workspaceId: s.workspaceId, journalEntryId: entry.id, idempotencyKey: "reverse-multi" };
  const reversal = await s.t.action(api.accounting.reversePostedEntry, args);
  expect(reversal.accountingDate).toBe("2026-10-01");
  expect(reversal.lines[0]).toMatchObject({ code: "51959501", userCategoryIds: [...[food, dining]].sort(), primaryUserCategoryId: food, creditMinorUnits: 150000, debitMinorUnits: 0 });
  expect(await s.t.action(api.accounting.reversePostedEntry, args)).toEqual({ ...reversal, replay: true });
  expect((await s.totals()).categories.map((category) => category.minorUnits)).toEqual([150000, 150000]);
  expect((await s.totals("2026-10")).categories.map((category) => category.minorUnits)).toEqual([-150000, -150000]);
  const october = await s.read("2026-10");
  expect(october.monthSpendMinorUnits).toBe(-150000);
  expect(october.accounts[0]?.balance.minorUnits).toBe(0);
  expect(october.rows).toHaveLength(1);
  expect(october.rows[0]).toMatchObject({ id: entry.id, reversed: true, primaryUserCategoryId: food });
});

test("a missing final account resolves to the same fallback without requiring a primary", async () => {
  const s = await setup();
  const a = await s.custom("Weekend");
  const b = await s.custom("Family");
  await s.t.run(async (ctx) => {
    const id = ctx.db.normalizeId("userCategories", b);
    if (!id) throw new Error("Missing category");
    await ctx.db.patch(id, { defaultPostingAccountCode: undefined });
  });
  const categories = await s.t.query(api.accounting.listUserCategories, { workspaceId: s.workspaceId });
  expect(categories.map((category) => category.resolvedPostingAccountCode)).toEqual(["51959595", "51959595"]);
  const entry = await s.t.action(api.accounting.recordCashExpense, { ...s.input, userCategoryIds: [a, b] });
  expect(entry.lines[0]?.code).toBe("51959595");
  expect((await s.totals()).categories.map((category) => category.minorUnits)).toEqual([150000, 150000]);
});

test("income labels overlap on the single revenue line without increasing expense spending", async () => {
  const s = await setup();
  const ids: string[] = [];
  for (const name of ["Client work", "Side project"])
    ids.push(await s.create({ kind: "custom", name, answer: "receive", style }));
  const entry = await s.t.action(api.accounting.recordCashIncome, { ...s.input, userCategoryIds: ids });
  expect(entry.lines.map((line) => [line.nature, line.debitMinorUnits, line.creditMinorUnits, line.userCategories.length]))
    .toEqual([["Asset", 150000, 0, 0], ["Revenue", 0, 150000, 2]]);
  expect((await s.totals()).categories.map((category) => [category.nature, category.minorUnits])).toEqual([["Income", 150000], ["Income", 150000]]);
  const activity = await s.read();
  expect(activity.monthSpendMinorUnits).toBe(0);
  expect(activity.accounts[0]?.balance.minorUnits).toBe(150000);
});

test("US template mixed categories route once through the explicit primary", async () => {
  const { t } = await accountingFixture(modules);
  const workspace = await provisionWorkspace(t, { functionalCurrency: "USD", chartOfAccountsTemplate: "us-gaap-personal@1" });
  const profile = await createDaily(t, workspace.id);
  const ids: string[] = [];
  for (const presetId of ["groceries", "dining"]) {
    const result = await t.action(api.accounting.createUserCategory, { workspaceId: workspace.id, selection: { kind: "preset", presetId, style } });
    if (result.kind !== "category") throw new Error("Expected category");
    ids.push(result.category.id);
  }
  const primary = ids[1];
  if (!primary) throw new Error("Missing primary");
  const entry = await t.action(api.accounting.recordCashExpense, { ...groceries(workspace.id, profile.id), amount: { currency: "USD", minorUnits: 1500 }, userCategoryIds: ids, primaryUserCategoryId: primary });
  expect(entry.lines.map((line) => [line.code, line.debitMinorUnits, line.creditMinorUnits])).toEqual([["5320", 1500, 0], ["102001", 0, 1500]]);
  expect(await t.query(api.accounting.categoryTotals, { workspaceId: workspace.id, month: "2026-09" }))
    .toMatchObject({ currency: "USD", categories: [{ name: "Dining", minorUnits: 1500 }, { name: "Food", minorUnits: 1500 }] });
});
