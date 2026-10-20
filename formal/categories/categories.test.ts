import { expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  convexAccounting,
  createDaily,
  groceries,
  provisionWorkspace,
  reverse,
} from "../../src/accounting/convexHarness";
import type { CategorySelection, CategoryStyle } from "../../src/accounting/categories/types";
import {
  canPostCategories,
  toggleCategory,
} from "../../apps/mobile/src/features/categories/transactionSelection";

const modules = import.meta.glob([
  "../../convex/**/*.{js,ts}",
  "!../../convex/**/*.test.ts",
  "!../../convex/**/*.d.ts",
]);
const initialStyle: CategoryStyle = { emoji: "☕", tone: "primary", color: "h270" };
const editedStyle: CategoryStyle = { emoji: "🍎", tone: "positive", color: "olive" };
const templates = ["co-puc-personal@1", "us-gaap-personal@1"];

function words<T>(alphabet: readonly T[], length: number): T[][] {
  if (!length) return [[]];
  return words(alphabet, length - 1).flatMap((prefix) =>
    alphabet.map((letter) => [...prefix, letter]),
  );
}

async function fixture(template: string) {
  const t = await convexAccounting(modules);
  const workspace = await provisionWorkspace(t, {
    functionalCurrency: "COP", chartOfAccountsTemplate: template,
  });
  const daily = await createDaily(t, workspace.id);
  const create = async (selection: CategorySelection, workspaceId = workspace.id) => {
    const result = await t.action(api.accounting.createUserCategory, { workspaceId, selection });
    if (result.kind !== "category") throw new Error("Expected a flow category");
    return result.category;
  };
  const read = () => t.query(api.accounting.listUserCategories, { workspaceId: workspace.id });
  const money = () => t.run(async (ctx) => ({
    entries: await ctx.db.query("journalEntries").collect(),
    lines: await ctx.db.query("journalLines").collect(),
  }));
  return { t, workspace, daily, create, read, money };
}

test.each(templates)("P1 four explicit answers preserve money and route correctly in %s", async (template) => {
  const s = await fixture(template);
  const names = ["Café", "Arriendo", "Savings", "Unknown weekend"];
  const before = await s.money();
  for (const name of names) {
    for (const answer of ["spend", "receive", "stillMine", "payDebt"] as const) {
      const workspace = await provisionWorkspace(s.t, {
        functionalCurrency: "COP", chartOfAccountsTemplate: template,
      });
      const result = await s.t.action(api.accounting.createUserCategory, {
        workspaceId: workspace.id,
        selection: { kind: "custom", name, answer, style: initialStyle },
      });
      const rows = await s.t.query(api.accounting.listUserCategories, { workspaceId: workspace.id });
      if (answer === "stillMine" || answer === "payDebt") {
        expect(result, `${name}/${answer}`).toEqual({ kind: "accountSetupRequired", name, answer });
        expect(rows).toEqual([]);
      } else {
        expect(result.kind).toBe("category");
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ name, nature: answer === "spend" ? "Expense" : "Income" });
        const catalog = await s.t.query(api.accounting.listCatalogAccounts, { workspaceId: workspace.id });
        expect(catalog.find((account) => account.code === rows[0]?.resolvedPostingAccountCode)?.use)
          .toBe(answer === "spend" ? "expense" : "income");
      }
      expect(await s.money()).toEqual(before);
    }
  }
});

