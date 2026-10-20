import { AccountingError } from "../errors";
import type { AccountingStore, StoredWorkspace } from "../types";
import { chartTemplate } from "../chartOfAccounts";
import type { UserCategory } from "./types";
import { requireCategoryAssignments, type CategoryAssignments } from "./assignments";

export function categoryDefaultCode(workspace: StoredWorkspace, category: UserCategory) {
  if (!category.nature) throw new AccountingError("category_nature_required");
  return category.defaultPostingAccountCode ?? chartTemplate(workspace.chartOfAccountsTemplate)
    .defaults[category.nature === "Expense" ? "expense" : "income"];
}

export async function categoryPostingCode(
  store: AccountingStore,
  workspace: StoredWorkspace,
  selection: CategoryAssignments,
  use: "expense" | "income",
  allowDeleted = false,
) {
  const ids = requireCategoryAssignments(selection);
  const codes = new Map<string, string>();
  for (const id of ids) {
    const category = await store.getCategory(id);
    if (!category || category.workspaceId !== workspace.id)
      throw new AccountingError("category_not_found");
    if (category.deletedAt !== undefined && !allowDeleted)
      throw new AccountingError("category_not_found");
    if (!category.nature) throw new AccountingError("category_nature_required");
    if (category.nature !== (use === "expense" ? "Expense" : "Income"))
      throw new AccountingError("category_nature_mismatch");
    codes.set(id, categoryDefaultCode(workspace, category));
  }
  if (new Set(codes.values()).size > 1 && !selection.primaryUserCategoryId)
    throw new AccountingError("category_primary_required");
  return selection.primaryUserCategoryId
    ? codes.get(selection.primaryUserCategoryId)
    : codes.values().next().value;
}
