/// <reference types="vite/client" />
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  convexAccounting,
  provisionWorkspace,
  createDaily,
  createOwnedWorkspace,
  groceries,
  reverse,
} from "../src/accounting/convexHarness";
import type { CategorySelection } from "../src/accounting/categories/types";

const modules = import.meta.glob([
  "./**/*.{js,ts}",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
]);
const style = {
  emoji: "🛒",
  tone: "primary",
} satisfies CategorySelection["style"];
const food = {
  kind: "preset",
  presetId: "groceries",
  style,
} satisfies CategorySelection;
const custom = (
  name: string,
  answer: "spend" | "receive" | "stillMine" | "payDebt" = "spend",
): CategorySelection => ({ kind: "custom", name, answer, style });

for (const [template, code, profileCode] of [
  ["co-puc-personal@1", "51959501", "11100501"],
  ["us-gaap-personal@1", "5310", "102001"],
]) {
  test(`public category expense routes through ${template}, reads its label, and replays once`, async () => {
    const t = await convexAccounting(modules);
    const workspace = await provisionWorkspace(t, {
      functionalCurrency: "COP",
      chartOfAccountsTemplate: template,
    });
    const daily = await createDaily(t, workspace.id);
    const result = await t.action(api.accounting.createUserCategory, {
      workspaceId: workspace.id,
      selection: food,
    });
    expect(result.kind).toBe("category");
    if (result.kind !== "category") throw new Error("Expected category");
    expect(result.category).toMatchObject({
      name: "Food",
      nature: "Expense",
      natureSource: "preset",
      defaultPostingAccountCode: code,
      classification: { kind: "preset", concept: "groceries" },
    });
    const input = {
      ...groceries(workspace.id, daily.id),
      userCategoryId: result.category.id,
    };
    const posted = await t.action(api.accounting.recordCashExpense, input);
    expect(
      posted.lines.map((l) => [
        l.code,
        l.userCategoryName ?? null,
        l.debitMinorUnits,
        l.creditMinorUnits,
      ]),
    ).toEqual([
      [code, "Food", 150000, 0],
      [profileCode, null, 0, 150000],
    ]);
    expect(await t.action(api.accounting.recordCashExpense, input)).toEqual({
      ...posted,
      replay: true,
    });
    const activity = await t.query(api.accounting.postedActivity, {
      workspaceId: workspace.id,
      month: "2026-09",
    });
    expect(activity.rows).toMatchObject([
      { id: posted.id, detail: "Food", amount: { minorUnits: -150000 } },
    ]);
    expect(activity.monthSpendMinorUnits).toBe(150000);
    expect(activity.accounts[0]?.balance.minorUnits).toBe(-150000);
  });
}

test("custom nature confirmation selects only that nature's accounts and stores provenance", async () => {
  const t = await convexAccounting(modules);
  const w = await createOwnedWorkspace(t);
  const expense = await t.action(api.accounting.createUserCategory, {
    workspaceId: w.id,
    selection: custom("ÁRRIENDO"),
  });
  expect(expense).toMatchObject({
    kind: "category",
    category: {
      defaultPostingAccountCode: "512010",
      nature: "Expense",
      natureSource: "answered",
      classification: {
        kind: "lexicon",
        concept: "rent",
        version: "category-es-en@1",
      },
    },
  });
  const w2 = await createOwnedWorkspace(t);
  expect(
    await t.action(api.accounting.createUserCategory, {
      workspaceId: w2.id,
      selection: custom("arriendo", "receive"),
    }),
  ).toMatchObject({
    category: { nature: "Income", defaultPostingAccountCode: "42201001" },
  });
  for (const name of ["mercadoo", "Café", "restaurnte", "gasolna"]) {
    expect(
      await t.query(api.accounting.suggestCategoryNature, {
        name,
        direction: "out",
      }),
    ).toMatchObject({ suggested: "spend" });
  }
  expect(
    await t.query(api.accounting.suggestCategoryNature, { name: "arriendo" }),
  ).toMatchObject({ suggested: null });
  expect(
    await t.query(api.accounting.suggestCategoryNature, {
      name: "Café",
      direction: "in",
    }),
  ).toMatchObject({
    suggested: null,
    allowed: ["receive", "stillMine", "payDebt"],
  });
  expect(
    await t.query(api.accounting.suggestCategoryNature, { name: "ahorró" }),
  ).toMatchObject({ suggested: "stillMine" });
  expect(
    await t.query(api.accounting.suggestCategoryNature, {
      name: "pago tarjeta",
    }),
  ).toMatchObject({ suggested: "payDebt" });
});

