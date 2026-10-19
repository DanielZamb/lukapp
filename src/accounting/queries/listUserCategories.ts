import { requireWorkspace } from "../membership";
import { categoryDefaultCode } from "../categories/posting";
import type { AccountingStore, Actor } from "../types";

export async function listUserCategories(
  store: AccountingStore,
  input: { actor: Actor; workspaceId: string },
) {
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor);
  return (await store.listCategories(input.workspaceId)).sort((a, b) =>
    a.name.localeCompare(b.name),
  ).map((category) => ({
    ...category,
    ...(category.nature ? { resolvedPostingAccountCode: categoryDefaultCode(workspace, category) } : {}),
  }));
}
