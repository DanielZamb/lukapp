import { AccountingError } from "../errors";
import type { AccountingStore, StoredWorkspace } from "../types";
import { chartTemplate } from "../chartOfAccounts";

export async function categoryPostingCode(
  store: AccountingStore,
  workspace: StoredWorkspace,
  categoryId: string | undefined,
  use: "expense" | "income",
) {
  if (categoryId === undefined) return undefined;
  const category = await store.getCategory(categoryId);
  if (!category || category.workspaceId !== workspace.id)
    throw new AccountingError("category_not_found");
  if (!category.nature) throw new AccountingError("category_nature_required");
  if (category.nature !== (use === "expense" ? "Expense" : "Income"))
    throw new AccountingError("category_nature_mismatch");
  return (
    category.defaultPostingAccountCode ??
    chartTemplate(workspace.chartOfAccountsTemplate).defaults[use]
  );
}