test("unknown custom names and a category with no final account post through the fallback", async () => {
  const t = await convexAccounting(modules);
  const w = await createOwnedWorkspace(t);
  const daily = await createDaily(t, w.id);
  const result = await t.action(api.accounting.createUserCategory, {
    workspaceId: w.id,
    selection: custom("Friday things"),
  });
  if (result.kind !== "category") throw new Error("Expected category");
  expect(result.category).toMatchObject({
    natureSource: "answered",
    classification: { kind: "fallback", version: "category-es-en@1" },
    defaultPostingAccountCode: "51959595",
  });
  await t.run(async (ctx) => {
    const id = ctx.db.normalizeId("userCategories", result.category.id);
    if (!id) throw new Error("Missing id");
    await ctx.db.patch(id, { defaultPostingAccountCode: undefined });
  });
  const posted = await t.action(api.accounting.recordCashExpense, {
    ...groceries(w.id, daily.id),
    userCategoryId: result.category.id,
  });
  expect(posted.lines[0]).toMatchObject({
    code: "51959595",
    userCategoryName: "Friday things",
  });
});

test("account-door answers create no category or ledger entry", async () => {
  const t = await convexAccounting(modules);
  const w = await createOwnedWorkspace(t);
  for (const answer of ["stillMine", "payDebt"] as const) {
    expect(
      await t.action(api.accounting.createUserCategory, {
        workspaceId: w.id,
        selection: custom("Savings", answer),
      }),
    ).toEqual({ kind: "accountSetupRequired", name: "Savings", answer });
  }
  expect(
    await t.query(api.accounting.listUserCategories, { workspaceId: w.id }),
  ).toEqual([]);
  expect(
    await t.query(api.accounting.listJournalEntries, { workspaceId: w.id }),
  ).toEqual([]);
});

test("category identity is part of expense retry conflicts, including same-account categories", async () => {
  const t = await convexAccounting(modules);
  const w = await createOwnedWorkspace(t);
  const daily = await createDaily(t, w.id);
  const ids: string[] = [];
  for (const name of ["One unknown", "Two unknown"]) {
    const result = await t.action(api.accounting.createUserCategory, {
      workspaceId: w.id,
      selection: custom(name),
    });
    if (result.kind !== "category") throw new Error("Expected category");
    ids.push(result.category.id);
  }
  const input = groceries(w.id, daily.id);
  await t.action(api.accounting.recordCashExpense, {
    ...input,
    userCategoryId: ids[0],
  });
  for (const id of [ids[1], undefined]) {
    await expect(
      t.action(api.accounting.recordCashExpense, {
        ...input,
        ...(id ? { userCategoryId: id } : {}),
      }),
    ).rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
  }
  expect(
    await t.query(api.accounting.listJournalEntries, { workspaceId: w.id }),
  ).toHaveLength(1);
});

test("category scope, nature and unresolved legacy nature block invalid posts", async () => {
  const t = await convexAccounting(modules);
  const w = await createOwnedWorkspace(t);
  const other = await createOwnedWorkspace(t);
  const daily = await createDaily(t, w.id);
  const foreign = await t.action(api.accounting.createUserCategory, {
    workspaceId: other.id,
    selection: food,
  });
  const income = await t.action(api.accounting.createUserCategory, {
    workspaceId: w.id,
    selection: custom("Salary", "receive"),
  });
  if (foreign.kind !== "category" || income.kind !== "category")
    throw new Error("Expected category");
  const input = groceries(w.id, daily.id);
  for (const [id, code] of [
    [foreign.category.id, "category_not_found"],
    [income.category.id, "category_nature_mismatch"],
    ["invalid", "category_not_found"],
  ]) {
    await expect(
      t.action(api.accounting.recordCashExpense, {
        ...input,
        userCategoryId: id,
      }),
    ).rejects.toMatchObject({ data: { code } });
  }
  await t.run(async (ctx) => {
    const id = ctx.db.normalizeId("userCategories", income.category.id);
    if (!id) throw new Error("Missing id");
    await ctx.db.patch(id, { nature: undefined, natureSource: "legacy" });
  });
  await expect(
    t.action(api.accounting.recordCashExpense, {
      ...input,
      userCategoryId: income.category.id,
    }),
  ).rejects.toMatchObject({ data: { code: "category_nature_required" } });
  expect(
    await t.query(api.accounting.listJournalEntries, { workspaceId: w.id }),
  ).toEqual([]);
});

