import { requireWorkspace } from "../membership";
import type { AccountingStore, Actor } from "../types";

export async function listUserCategories(
  store: AccountingStore,
  input: { actor: Actor; workspaceId: string },
) {
  await requireWorkspace(store, input.workspaceId, input.actor);
  return (await store.listCategories(input.workspaceId)).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}
