import { AccountingError } from "./errors";
import type { AccountingStore, StoredProfile } from "./types";

export async function requireProfile(
  store: AccountingStore,
  workspaceId: string,
  profileId: string,
): Promise<StoredProfile> {
  const profile = await store.getProfile(profileId);
  if (!profile || profile.workspaceId !== workspaceId)
    throw new AccountingError("financial_account_profile_not_found");
  return profile;
}
