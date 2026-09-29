import { requireWorkspace } from "../membership";
import type { AccountingStore, Actor, LedgerAccountView } from "../types";

/** The Chart of Accounts behind the profiles, for advanced views. */
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
  return accounts.map((account) => {
    const view: LedgerAccountView = {
      id: account.id,
      name: account.name,
      nature: account.nature,
      role: account.role,
    };
    if (account.systemKey) {
      view.systemKey = account.systemKey;
    }
    const profileId = profileByAccount.get(account.id);
    if (profileId) {
      view.financialAccountProfileId = profileId;
    }
    return view;
  });
}
