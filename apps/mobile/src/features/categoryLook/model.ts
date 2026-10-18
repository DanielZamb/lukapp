import { monthOverview } from "../overview/model";

export function categoryLook({ categoryId, ...input }: Parameters<typeof monthOverview>[0] & { categoryId: string }) {
  const overview = monthOverview(input);
  const category = overview.categories.find((item) => item.id === categoryId);
  if (!category) return null;
  const recent = input.entries
    .filter((entry) => !entry.reversesEntryId && !entry.reversedByEntryId)
    .map((entry) => ({
      id: entry.id,
      description: entry.description,
      date: entry.accountingDate,
      postedAt: entry.postedAt,
      minorUnits: entry.lines.reduce((total, line) => total + (
        line.nature === "Expense" && line.userCategories.some((item) => item.id === categoryId)
          ? line.debitMinorUnits - line.creditMinorUnits : 0
      ), 0),
    }))
    .filter((item) => item.minorUnits > 0)
    .sort((a, b) => b.date.localeCompare(a.date) || b.postedAt - a.postedAt || a.id.localeCompare(b.id))
    .slice(0, 3);
  return { ...category, currency: overview.currency, recent };
}

export type CategoryLookData = NonNullable<ReturnType<typeof categoryLook>>;
