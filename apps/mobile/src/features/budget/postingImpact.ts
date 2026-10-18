import type { BudgetJar } from "./model";

export function postingBudgetImpact({
  jars,
  categoryIds,
  expenseMinorUnits,
}: {
  jars: BudgetJar[];
  categoryIds: string[];
  expenseMinorUnits: number;
}) {
  return jars.flatMap((jar) => {
    const remaining = jar.limitMinorUnits - jar.consumptionMinorUnits;
    return categoryIds.includes(jar.category.id) &&
      remaining >= 0 && expenseMinorUnits > remaining
      ? [{ category: jar.category, overMinorUnits: expenseMinorUnits - remaining }]
      : [];
  });
}

export type PostingBudgetImpact = ReturnType<typeof postingBudgetImpact>;
