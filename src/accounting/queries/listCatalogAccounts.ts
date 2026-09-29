import { catalogView, chartTemplate } from "../chartOfAccounts";
import { requireWorkspace } from "../membership";
import type { AccountingStore, Actor, CatalogAccountView } from "../types";

/** Template accounts the Workspace can record against, such as the expense picker's choices. */
export async function listCatalogAccounts(
  store: AccountingStore,
  input: { actor: Actor; workspaceId: string },
): Promise<CatalogAccountView[]> {
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor);
  return catalogView(
    chartTemplate(workspace.chartOfAccountsTemplate),
    await store.listLedgerAccounts(input.workspaceId),
  );
}