const operations = ["retry", "conflict", "restyle", "read", "post"] as const;
test.each(templates)("P2 all 125 three-operation histories preserve identity, classification and posted money in %s", async (template) => {
  for (const history of words([...operations], 3)) {
    const s = await fixture(template);
    const original = await s.create({ kind: "custom", name: "Café", answer: "spend", style: initialStyle });
    let expectedStyle = initialStyle;
    let posted = false;
    let immutableMoney = await s.money();
    const input = { ...groceries(s.workspace.id, s.daily.id), userCategoryId: original.id };
    for (const operation of history) {
      const trace = history.join(" -> ");
      if (operation === "retry") {
        expect(await s.create({ kind: "custom", name: " CAFE ", answer: "spend", style: initialStyle }), trace)
          .toEqual({ ...original, style: expectedStyle });
      } else if (operation === "conflict") {
        await expect(s.create({ kind: "custom", name: "cafe", answer: "receive", style: editedStyle }))
          .rejects.toMatchObject({ data: { code: "category_name_conflict" } });
      } else if (operation === "restyle") {
        await s.t.action(api.accounting.restyleUserCategory, {
          workspaceId: s.workspace.id, categoryId: original.id, style: editedStyle,
        });
        expectedStyle = editedStyle;
      } else if (operation === "post") {
        const result = await s.t.action(api.accounting.recordCashExpense, input);
        expect(result.replay, trace).toBe(posted);
        expect(result.lines.map((line) => [line.debitMinorUnits, line.creditMinorUnits]), trace)
          .toEqual([[150000, 0], [0, 150000]]);
        if (!posted) immutableMoney = await s.money();
        posted = true;
      }
      expect(await s.read(), trace).toEqual([{
        ...original, style: expectedStyle, resolvedPostingAccountCode: original.defaultPostingAccountCode,
      }]);
      expect(await s.money(), trace).toEqual(immutableMoney);
      const activity = await s.t.query(api.accounting.postedActivity, { workspaceId: s.workspace.id, month: "2026-09" });
      expect(activity.monthSpendMinorUnits, trace).toBe(posted ? 150000 : 0);
      expect(activity.rows, trace).toHaveLength(posted ? 1 : 0);
    }
  }
});

test("P3 reads and edits stay within the requested workspace", async () => {
  const s = await fixture("co-puc-personal@1");
  const other = await provisionWorkspace(s.t, { functionalCurrency: "COP" });
  const own = await s.create({ kind: "custom", name: "Own", answer: "spend", style: initialStyle });
  const foreign = await s.create({ kind: "custom", name: "Foreign", answer: "spend", style: initialStyle }, other.id);
  const before = await s.money();
  await expect(s.t.action(api.accounting.restyleUserCategory, {
    workspaceId: s.workspace.id, categoryId: foreign.id, style: editedStyle,
  })).rejects.toMatchObject({ data: { code: "category_not_found" } });
  await expect(s.t.action(api.accounting.updateUserCategory, {
    workspaceId: s.workspace.id, categoryId: foreign.id, name: "Changed", style: editedStyle,
  })).rejects.toMatchObject({ data: { code: "category_not_found" } });
  await expect(s.t.action(api.accounting.deleteUserCategory, {
    workspaceId: s.workspace.id, categoryId: foreign.id,
  })).rejects.toMatchObject({ data: { code: "category_not_found" } });
  expect((await s.read()).map((category) => category.id)).toEqual([own.id]);
  expect(await s.t.query(api.accounting.listUserCategories, { workspaceId: other.id }))
    .toEqual([{ ...foreign, resolvedPostingAccountCode: foreign.defaultPostingAccountCode }]);
  expect(await s.money()).toEqual(before);
});

