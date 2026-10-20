import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { convexAccounting, createDaily, groceries, provisionWorkspace, reverse } from "../src/accounting/convexHarness";
import type { CategoryStyle } from "../src/accounting/categories/types";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
const style: CategoryStyle = { emoji: "☕", tone: "primary", color: "h270" };
const changedStyle: CategoryStyle = { emoji: "🍎", tone: "positive", color: "olive" };
async function fixture() {
  const t = await convexAccounting(modules);
  const workspace = await provisionWorkspace(t, { functionalCurrency: "COP" });
  const daily = await createDaily(t, workspace.id);
  const create = async (name: string, answer: "spend" | "receive" = "spend", workspaceId = workspace.id) => {
    const result = await t.action(api.accounting.createUserCategory, {
      workspaceId, selection: { kind: "custom", name, answer, style },
    });
    if (result.kind !== "category") throw new Error("Expected category");
    return result.category;
  };
  const rawMoney = () => t.run(async (ctx) => ({
    entries: await ctx.db.query("journalEntries").collect(),
    lines: await ctx.db.query("journalLines").collect(),
  }));
  const read = () => t.query(api.accounting.listUserCategories, { workspaceId: workspace.id });
  return { t, workspaceId: workspace.id, daily, create, rawMoney, read };
}

test("renaming and restyling preserve classification, posted rows and the original posting retry", async () => {
  const s = await fixture();
  const category = await s.create("Café");
  const args = { ...groceries(s.workspaceId, s.daily.id), userCategoryId: category.id };
  const posted = await s.t.action(api.accounting.recordCashExpense, args);
  const before = await s.rawMoney();
  const update = { workspaceId: s.workspaceId, categoryId: category.id, name: "  Weekend  ", style: changedStyle };
  const changed = await s.t.action(api.accounting.updateUserCategory, update);
  expect(changed).toEqual({ ...category, name: "Weekend", normalizedName: "weekend", style: changedStyle });
  expect(await s.t.action(api.accounting.updateUserCategory, update)).toEqual(changed);
  const replay = await s.t.action(api.accounting.recordCashExpense, args);
  expect(replay).toMatchObject({ id: posted.id, replay: true });
  expect(replay.lines[0]).toMatchObject({ code: "519560", userCategoryName: "Weekend" });
  expect(await s.rawMoney()).toEqual(before);
  expect((await s.read()).map((row) => row.name)).toEqual(["Weekend"]);
});

test("names remain unique after accent and whitespace normalization and boundary lengths are enforced", async () => {
  const s = await fixture();
  await s.create("Café");
  const other = await s.create("Other");
  for (const [name, code] of [[" CAFE ", "category_name_conflict"], [" ", "name_required"], ["x".repeat(81), "category_name_too_long"]]) {
    await expect(s.t.action(api.accounting.updateUserCategory, {
      workspaceId: s.workspaceId, categoryId: other.id, name, style,
    })).rejects.toMatchObject({ data: { code } });
  }
  await expect(s.create("x".repeat(81))).rejects.toMatchObject({ data: { code: "category_name_too_long" } });
  expect((await s.read()).map((row) => row.name)).toEqual(["Café", "Other"]);
});

test("deleting a used category hides it and its budget while preserving money, history, retries and reversal", async () => {
  const s = await fixture();
  const category = await s.create("Weekend");
  const args = { ...groceries(s.workspaceId, s.daily.id), userCategoryIds: [category.id] };
  const posted = await s.t.action(api.accounting.recordCashExpense, args);
  await s.t.action(api.budget.setCategoryLimit, {
    workspaceId: s.workspaceId, categoryId: category.id, effectiveMonth: "2026-09",
    limit: { currency: "COP", minorUnits: 200000 }, expectedRevisionId: null, idempotencyKey: "category-limit",
  });
  const before = await s.rawMoney();
  const remove = { workspaceId: s.workspaceId, categoryId: category.id };
  expect(await s.t.action(api.accounting.deleteUserCategory, remove)).toBeNull();
  expect(await s.t.action(api.accounting.deleteUserCategory, remove)).toBeNull();
  expect(await s.read()).toEqual([]);
  const activity = await s.t.query(api.accounting.postedActivity, { workspaceId: s.workspaceId, month: "2026-09" });
  expect(activity).toMatchObject({ monthSpendMinorUnits: 150000, rows: [{ userCategories: [{ id: category.id, name: "Weekend" }] }] });
  const budget = await s.t.query(api.budget.evaluate, { workspaceId: s.workspaceId, month: "2026-09" });
  expect(budget.jars).toEqual([]);
  expect(budget.availableCategories).toEqual([]);
  expect(await s.t.action(api.accounting.recordCashExpense, args)).toMatchObject({ id: posted.id, replay: true });
  expect(await s.rawMoney()).toEqual(before);
  await expect(s.t.action(api.accounting.recordCashExpense, { ...args, idempotencyKey: "new-after-delete" }))
    .rejects.toMatchObject({ data: { code: "category_not_found" } });
  await expect(s.t.action(api.accounting.recordCashExpense, { ...args, amount: { currency: "COP", minorUnits: 1 } }))
    .rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
  const reversed = await reverse(s.t, s.workspaceId, posted.id);
  expect(reversed.lines[0]).toMatchObject({ userCategoryIds: [category.id], debitMinorUnits: 0, creditMinorUnits: 150000 });
  const after = await s.rawMoney();
  expect(after.entries.find((row) => row._id === posted.id)).toEqual(before.entries[0]);
  expect(after.lines.filter((line) => line.journalEntryId === posted.id)).toEqual(before.lines);
});

