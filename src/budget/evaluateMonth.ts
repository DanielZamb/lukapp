import { BudgetError, currentBudgetMonth, effectiveRevision, requireMonth } from "./policy";
import type { BudgetReadStore } from "./types";

export async function evaluateMonth(store: BudgetReadStore, input: { month: string; now: number }) {
  requireMonth(input.month);
  const [currency, timeZone, revisions, categories, consumption] = await Promise.all([
    store.functionalCurrency(), store.timeZone(), store.listRevisions(), store.listCategories(),
    store.categoryConsumption(input.month),
  ]);
  const expenseCategories = categories.filter((category) => category.nature === "Expense" && category.deletedAt === undefined)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const effective = new Map([...new Set(revisions.map((revision) => revision.categoryId))]
    .map((categoryId) => [categoryId, effectiveRevision(revisions.filter((revision) => revision.categoryId === categoryId), input.month)]));
  const totals = new Map(consumption.categories.map((category) => [category.categoryId, category.minorUnits]));
  const jars = expenseCategories.flatMap((category) => {
    const revision = effective.get(category.id);
    if (!revision || revision.kind === "remove") return [];
    const consumed = totals.get(category.id) ?? 0;
    if (!Number.isSafeInteger(consumed) || !Number.isSafeInteger(revision.limitMinorUnits - consumed))
      throw new BudgetError("amount_out_of_range");
    return [{
      category: { id: category.id, name: category.name, emoji: category.emoji },
      revisionId: revision.id, limitMinorUnits: revision.limitMinorUnits,
      consumptionMinorUnits: consumed,
    }];
  });
  return {
    month: input.month, currentMonth: currentBudgetMonth(input.now, timeZone), currency,
    totalsOverlap: true as const, jars,
    removedLimits: [...effective.values()].flatMap((revision) => revision?.kind === "remove" ? [{
      categoryId: revision.categoryId, revisionId: revision.id, effectiveMonth: revision.effectiveMonth,
    }] : []).sort((a, b) => a.categoryId.localeCompare(b.categoryId)),
    availableCategories: expenseCategories.filter((category) => !jars.some((jar) => jar.category.id === category.id))
      .map((category) => ({ id: category.id, name: category.name, emoji: category.emoji })),
  };
}
