import { requireWorkspace } from "../membership";
import type { AccountingStore, Actor, LedgerAccountView } from "../types";
import { byCode } from "../views";

/** The Workspace's activated Chart of Accounts in code order, for advanced views. */
export async function listLedgerAccounts(
  store: AccountingStore,
  input: { actor: Actor; workspaceId: string },
): Promise<LedgerAccountView[]> {
  await requireWorkspace(store, input.workspaceId, input.actor);
  const [accounts, profiles] = await Promise.all([
    store.listLedgerAccounts(input.workspaceId),
    store.listProfiles(input.workspaceId),
  ]);
  const profileByAccount = new Map(
    profiles.map((profile) => [profile.postingAccountId, profile.id]),
  );
  return accounts.sort(byCode).map((account) => {
    const view: LedgerAccountView = {
      id: account.id,
      code: account.code,
      name: account.name,
      nature: account.nature,
      normalSide: account.normalSide,
      role: account.role,
    };
    const profileId = profileByAccount.get(account.id);
    if (profileId) {
      view.financialAccountProfileId = profileId;
    }
    return view;
  });
}
