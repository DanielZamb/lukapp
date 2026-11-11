import { expect, test } from "vitest";
import { evaluateMonth } from "./evaluateMonth";
import { currentBudgetMonth, effectiveRevision } from "./policy";
import { changeCategoryLimit, setCategoryLimit } from "./setCategoryLimit";
import type { BudgetCategory, BudgetRevision, BudgetWriteStore, ChangeCategoryLimit } from "./types";

function fixture() {
  const revisions: BudgetRevision[] = [];
  const categories: BudgetCategory[] = [{ id: "food", name: "Food", emoji: "🍋", nature: "Expense" }];
  const consumption = new Map<string, number>();
  const store: BudgetWriteStore = {
    functionalCurrency: async () => "COP", timeZone: async () => "America/Bogota",
    listRevisions: async () => revisions, listCategories: async () => categories,
    categoryConsumption: async (month) => ({ categories: [{ categoryId: "food", minorUnits: consumption.get(month) ?? 0 }] }),
    findRequest: async (key) => revisions.find((revision) => revision.idempotencyKey === key) ?? null,
    insertRevision: async (revision) => {
      const saved = { ...revision, id: `revision-${revisions.length + 1}` };
      revisions.push(saved);
      return saved;
    },
  };
  const target = { workspaceId: "workspace", categoryId: "food", effectiveMonth: "2026-09",
    expectedRevisionId: null, idempotencyKey: "initial", actorId: "owner", now: Date.UTC(2026, 8, 17, 12) };
  return { store, target, revisions, categories, consumption,
    read: (month = "2026-09") => evaluateMonth(store, { month, now: target.now }) };
}

test.each(["remove", "spendNothing"] as const)("%s has a distinct receipt and preserves earlier evaluation", async (kind) => {
  const s = fixture();
  const original = await setCategoryLimit(s.store, { ...s.target, limit: { currency: "COP", minorUnits: 100 } });
  const september = await s.read();
  const input = { ...s.target, change: { kind }, effectiveMonth: "2026-10", now: Date.UTC(2026, 9, 17, 12),
    expectedRevisionId: original.revision.id, idempotencyKey: "change" };
  const saved = await changeCategoryLimit(s.store, input);
  expect(saved).toEqual({ replay: false, revision: {
    id: "revision-2", workspaceId: "workspace", categoryId: "food", effectiveMonth: "2026-10", kind,
    limitMinorUnits: 0, expectedRevisionId: "revision-1", sequence: 2, idempotencyKey: "change", createdBy: "owner", createdAt: input.now,
  } });
  expect(await s.read()).toEqual(september);
  const later = await s.read("2027-03");
  expect(later.jars).toEqual(kind === "remove" ? [] : [{ category: { id: "food", name: "Food", emoji: "🍋" },
    revisionId: "revision-2", limitMinorUnits: 0, consumptionMinorUnits: 0 }]);
  expect(later.removedLimits).toEqual(kind === "remove" ? [{ categoryId: "food", revisionId: "revision-2", effectiveMonth: "2026-10" }] : []);
  expect(await changeCategoryLimit(s.store, { ...input, now: Date.UTC(2027, 0, 2) })).toEqual({ ...saved, replay: true });
  await expect(changeCategoryLimit(s.store, { ...input, change: { kind: kind === "remove" ? "spendNothing" : "remove" } }))
    .rejects.toMatchObject({ code: "idempotency_key_conflict" });
  await expect(changeCategoryLimit(s.store, { ...input, idempotencyKey: "stale" })).rejects.toMatchObject({ code: "limit_changed" });
  await expect(changeCategoryLimit(s.store, { ...input, now: Date.UTC(2027, 0, 2), idempotencyKey: "late" }))
    .rejects.toMatchObject({ code: "month_changed" });
  expect(s.revisions).toHaveLength(2);
});

test.each([0, 17, -17])("spend-nothing evaluation preserves signed consumption %s", async (minorUnits) => {
  const s = fixture();
  await changeCategoryLimit(s.store, { ...s.target, change: { kind: "spendNothing" } });
  s.consumption.set("2026-09", minorUnits);
  expect((await s.read()).jars).toEqual([{ category: { id: "food", name: "Food", emoji: "🍋" },
    revisionId: "revision-1", limitMinorUnits: 0, consumptionMinorUnits: minorUnits }]);
  expect((await s.read("2026-10")).jars).toEqual([{ category: { id: "food", name: "Food", emoji: "🍋" },
    revisionId: "revision-1", limitMinorUnits: 0, consumptionMinorUnits: 0 }]);
});

