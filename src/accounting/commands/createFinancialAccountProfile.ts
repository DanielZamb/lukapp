import { requireMember, toProfile } from "../helpers";
import type {
  AccountingStore,
  Actor,
  FinancialAccountProfile,
} from "../types";

export async function createFinancialAccountProfile(
  store: AccountingStore,
  input: { actor: Actor; workspaceId: string; name: string },
): Promise<FinancialAccountProfile> {
  await requireMember(store, input.workspaceId, input.actor);
  const postingAccount = await store.insertLedgerAccount({
    workspaceId: input.workspaceId,
    name: input.name,
  });
  const profile = await store.insertProfile({
    workspaceId: input.workspaceId,
    name: input.name,
    postingAccountId: postingAccount.id,
  });
  return toProfile(profile);
}
