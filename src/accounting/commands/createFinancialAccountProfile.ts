import { chartTemplate, nextAuxiliaryCode, normalSideOf } from "../chartOfAccounts";
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

/** Each profile gets its own auxiliary Posting Account, as a bookkeeper opens one per bank account. */
export async function createFinancialAccountProfile(
  store: AccountingStore,
  input: {
    actor: Actor;
    workspaceId: string;
    name: string;
    productKind: FinancialAccountProductKind;
  },
): Promise<FinancialAccountProfile> {
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor);
  const name = input.name.trim();
  if (!name) {
    throw new AccountingError("name_required");
  }
  const classified = classifyFinancialAccountProfile(
    chartTemplate(workspace.chartOfAccountsTemplate),
    input.productKind,
  );
  const postingAccount = await store.insertLedgerAccount({
    workspaceId: input.workspaceId,
    code: await nextAuxiliaryCode(store, input.workspaceId, classified.parentCode),
    name,
    nature: classified.nature,
    normalSide: normalSideOf(classified.nature),
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
