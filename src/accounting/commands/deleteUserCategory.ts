import { AccountingError } from "../errors";
import { requireWorkspace } from "../membership";
import type { AccountingClock, AccountingStore, Actor } from "../types";

export async function deleteUserCategory(store: AccountingStore, clock: AccountingClock, input: {
  actor: Actor; workspaceId: string; categoryId: string;
}) {
  await requireWorkspace(store, input.workspaceId, input.actor);
  const category = await store.getCategory(input.categoryId);
  if (!category || category.workspaceId !== input.workspaceId)
    throw new AccountingError("category_not_found");
  if (category.deletedAt === undefined) await store.deleteCategory(category.id, clock.now().getTime());
}
