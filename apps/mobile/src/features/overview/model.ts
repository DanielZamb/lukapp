import type { FunctionReturnType } from "convex/server";
import type { api } from "../api";

type Entries = FunctionReturnType<typeof api.accounting.listJournalEntries>;
type Categories = FunctionReturnType<typeof api.accounting.listUserCategories>;
type Budget = FunctionReturnType<typeof api.budget.evaluate>;

export type OverviewCategory = Pick<Categories[number], "id" | "name" | "style"> & {
  spendMinorUnits: number;
  limitMinorUnits: number | null;
};

export function monthOverview({ month, entries, categories, budget }: {
  month: string; entries: Entries; categories: Categories; budget: Budget;
}) {
  let outMinorUnits = 0;
  let inMinorUnits = 0;
  const spend = new Map<string, number>();
  for (const entry of entries) {
    if (entry.accountingDate.slice(0, 7) !== month) continue;
    for (const line of entry.lines) {
      if (line.nature === "Revenue") inMinorUnits += line.creditMinorUnits - line.debitMinorUnits;
      if (line.nature !== "Expense") continue;
      const amount = line.debitMinorUnits - line.creditMinorUnits;
      outMinorUnits += amount;
      for (const category of line.userCategories) {
        spend.set(category.id, (spend.get(category.id) ?? 0) + amount);
      }
    }
  }
  const limits = new Map(budget.jars.map((jar) => [jar.category.id, jar.limitMinorUnits]));
  return {
    currency: budget.currency,
    outMinorUnits,
    inMinorUnits,
    categories: categories.filter((category) => category.nature === "Expense").map((category): OverviewCategory => ({
      id: category.id, name: category.name, style: category.style,
      spendMinorUnits: spend.get(category.id) ?? 0,
      limitMinorUnits: limits.get(category.id) ?? null,
    })).sort((a, b) => b.spendMinorUnits - a.spendMinorUnits || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
  };
}

export type MonthOverview = ReturnType<typeof monthOverview>;

export function remaining(category: OverviewCategory) {
  return category.limitMinorUnits === null ? null : category.limitMinorUnits - category.spendMinorUnits;
}

export function remainingFill(category: OverviewCategory) {
  const left = remaining(category);
  return left === null || category.limitMinorUnits === null || category.limitMinorUnits <= 0
    ? 0 : Math.max(0, Math.min(1, left / category.limitMinorUnits));
}
