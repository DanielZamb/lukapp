import { periodFromAccountingDate } from "../period";
import { listJournalEntries } from "./listJournalEntries";
import { listUserCategories } from "./listUserCategories";
import { requireWorkspace } from "../membership";
import type { AccountingStore, Actor } from "../types";

/** Management totals overlap; never add them to derive overall spending. */
export async function categoryTotals(
  store: AccountingStore,
  input: { actor: Actor; workspaceId: string; month: string },
) {
  periodFromAccountingDate(`${input.month}-01`);
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor);
  const [categories, entries] = await Promise.all([
    listUserCategories(store, input),
    listJournalEntries(store, input),
  ]);
  const totals = new Map<string, number>();
  for (const entry of entries) {
    if (entry.accountingDate.slice(0, 7) !== input.month) continue;
    for (const line of entry.lines) {
      const amount = line.nature === "Expense"
        ? line.debitMinorUnits - line.creditMinorUnits
        : line.nature === "Revenue"
          ? line.creditMinorUnits - line.debitMinorUnits
          : 0;
      for (const category of line.userCategories)
        totals.set(category.id, (totals.get(category.id) ?? 0) + amount);
    }
  }
  return {
    totalsOverlap: true as const,
    month: input.month,
    currency: workspace.functionalCurrency,
    categories: categories.map((category) => ({
      categoryId: category.id,
      name: category.name,
      nature: category.nature,
      minorUnits: totals.get(category.id) ?? 0,
    })),
  };
}
