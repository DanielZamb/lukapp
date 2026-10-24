import { AccountingError } from "../errors";
import { requireWorkspace } from "../membership";
import type { CategoryStyle } from "../categories/types";
import type { AccountingStore, Actor } from "../types";

export async function restyleUserCategory(
  store: AccountingStore,
  input: {
    actor: Actor;
    workspaceId: string;
    categoryId: string;
    style: CategoryStyle;
  },
) {
  await requireWorkspace(store, input.workspaceId, input.actor);
  const category = await store.getCategory(input.categoryId);
  if (!category || category.workspaceId !== input.workspaceId || category.deletedAt !== undefined)
    throw new AccountingError("category_not_found");
  return store.restyleCategory(category.id, input.style);
}
