import { normalizeCategoryName } from "./policy";
import type { CategoryNature } from "./types";
import type { AccountingStore, StoredWorkspace } from "../types";

const accounts: Record<string, Record<CategoryNature, string>> = {
  "co-puc-personal@1": { Expense: "53959501", Income: "42959503" },
  "us-gaap-personal@1": { Expense: "6170", Income: "4970" },
};

export async function closingAdjustmentCategory(store: AccountingStore, workspace: StoredWorkspace, nature: CategoryNature, displayName?: string) {
  const code = accounts[workspace.chartOfAccountsTemplate]?.[nature];
  if (!code) throw new Error("Closing Adjustment accounts missing for template");
  const categories = await store.listCategories(workspace.id);
  const existing = categories.find(category => category.deletedAt === undefined && category.nature === nature
    && category.classification.kind === "fallback" && category.classification.version === "closing-adjustment@1"
    && category.defaultPostingAccountCode === code);
  if (existing) return existing;
  const base = displayName ?? (nature === "Expense" ? "Closing Adjustment (expense)" : "Closing Adjustment (income)");
  let name = base;
  let suffix = 2;
  while (categories.some(category => category.deletedAt === undefined && category.normalizedName === normalizeCategoryName(name)))
    name = `${base.slice(0, 80 - String(suffix).length - 1)} ${suffix++}`;
  return store.insertCategory({
    workspaceId: workspace.id, name, normalizedName: normalizeCategoryName(name), nature,
    natureSource: "preset", classification: { kind: "fallback", version: "closing-adjustment@1" },
    defaultPostingAccountCode: code, style: { emoji: "🧾", tone: nature === "Expense" ? "warning" : "positive" },
  });
}