test.each(["out", "in"] as const)("P4 public %s posting checks every list of up to four IDs from the bounded category domain", async (direction) => {
  const s = await fixture("co-puc-personal@1");
  const a = await s.create({ kind: "preset", presetId: direction === "out" ? "groceries" : "salary", style: initialStyle });
  const b = await s.create({ kind: "preset", presetId: direction === "out" ? "dining" : "gifts", style: initialStyle });
  const opposite = await s.create({ kind: "custom", name: "Opposite", answer: direction === "out" ? "receive" : "spend", style: initialStyle });
  const other = await provisionWorkspace(s.t, { functionalCurrency: "COP" });
  const foreign = await s.create({ kind: "custom", name: "Foreign", answer: direction === "out" ? "spend" : "receive", style: initialStyle }, other.id);
  const domain = [a.id, b.id, opposite.id, foreign.id, ""];
  const write = direction === "out" ? api.accounting.recordCashExpense : api.accounting.recordCashIncome;
  let before = await s.money();
  let checked = 0;
  let accepted = 0;
  for (let length = 0; length <= 4; length++) {
    for (const ids of words(domain, length)) {
      for (const primary of [undefined, a.id, b.id, foreign.id]) {
        checked++;
        let error: string | null = null;
        if (ids.length > 3) error = "category_limit_exceeded";
        else if (ids.includes("") || new Set(ids).size !== ids.length) error = "category_selection_invalid";
        else if (primary !== undefined && !ids.includes(primary)) error = "category_primary_invalid";
        else {
          for (const id of [...ids].sort()) {
            if (id === foreign.id) { error = "category_not_found"; break; }
            if (id === opposite.id) { error = "category_nature_mismatch"; break; }
          }
          if (!error && ids.includes(a.id) && ids.includes(b.id) && !primary) error = "category_primary_required";
        }
        const args = {
          ...groceries(s.workspace.id, s.daily.id),
          idempotencyKey: `bounded-${checked}`,
          userCategoryIds: ids,
          ...(primary !== undefined ? { primaryUserCategoryId: primary } : {}),
        };
        const trace = JSON.stringify({ ids, primary, error });
        if (error) {
          await expect(s.t.action(write, args), trace)
            .rejects.toMatchObject({ data: { code: error } });
        } else {
          const entry = await s.t.action(write, args);
          const bSelected = primary === b.id || (ids.length === 1 && ids[0] === b.id);
          const expectedCode = direction === "out"
            ? bSelected ? "519560" : ids.length ? "51959501" : "51959595"
            : bSelected ? "42959502" : ids.length ? "42959501" : "42959595";
          expect(entry.lines.map((line) => [line.code, line.debitMinorUnits, line.creditMinorUnits]), trace)
            .toEqual(direction === "out"
              ? [[expectedCode, 150000, 0], ["11100501", 0, 150000]]
              : [["11100501", 150000, 0], [expectedCode, 0, 150000]]);
          expect(await s.t.action(write, { ...args, userCategoryIds: [...ids].reverse() }))
            .toEqual({ ...entry, replay: true });
          accepted++;
          before = await s.money();
          expect(before.entries).toHaveLength(accepted);
          expect(before.lines).toHaveLength(accepted * 2);
        }
        expect(await s.money(), trace).toEqual(before);
      }
    }
  }
  expect(checked).toBe(3124);
});

test("P4b four otherwise valid local expense IDs and ambiguous scalar/array shapes cannot post", async () => {
  const s = await fixture("co-puc-personal@1");
  const ids: string[] = [];
  for (const name of ["One", "Two", "Three", "Four"]) {
    ids.push((await s.create({ kind: "custom", name, answer: "spend", style: initialStyle })).id);
  }
  const before = await s.money();
  await expect(s.t.action(api.accounting.recordCashExpense, {
    ...groceries(s.workspace.id, s.daily.id), userCategoryIds: ids,
  })).rejects.toMatchObject({ data: { code: "category_limit_exceeded" } });
  await expect(s.t.action(api.accounting.recordCashExpense, {
    ...groceries(s.workspace.id, s.daily.id), userCategoryIds: [], userCategoryId: ids[0],
  })).rejects.toMatchObject({ data: { code: "category_selection_invalid" } });
  expect(await s.money()).toEqual(before);
});

