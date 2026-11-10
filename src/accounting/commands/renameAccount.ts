import { AccountingError } from "../errors";
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
  if (!name) throw new AccountingError("name_required");
  if (name === profile.name) return toProfile(profile);
  if (input.expectedName !== profile.name) throw new AccountingError("account_name_stale");
  const normalized = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if ((await store.listProfiles(input.workspaceId)).some((other) =>
    other.id !== profile.id && normalized(other.name) === normalized(name)))
    throw new AccountingError("account_name_conflict");
  return toProfile(await store.renameProfile(profile.id, name));
}