test("reversals retain the category on the mirrored line and restyling changes no posted amount", async () => {
  const t = await convexAccounting(modules);
  const w = await createOwnedWorkspace(t);
  const daily = await createDaily(t, w.id);
  const result = await t.action(api.accounting.createUserCategory, {
    workspaceId: w.id,
    selection: food,
  });
  if (result.kind !== "category") throw new Error("Expected category");
  const posted = await t.action(api.accounting.recordCashExpense, {
    ...groceries(w.id, daily.id),
    userCategoryId: result.category.id,
  });
  await t.action(api.accounting.restyleUserCategory, {
    workspaceId: w.id,
    categoryId: result.category.id,
    style: { emoji: "🍎", tone: "positive" },
  });
  expect(
    (
      await t.query(api.accounting.listJournalEntries, { workspaceId: w.id })
    )[0],
  ).toEqual(posted);
  const reversed = await reverse(t, w.id, posted.id);
  expect(reversed.lines[0]).toMatchObject({
    userCategoryId: result.category.id,
    userCategoryName: "Food",
    debitMinorUnits: 0,
    creditMinorUnits: 150000,
  });
  expect(
    (
      await t.query(api.accounting.postedActivity, {
        workspaceId: w.id,
        month: "2026-09",
      })
    ).monthSpendMinorUnits,
  ).toBe(0);
});

test("setup persists server categories atomically, retries once and rejects changed category answers", async () => {
  const t = await convexAccounting(modules);
  const input = {
    functionalCurrency: "COP",
    startingMinorUnits: 100000,
    timeZone: "America/Bogota",
    categories: [food, custom("Friday things")],
  };
  const first = await t.action(api.accounting.ensurePersonalDefaults, input);
  expect(
    await t.action(api.accounting.ensurePersonalDefaults, input),
  ).toEqual(first);
  expect(
    (
      await t.query(api.accounting.listUserCategories, {
        workspaceId: first.workspace.id,
      })
    ).map((c) => c.name),
  ).toEqual(["Food", "Friday things"]);
  await expect(
    t.action(api.accounting.ensurePersonalDefaults, {
      ...input,
      categories: [food],
    }),
  ).rejects.toMatchObject({ data: { code: "setup_conflict" } });
});

test("an account-door setup answer rolls back the entire setup", async () => {
  const t = await convexAccounting(modules);
  await expect(
    t.action(api.accounting.ensurePersonalDefaults, {
      functionalCurrency: "COP",
      startingMinorUnits: 0,
      timeZone: "America/Bogota",
      categories: [food, custom("Savings", "stillMine")],
    }),
  ).rejects.toMatchObject({ data: { code: "account_setup_required" } });
  expect(await t.query(api.accounting.personalDefaults, {})).toBeNull();
  expect(
    await t.run((ctx) => ctx.db.query("userCategories").collect()),
  ).toEqual([]);
});

test("a preset without a final account uses Otros rather than blocking or rematching its name", async () => {
  const t = await convexAccounting(modules);
  const w = await createOwnedWorkspace(t);
  const daily = await createDaily(t, w.id);
  const result = await t.action(api.accounting.createUserCategory, {
    workspaceId: w.id,
    selection: food,
  });
  if (result.kind !== "category") throw new Error("Expected category");
  await t.run(async (ctx) => {
    const id = ctx.db.normalizeId("userCategories", result.category.id);
    if (!id) throw new Error("Missing id");
    await ctx.db.patch(id, { defaultPostingAccountCode: undefined });
  });
  const posted = await t.action(api.accounting.recordCashExpense, {
    ...groceries(w.id, daily.id),
    userCategoryId: result.category.id,
  });
  expect(posted.lines[0]).toMatchObject({
    code: "51959595",
    userCategoryName: "Food",
  });
});