test("P5 picker toggle histories preserve the three-category bound and primary membership", () => {
  const domain = ["a", "b", "c", "d"];
  let checked = 0;
  for (const history of words(domain, 5)) {
    for (const primary of [null, "a", "b", "c"]) {
      let selection = { ids: ["a", "b", "c"], primaryId: primary };
      for (const id of history) {
        const before = structuredClone(selection);
        const next = toggleCategory(selection, id);
        expect(selection).toEqual(before);
        if (next) {
          expect(next.ids.length).toBeLessThanOrEqual(3);
          expect(new Set(next.ids).size).toBe(next.ids.length);
          expect(next.primaryId === null || next.ids.includes(next.primaryId)).toBe(true);
          const expectedMembers = new Set(before.ids);
          if (expectedMembers.has(id)) expectedMembers.delete(id); else expectedMembers.add(id);
          expect(new Set(next.ids)).toEqual(expectedMembers);
          selection = next;
        } else {
          expect(before.ids).toHaveLength(3);
          expect(before.ids).not.toContain(id);
        }
        checked++;
      }
    }
  }
  expect(checked).toBe(20480);
});

test("P6 picker admission agrees with the public selection contract on all reachable bounded input shapes", () => {
  // This pure function only receives the projected IDs and posting codes, not nature or workspace.
  const classified = [
    { id: "a", resolvedPostingAccountCode: "51959501" },
    { id: "b", resolvedPostingAccountCode: "519560" },
  ];
  let checked = 0;
  for (let length = 0; length <= 3; length++) {
    for (const ids of words(["a", "b", "missing"], length)) {
      if (new Set(ids).size !== ids.length) continue;
      for (const primaryId of [null, "a", "b", "missing"]) {
        if (primaryId !== null && !ids.includes(primaryId)) continue;
        for (const loaded of [true, false]) {
          checked++;
          const value = { ids, primaryId };
          const valid = (!ids.length || (loaded && ids.every((id) => id !== "missing"))) &&
            (!(ids.includes("a") && ids.includes("b")) || primaryId !== null);
          expect(canPostCategories(value, loaded ? classified : undefined), JSON.stringify({ value, loaded }))
            .toBe(valid);
        }
      }
    }
  }
  expect(checked).toBe(98);
});

test("P7 all sixteen first-setup answer pairs either commit once or roll back completely", async () => {
  for (const answers of words(["spend", "receive", "stillMine", "payDebt"] as const, 2)) {
    const t = await convexAccounting(modules);
    const categories: CategorySelection[] = answers.map((answer, index) => ({
      kind: "custom", name: `Setup ${index}`, answer, style: initialStyle,
    }));
    const args = {
      functionalCurrency: "COP", startingMinorUnits: 0,
      timeZone: "America/Bogota", categories,
    };
    const trace = answers.join(" -> ");
    if (answers.includes("stillMine") || answers.includes("payDebt")) {
      await expect(t.action(api.accounting.ensurePersonalDefaults, args), trace)
        .rejects.toMatchObject({ data: { code: "account_setup_required" } });
      expect(await t.query(api.accounting.personalDefaults, {}), trace).toBeNull();
      expect(await t.run(async (ctx) => ({
        categories: await ctx.db.query("userCategories").collect(),
        workspaces: await ctx.db.query("workspaces").collect(),
        profiles: await ctx.db.query("financialAccountProfiles").collect(),
        defaults: await ctx.db.query("personalDefaults").collect(),
      })), trace).toEqual({ categories: [], workspaces: [], profiles: [], defaults: [] });
    } else {
      const first = await t.action(api.accounting.ensurePersonalDefaults, args);
      expect(await t.action(api.accounting.ensurePersonalDefaults, args), trace).toEqual(first);
      expect((await t.query(api.accounting.listUserCategories, { workspaceId: first.workspace.id }))
        .map((category) => [category.name, category.nature]), trace)
        .toEqual(answers.map((answer, index) => [`Setup ${index}`, answer === "spend" ? "Expense" : "Income"]));
    }
    expect(await t.run(async (ctx) => ({
      entries: await ctx.db.query("journalEntries").collect(),
      lines: await ctx.db.query("journalLines").collect(),
    })), trace).toEqual({ entries: [], lines: [] });
  }
});

