import { AccountingError } from "../errors";
import { requireWorkspace } from "../membership";
import { toProfile } from "../views";
import type { AccountingStore, Actor } from "../types";

export async function changeAccountLook(store: AccountingStore, input: {
  actor: Actor;
  workspaceId: string;
  financialAccountProfileId: string;
  emoji: string;
}) {
  await requireWorkspace(store, input.workspaceId, input.actor);
  const profile = await store.getProfile(input.financialAccountProfileId);
  if (!profile || profile.workspaceId !== input.workspaceId)
    throw new AccountingError("financial_account_profile_not_found");
  const emoji = [...input.emoji.trim()][0];
  if (!emoji) throw new AccountingError("account_emoji_required");
  return toProfile(await store.restyleProfile(profile.id, emoji));
}
