import {
  chartTemplate,
  nextAuxiliaryCode,
  normalSideOf,
} from "../chartOfAccounts";
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
    idempotencyKey?: string;
  },
): Promise<FinancialAccountProfile> {
  const workspace = await requireWorkspace(
    store,
    input.workspaceId,
    input.actor,
    "prepare",
  );
  const name = input.name.trim();
  if (!name) {
    throw new AccountingError("name_required");
  }
  if (input.idempotencyKey !== undefined) {
    if (!input.idempotencyKey)
      throw new AccountingError("idempotency_key_required");
    const existing = await store.findProfileBySetupKey(
      input.workspaceId,
      input.idempotencyKey,
    );
    if (existing) {
      if (existing.name !== name || existing.productKind !== input.productKind)
        throw new AccountingError("idempotency_key_conflict");
      return toProfile(store, existing);
    }
  }
  const classified = classifyFinancialAccountProfile(
    chartTemplate(workspace.chartOfAccountsTemplate),
    input.productKind,
  );
  const postingAccount = await store.insertLedgerAccount({
    workspaceId: input.workspaceId,
    code: await nextAuxiliaryCode(
      store,
      input.workspaceId,
      classified.parentCode,
    ),
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
    ...(input.idempotencyKey !== undefined
      ? { setupIdempotencyKey: input.idempotencyKey }
      : {}),
  });
  return toProfile(store, profile);
}