test("P8 all 24 rename-delete-read-post orders preserve money and historical category identities", async () => {
  const operations = ["rename", "delete", "read", "post"] as const;
  const histories = words(operations, 4).filter((history) => new Set(history).size === 4);
  expect(histories).toHaveLength(24);
  for (const history of histories) {
    const s = await fixture("co-puc-personal@1");
    const original = await s.create({ kind: "custom", name: "Café", answer: "spend", style: initialStyle });
    const input = { ...groceries(s.workspace.id, s.daily.id), userCategoryId: original.id };
    await s.t.action(api.budget.setCategoryLimit, {
      workspaceId: s.workspace.id, categoryId: original.id, effectiveMonth: "2026-09",
      limit: { currency: "COP", minorUnits: 200000 }, expectedRevisionId: null, idempotencyKey: "bounded-budget",
    });
    const revisions = await s.t.run((ctx) => ctx.db.query("budgetLimitRevisions").collect());
    let deleted = false;
    let postedId: string | null = null;
    let renamed = false;
    let money = await s.money();
    for (const operation of history) {
      const trace = history.join(" -> ");
      if (operation === "rename") {
        const update = s.t.action(api.accounting.updateUserCategory, {
          workspaceId: s.workspace.id, categoryId: original.id, name: "Weekend", style: editedStyle,
        });
        if (deleted) await expect(update, trace).rejects.toMatchObject({ data: { code: "category_not_found" } });
        else {
          expect(await update, trace).toEqual({ ...original, name: "Weekend", normalizedName: "weekend", style: editedStyle });
          renamed = true;
        }
      } else if (operation === "delete") {
        const args = { workspaceId: s.workspace.id, categoryId: original.id };
        expect(await s.t.action(api.accounting.deleteUserCategory, args), trace).toBeNull();
        expect(await s.t.action(api.accounting.deleteUserCategory, args), trace).toBeNull();
        deleted = true;
      } else if (operation === "post") {
        if (deleted) await expect(s.t.action(api.accounting.recordCashExpense, input), trace)
          .rejects.toMatchObject({ data: { code: "category_not_found" } });
        else {
          const entry = await s.t.action(api.accounting.recordCashExpense, input);
          postedId = entry.id;
          money = await s.money();
          expect(entry.lines.map((line) => [line.debitMinorUnits, line.creditMinorUnits]), trace)
            .toEqual([[150000, 0], [0, 150000]]);
        }
      }
      expect(await s.money(), trace).toEqual(money);
      const active = await s.read();
      expect(active.map((category) => [category.id, category.name, category.nature, category.defaultPostingAccountCode]), trace)
        .toEqual(deleted ? [] : [[original.id, renamed ? "Weekend" : "Café", "Expense", "519560"]]);
      const budget = await s.t.query(api.budget.evaluate, { workspaceId: s.workspace.id, month: "2026-09" });
      expect(budget.jars, trace).toHaveLength(deleted ? 0 : 1);
      expect(await s.t.run((ctx) => ctx.db.query("budgetLimitRevisions").collect()), trace).toEqual(revisions);
    }
    const fresh = await s.create({ kind: "custom", name: "Café", answer: "spend", style: initialStyle });
    expect(fresh.id).not.toBe(original.id);
    expect((await s.read()).map((category) => category.id)).toEqual([fresh.id]);
    if (postedId) {
      expect(await s.t.action(api.accounting.recordCashExpense, input)).toMatchObject({ id: postedId, replay: true });
      expect(await s.money()).toEqual(money);
      const entries = await s.t.query(api.accounting.listJournalEntries, { workspaceId: s.workspace.id });
      expect(entries[0]?.lines[0]?.userCategoryName).toBe(renamed ? "Weekend" : "Café");
      await reverse(s.t, s.workspace.id, postedId);
      const after = await s.money();
      expect(after.entries.find((entry) => entry._id === postedId)).toEqual(money.entries[0]);
      expect(after.lines.filter((line) => line.journalEntryId === postedId)).toEqual(money.lines);
    }
  }
});
