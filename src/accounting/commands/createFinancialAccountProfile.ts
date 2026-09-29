import { classifyFinancialAccountProfile } from "../classification";
import { AccountingError } from "../errors";
import { requireWorkspace } from "../membership";
import type {
  AccountingStore,
  Actor,
  FinancialAccountProfile,
  FinancialAccountProductKind,
} from "../types";
import { toProfile } from "../views";

export async function createFinancialAccountProfile(
  store: AccountingStore,
  input: {
    actor: Actor;
    workspaceId: string;
    name: string;
    productKind: FinancialAccountProductKind;
  },
): Promise<FinancialAccountProfile> {
  await requireWorkspace(store, input.workspaceId, input.actor);
  const name = input.name.trim();
  if (!name) {
    throw new AccountingError("name_required");
  }
  const classified = classifyFinancialAccountProfile(input.productKind);
  const postingAccount = await store.insertLedgerAccount({
    workspaceId: input.workspaceId,
    name,
    nature: classified.nature,
    role: "Posting",
  });
  const profile = await store.insertProfile({
    workspaceId: input.workspaceId,
    name,
    productKind: classified.productKind,
    classificationPolicy: classified.policy,
    postingAccountId: postingAccount.id,
  });
  return toProfile(profile);
}