test("remove then spend nothing starts a new stretch and does not fill its gap", async () => {
  const s = fixture();
  await expect(changeCategoryLimit(s.store, { ...s.target, change: { kind: "remove" } })).rejects.toMatchObject({ code: "limit_not_set" });
  const first = await setCategoryLimit(s.store, { ...s.target, limit: { currency: "COP", minorUnits: 100 } });
  const removed = await changeCategoryLimit(s.store, { ...s.target, change: { kind: "remove" }, idempotencyKey: "remove", expectedRevisionId: first.revision.id });
  await expect(changeCategoryLimit(s.store, { ...s.target, change: { kind: "remove" }, idempotencyKey: "remove-twice", expectedRevisionId: removed.revision.id }))
    .rejects.toMatchObject({ code: "limit_not_set" });
  const zero = await changeCategoryLimit(s.store, { ...s.target, change: { kind: "spendNothing" },
    effectiveMonth: "2026-11", now: Date.UTC(2026, 10, 17), expectedRevisionId: removed.revision.id, idempotencyKey: "zero" });
  expect(zero.revision.sequence).toBe(3);
  expect(await s.read("2026-10")).toMatchObject({ jars: [], removedLimits: [{ revisionId: "revision-2", effectiveMonth: "2026-09" }] });
  expect(await s.read("2026-11")).toMatchObject({ jars: [{ revisionId: "revision-3", limitMinorUnits: 0 }], removedLimits: [] });
});

test("zero as an amount is still refused; explicit acts retain the common guards", async () => {
  const s = fixture();
  await expect(setCategoryLimit(s.store, { ...s.target, limit: { currency: "COP", minorUnits: 0 } }))
    .rejects.toMatchObject({ code: "limit_must_be_positive" });
  for (const kind of ["remove", "spendNothing"] as const) {
    const input: ChangeCategoryLimit & { actorId: string; now: number } = { ...s.target, change: { kind } };
    for (const [change, code] of [
      [{ effectiveMonth: "2026-13" }, "month_invalid"],
      [{ effectiveMonth: "2026-08" }, "month_changed"],
      [{ effectiveMonth: "2026-10" }, "month_changed"],
      [{ idempotencyKey: " " }, "idempotency_key_invalid"],
      [{ idempotencyKey: "a".repeat(201) }, "idempotency_key_invalid"],
      [{ categoryId: "missing" }, "category_not_found"],
    ] as const) await expect(changeCategoryLimit(s.store, { ...input, ...change })).rejects.toMatchObject({ code });
  }
  expect(s.revisions).toEqual([]);
  const saved = await changeCategoryLimit(s.store, { ...s.target, change: { kind: "spendNothing" } });
  expect(saved.revision).toMatchObject({ kind: "spendNothing", limitMinorUnits: 0 });
});

test("month selection uses calendar time and revision sequence, including legacy rows", () => {
  expect(currentBudgetMonth(Date.UTC(2026, 9, 1, 2), "America/Bogota")).toBe("2026-09");
  const base: BudgetRevision = { id: "legacy", workspaceId: "workspace", categoryId: "food", effectiveMonth: "2026-09",
    limitMinorUnits: 100, sequence: 1, expectedRevisionId: null, idempotencyKey: "legacy", createdBy: "owner", createdAt: 0 };
  const removed: BudgetRevision = { ...base, id: "removed", kind: "remove", limitMinorUnits: 0, sequence: 2, expectedRevisionId: "legacy" };
  const zero: BudgetRevision = { ...base, id: "zero", kind: "spendNothing", effectiveMonth: "2026-11", limitMinorUnits: 0, sequence: 3, expectedRevisionId: "removed" };
  const unordered = [zero, base, removed];
  expect(effectiveRevision(unordered, "2026-08")).toBeNull();
  expect(effectiveRevision(unordered, "2026-10")).toEqual(removed);
  expect(effectiveRevision(unordered, "2026-11")).toEqual(zero);
  expect(effectiveRevision([base], "2026-09")).toEqual(base);
});

test("retirement hides a zero jar and still permits appending its removal", async () => {
  const s = fixture();
  const zero = await changeCategoryLimit(s.store, { ...s.target, change: { kind: "spendNothing" } });
  expect((await s.read()).jars).toMatchObject([{ limitMinorUnits: 0 }]);
  s.categories[0].deletedAt = s.target.now;
  expect((await s.read()).jars).toEqual([]);
  await expect(setCategoryLimit(s.store, { ...s.target, limit: { currency: "COP", minorUnits: 100 },
    expectedRevisionId: zero.revision.id, idempotencyKey: "resurrect" })).rejects.toMatchObject({ code: "category_not_found" });
  await changeCategoryLimit(s.store, { ...s.target, change: { kind: "remove" }, expectedRevisionId: zero.revision.id, idempotencyKey: "remove" });
  expect(await s.read()).toMatchObject({ jars: [], availableCategories: [], removedLimits: [{ categoryId: "food", revisionId: "revision-2" }] });
});

test("zero jars reject unsafe consumption while removed jars need no arithmetic", async () => {
  const s = fixture();
  const zero = await changeCategoryLimit(s.store, { ...s.target, change: { kind: "spendNothing" } });
  s.consumption.set("2026-09", Number.MAX_SAFE_INTEGER + 1);
  await expect(s.read()).rejects.toMatchObject({ code: "amount_out_of_range" });
  await changeCategoryLimit(s.store, { ...s.target, change: { kind: "remove" }, expectedRevisionId: zero.revision.id, idempotencyKey: "remove" });
  expect(await s.read()).toMatchObject({ jars: [], removedLimits: [{ revisionId: "revision-2" }] });
});
