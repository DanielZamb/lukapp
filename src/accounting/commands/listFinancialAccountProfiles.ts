import { requireMember, toProfile } from "../helpers";
import type {
  AccountingStore,
  Actor,
  FinancialAccountProfile,
} from "../types";

export async function listFinancialAccountProfiles(
  store: AccountingStore,
  input: { actor: Actor; workspaceId: string },
): Promise<FinancialAccountProfile[]> {
  await requireMember(store, input.workspaceId, input.actor);
  const profiles = await store.listProfiles(input.workspaceId);
  return profiles.map(toProfile);
}
