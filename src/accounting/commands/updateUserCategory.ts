import { normalizeCategoryName } from "../categories/policy";
import type { CategoryStyle } from "../categories/types";
import { AccountingError } from "../errors";
import { requireWorkspace } from "../membership";
import type { AccountingStore, Actor } from "../types";

export async function updateUserCategory(store: AccountingStore, input: {
  actor: Actor; workspaceId: string; categoryId: string; name: string; style: CategoryStyle;
}) {
  await requireWorkspace(store, input.workspaceId, input.actor);
  const category = await store.getCategory(input.categoryId);
  if (!category || category.workspaceId !== input.workspaceId || category.deletedAt !== undefined)
    throw new AccountingError("category_not_found");
  const name = input.name.trim();
  if (!name) throw new AccountingError("name_required");
  if (name.length > 80) throw new AccountingError("category_name_too_long");
  const normalizedName = normalizeCategoryName(name);
  if ((await store.listCategories(input.workspaceId)).some((other) =>
    other.id !== category.id && other.deletedAt === undefined && other.normalizedName === normalizedName,
  )) throw new AccountingError("category_name_conflict");
  return store.updateCategory(category.id, { name, normalizedName, style: input.style });
}
