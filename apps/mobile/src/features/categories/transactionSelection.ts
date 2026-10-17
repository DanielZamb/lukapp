export type TransactionCategories = { ids: string[]; primaryId: string | null };
type Classification = { id: string; resolvedPostingAccountCode?: string };

export function needsPrimary(ids: string[], categories: Classification[]) {
  return new Set(
    categories.filter((category) => ids.includes(category.id))
      .map((category) => category.resolvedPostingAccountCode),
  ).size > 1;
}

export function canPostCategories(
  selection: TransactionCategories,
  categories: Classification[] | undefined,
) {
  if (!selection.ids.length) return true;
  if (
    !categories ||
    !selection.ids.every((id) => categories.some((category) =>
      category.id === id && category.resolvedPostingAccountCode !== undefined,
    ))
  ) return false;
  return (
    !needsPrimary(selection.ids, categories) ||
    (selection.primaryId !== null && selection.ids.includes(selection.primaryId))
  );
}

export function toggleCategory(
  selection: TransactionCategories,
  id: string,
): TransactionCategories | null {
  const ids = selection.ids.includes(id)
    ? selection.ids.filter((selected) => selected !== id)
    : [...selection.ids, id];
  if (ids.length > 3) return null;
  return {
    ids,
    primaryId: selection.primaryId && ids.includes(selection.primaryId)
      ? selection.primaryId
      : null,
  };
}