test("category creation is idempotent by normalized name without changing classification or style", async () => {
  const t = await convexAccounting(modules);
  const w = await createOwnedWorkspace(t);
  const first = await t.action(api.accounting.createUserCategory, {
    workspaceId: w.id,
    selection: custom("Café"),
  });
  expect(
    await t.action(api.accounting.createUserCategory, {
      workspaceId: w.id,
      selection: custom(" CAFE "),
    }),
  ).toEqual(first);
  expect(
    await t.query(api.accounting.listUserCategories, { workspaceId: w.id }),
  ).toHaveLength(1);
  await expect(
    t.action(api.accounting.createUserCategory, {
      workspaceId: w.id,
      selection: custom("cafe", "receive"),
    }),
  ).rejects.toMatchObject({ data: { code: "category_name_conflict" } });
});

test("all category presets map to valid accounts in both supported templates", async () => {
  const t = await convexAccounting(modules);
  const presets = await t.query(api.accounting.listCategoryPresets, {});
  expect(presets.map((p) => p.id)).not.toContain("transfer");
  expect(presets.filter((p) => p.nature === "Expense")).toHaveLength(11);
  for (const template of ["co-puc-personal@1", "us-gaap-personal@1"]) {
    const w = await provisionWorkspace(t, {
      functionalCurrency: "USD",
      chartOfAccountsTemplate: template,
    });
    const catalog = await t.query(api.accounting.listCatalogAccounts, {
      workspaceId: w.id,
    });
    for (const preset of presets) {
      const result = await t.action(api.accounting.createUserCategory, {
        workspaceId: w.id,
        selection: { kind: "preset", presetId: preset.id, style },
      });
      if (result.kind !== "category") throw new Error("Expected category");
      expect(
        catalog.find(
          (account) =>
            account.code === result.category.defaultPostingAccountCode,
        )?.use,
      ).toBe(preset.nature === "Expense" ? "expense" : "income");
    }
  }
});

test("advanced override keeps the category but rejects an account from another recording flow", async () => {
  const t = await convexAccounting(modules);
  const w = await createOwnedWorkspace(t);
  const daily = await createDaily(t, w.id);
  const result = await t.action(api.accounting.createUserCategory, {
    workspaceId: w.id,
    selection: food,
  });
  if (result.kind !== "category") throw new Error("Expected category");
  const input = {
    ...groceries(w.id, daily.id),
    userCategoryId: result.category.id,
  };
  const posted = await t.action(api.accounting.recordCashExpense, {
    ...input,
    ledgerAccountCode: "512010",
  });
  expect(posted.lines[0]).toMatchObject({
    code: "512010",
    userCategoryName: "Food",
  });
  await expect(
    t.action(api.accounting.recordCashExpense, {
      ...input,
      idempotencyKey: "wrong-flow",
      ledgerAccountCode: "42959501",
    }),
  ).rejects.toMatchObject({ data: { code: "cash_expense_account_invalid" } });
});

test("custom category colors survive creation, restyling and category reads", async () => {
  const t = await convexAccounting(modules);
  const workspace = await createOwnedWorkspace(t);
  const result = await t.action(api.accounting.createUserCategory, {
    workspaceId: workspace.id,
    selection: { kind: "custom", name: "Weekend", answer: "spend", style: { emoji: "🎮", tone: "primary", color: "h270" } },
  });
  if (result.kind !== "category") throw new Error("Expected category");
  expect((await t.query(api.accounting.listUserCategories, { workspaceId: workspace.id }))[0].style)
    .toEqual({ emoji: "🎮", tone: "primary", color: "h270" });
  await t.action(api.accounting.restyleUserCategory, {
    workspaceId: workspace.id, categoryId: result.category.id,
    style: { emoji: "👩🏽‍💻", tone: "primary", color: "olive" },
  });
  expect((await t.query(api.accounting.listUserCategories, { workspaceId: workspace.id }))[0].style)
    .toEqual({ emoji: "👩🏽‍💻", tone: "primary", color: "olive" });
});
