import { BudgetError, currentBudgetMonth, effectiveRevision, requireMonth } from "./policy";
import type { BudgetReadStore } from "./types";

export async function evaluateMonth(store: BudgetReadStore, input: { month: string; now: number }) {
  requireMonth(input.month);
  const [currency, revisions, categories, consumption] = await Promise.all([
    store.functionalCurrency(), store.listRevisions(), store.listCategories(), store.categoryConsumption(input.month),
  ]);
  const expenseCategories = categories.filter((category) => category.nature === "Expense")
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const totals = new Map(consumption.categories.map((category) => [category.categoryId, category.minorUnits]));
  const jars = expenseCategories.flatMap((category) => {
    const revision = effectiveRevision(revisions.filter((revision) => revision.categoryId === category.id), input.month);
    const consumed = totals.get(category.id) ?? 0;
    if (revision && (!Number.isSafeInteger(consumed) || !Number.isSafeInteger(revision.limitMinorUnits - consumed)))
      throw new BudgetError("amount_out_of_range");
    return revision ? [{
      category: { id: category.id, name: category.name, emoji: category.emoji },
      revisionId: revision.id, limitMinorUnits: revision.limitMinorUnits,
      consumptionMinorUnits: consumed,
    }] : [];
  });
  return {
    month: input.month, currentMonth: currentBudgetMonth(input.now), currency,
    totalsOverlap: true as const, jars,
    availableCategories: expenseCategories.filter((category) => !jars.some((jar) => jar.category.id === category.id))
      .map((category) => ({ id: category.id, name: category.name, emoji: category.emoji })),
  };
}