test("deleted identities cannot be edited or reused for a new transfer and recreation gets a fresh identity", async () => {
  const s = await fixture();
  const category = await s.create("Weekend");
  await s.t.action(api.accounting.deleteUserCategory, { workspaceId: s.workspaceId, categoryId: category.id });
  await expect(s.t.action(api.accounting.updateUserCategory, {
    workspaceId: s.workspaceId, categoryId: category.id, name: "Changed", style,
  })).rejects.toMatchObject({ data: { code: "category_not_found" } });
  await expect(s.t.action(api.accounting.restyleUserCategory, {
    workspaceId: s.workspaceId, categoryId: category.id, style,
  })).rejects.toMatchObject({ data: { code: "category_not_found" } });
  const destination = await createDaily(s.t, s.workspaceId);
  await expect(s.t.action(api.accounting.recordAccountTransfer, {
    workspaceId: s.workspaceId, sourceFinancialAccountProfileId: s.daily.id,
    destinationFinancialAccountProfileId: destination.id, userCategoryIds: [category.id],
    amount: { currency: "COP", minorUnits: 100 }, accountingDate: "2026-09-24",
    description: "Transfer", idempotencyKey: "deleted-transfer",
  })).rejects.toMatchObject({ data: { code: "category_not_found" } });
  const fresh = await s.create("Weekend");
  expect(fresh.id).not.toBe(category.id);
  await s.t.action(api.accounting.deleteUserCategory, { workspaceId: s.workspaceId, categoryId: category.id });
  expect((await s.read()).map((row) => row.id)).toEqual([fresh.id]);
  expect(await s.rawMoney()).toEqual({ entries: [], lines: [] });
});

test("update and delete reject category IDs from another workspace", async () => {
  const s = await fixture();
  const other = await provisionWorkspace(s.t, { functionalCurrency: "COP" });
  const category = await s.create("Foreign", "spend", other.id);
  await expect(s.t.action(api.accounting.updateUserCategory, {
    workspaceId: s.workspaceId, categoryId: category.id, name: "Changed", style,
  })).rejects.toMatchObject({ data: { code: "category_not_found" } });
  await expect(s.t.action(api.accounting.deleteUserCategory, {
    workspaceId: s.workspaceId, categoryId: category.id,
  })).rejects.toMatchObject({ data: { code: "category_not_found" } });
  expect((await s.t.query(api.accounting.listUserCategories, { workspaceId: other.id })).map((row) => row.name))
    .toEqual(["Foreign"]);
});

test("deleting the initial category clears the setup shortcut and setup retries do not resurrect it", async () => {
  const t = await convexAccounting(modules);
  const args = { functionalCurrency: "COP", startingMinorUnits: 0, timeZone: "America/Bogota",
    categories: [{ kind: "custom" as const, name: "Weekend", answer: "spend" as const, style }] };
  const first = await t.action(api.accounting.ensurePersonalDefaults, args);
  if (!first.firstCategoryId) throw new Error("Missing initial category");
  await t.action(api.accounting.deleteUserCategory, { workspaceId: first.workspace.id, categoryId: first.firstCategoryId });
  expect(await t.action(api.accounting.ensurePersonalDefaults, args)).toMatchObject({ workspace: first.workspace });
  expect((await t.query(api.accounting.personalDefaults, {}))?.firstCategoryId).toBeUndefined();
  expect(await t.query(api.accounting.listUserCategories, { workspaceId: first.workspace.id })).toEqual([]);
});
