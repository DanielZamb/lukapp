import { AccountingError } from "../errors";

export const maxTransactionCategories = 3;

export type CategoryAssignments = {
  /** Read compatibility for immutable single-category entries and saved retries. */
  userCategoryId?: string;
  userCategoryIds?: string[];
  primaryUserCategoryId?: string;
};

export function assignedCategoryIds(input: CategoryAssignments): string[] {
  return input.userCategoryIds ?? (input.userCategoryId ? [input.userCategoryId] : []);
}

export function requireCategoryAssignments(input: CategoryAssignments): string[] {
  if (input.userCategoryId !== undefined && input.userCategoryIds !== undefined)
    throw new AccountingError("category_selection_invalid");
  const ids = assignedCategoryIds(input);
  if (ids.length > maxTransactionCategories)
    throw new AccountingError("category_limit_exceeded");
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length)
    throw new AccountingError("category_selection_invalid");
  if (
    input.primaryUserCategoryId !== undefined &&
    !ids.includes(input.primaryUserCategoryId)
  )
    throw new AccountingError("category_primary_invalid");
  return [...ids].sort();
}

export function sameCategoryAssignments(
  a: CategoryAssignments,
  b: CategoryAssignments,
) {
  const left = [...assignedCategoryIds(a)].sort();
  const right = [...assignedCategoryIds(b)].sort();
  return (
    a.primaryUserCategoryId === b.primaryUserCategoryId &&
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  );
}
