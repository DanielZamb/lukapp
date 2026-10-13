import { categorySnapshot, requireCategory } from "./categories";
import { AccountingError } from "./errors";
import type { CategorySnapshot } from "./categoryTypes";
import type { AccountingStore, CashActivityInput } from "./types";

export async function resolveCashCategory(
  store: Pick<AccountingStore, "getCategory">,
  input: Pick<CashActivityInput, "workspaceId" | "userCategoryId" | "categoryRevision" | "ledgerAccountCode">,
  counterpart: "expense" | "income",
  recorded?: CategorySnapshot,
): Promise<CategorySnapshot | undefined> {
  if (input.userCategoryId === undefined) {
    if (input.categoryRevision !== undefined) throw new AccountingError("category_not_found");
    return undefined;
  }
  let category = recorded;
  if (!category) {
    const record = await requireCategory(store, input.workspaceId, input.userCategoryId);
    if (record.status !== "active") throw new AccountingError("category_inactive");
    category = categorySnapshot(record);
  }
  if (category.nature !== (counterpart === "expense" ? "Expense" : "Income"))
    throw new AccountingError("category_nature_mismatch");
  if (input.categoryRevision !== undefined && category.revision !== input.categoryRevision)
    throw new AccountingError("category_revision_stale");
  return { ...category, account: input.ledgerAccountCode !== undefined
    ? { kind: "advanced", accountCode: input.ledgerAccountCode } : category.account };
}
