import { AccountingError } from "../errors";
import { requireWorkspace } from "../membership";
import {
  accountForConcept,
  categoryPolicyVersion,
  normalizeCategoryName,
  requireCategoryPreset,
  resolveCategoryAccount,
  suggestCategoryNature,
} from "../categories/policy";
import type {
  CreateCategoryInput,
  CreateCategoryResult,
  UserCategory,
} from "../categories/types";
import type { AccountingStore } from "../types";

export async function createUserCategory(
  store: AccountingStore,
  input: CreateCategoryInput,
): Promise<CreateCategoryResult> {
  const workspace = await requireWorkspace(
    store,
    input.workspaceId,
    input.actor,
  );
  const { selection } = input;
  const name =
    selection.kind === "preset"
      ? requireCategoryPreset(selection.presetId).name
      : selection.name.trim();
  if (!name) throw new AccountingError("name_required");
  if (
    selection.kind === "custom" &&
    (selection.answer === "stillMine" || selection.answer === "payDebt")
  ) {
    return { kind: "accountSetupRequired", answer: selection.answer, name };
  }
  const nature =
    selection.kind === "preset"
      ? requireCategoryPreset(selection.presetId).nature
      : selection.answer === "spend"
        ? "Expense"
        : "Income";
  const resolved = resolveCategoryAccount(
    name,
    nature,
    workspace.chartOfAccountsTemplate,
  );
  const category: Omit<UserCategory, "id"> = {
    workspaceId: workspace.id,
    name,
    normalizedName: normalizeCategoryName(name),
    nature,
    natureSource:
      selection.kind === "preset"
        ? "preset"
        : suggestCategoryNature(name).suggested === selection.answer
          ? "lexiconConfirmed"
          : "answered",
    defaultPostingAccountCode:
      selection.kind === "preset"
        ? accountForConcept(
            selection.presetId,
            workspace.chartOfAccountsTemplate,
          )
        : resolved.code,
    classification:
      selection.kind === "preset"
        ? { kind: "preset", concept: selection.presetId }
        : resolved.concept
          ? {
              kind: "lexicon",
              concept: resolved.concept,
              version: categoryPolicyVersion,
            }
          : { kind: "fallback", version: categoryPolicyVersion },
    style: selection.style,
  };
  const existing = (await store.listCategories(workspace.id)).find(
    (c) => c.normalizedName === category.normalizedName,
  );
  if (existing) {
    if (
      existing.nature !== nature ||
      existing.defaultPostingAccountCode !== category.defaultPostingAccountCode
    )
      throw new AccountingError("category_name_conflict");
    return { kind: "category", category: existing };
  }
  return { kind: "category", category: await store.insertCategory(category) };
}
