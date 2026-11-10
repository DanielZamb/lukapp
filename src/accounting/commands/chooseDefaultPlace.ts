import { AccountingError } from "../errors";
import { requireWorkspace } from "../membership";
import type { AccountingStore, Actor } from "../types";

export async function requireSelectableDefaultPlace(
  store: AccountingStore,
  input: { actor: Actor; workspaceId: string; financialAccountProfileId: string },
) {
  await requireWorkspace(store, input.workspaceId, input.actor);
  const profile = await store.getProfile(input.financialAccountProfileId);
  if (!profile || profile.workspaceId !== input.workspaceId)
    throw new AccountingError("financial_account_profile_not_found");
  return profile;
}
