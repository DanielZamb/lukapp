import { createFinancialAccountProfile } from "./createFinancialAccountProfile";
import { recordOpeningPosition } from "./recordOpeningPosition";
import { AccountingError } from "../errors";
import { requireWorkspace } from "../membership";
import type {
  AccountingClock,
  AccountingStore,
  OpeningPositionResult,
  SetupFinancialAccountInput,
} from "../types";

export async function setupFinancialAccount(
  store: AccountingStore,
  clock: AccountingClock,
  input: SetupFinancialAccountInput,
): Promise<OpeningPositionResult> {
  await requireWorkspace(store, input.workspaceId, input.actor, "post");
  if (!input.idempotencyKey)
    throw new AccountingError("idempotency_key_required");
  const existing = await store.findProfileBySetupKey(
    input.workspaceId,
    input.idempotencyKey,
  );
  if (
    !existing &&
    ((await store.findOpeningPositionByKey(
      input.workspaceId,
      input.idempotencyKey,
    )) ||
      (await store.findJournalEntryByIdempotencyKey(
        input.workspaceId,
        input.idempotencyKey,
      )))
  ) {
    throw new AccountingError("idempotency_key_conflict");
  }
  const profile = await createFinancialAccountProfile(store, input);
  return recordOpeningPosition(store, clock, {
    ...input,
    financialAccountProfileId: profile.id,
  });
}
