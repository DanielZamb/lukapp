import { AccountingError } from "../errors";
import { comparableName, hasVisibleText } from "../names";
import { requireWorkspace } from "../membership";
import { toProfile } from "../views";
import type { AccountingStore, Actor } from "../types";

export async function renameAccount(store: AccountingStore, input: {
  actor: Actor;
  workspaceId: string;
  financialAccountProfileId: string;
  name: string;
  expectedName: string;
}) {
  await requireWorkspace(store, input.workspaceId, input.actor);
  const profile = await store.getProfile(input.financialAccountProfileId);
  if (!profile || profile.workspaceId !== input.workspaceId)
    throw new AccountingError("financial_account_profile_not_found");
  const name = input.name.trim();
  if (!hasVisibleText(name)) throw new AccountingError("name_required");
  if (name.length > 80) throw new AccountingError("account_name_too_long");
  if (name === profile.name) return toProfile(profile);
  if (input.expectedName !== profile.name) throw new AccountingError("account_name_stale");
  if ((await store.listProfiles(input.workspaceId)).some((other) =>
    other.id !== profile.id && comparableName(other.name) === comparableName(name)))
    throw new AccountingError("account_name_conflict");
  return toProfile(await store.renameProfile(profile.id, name));
}
