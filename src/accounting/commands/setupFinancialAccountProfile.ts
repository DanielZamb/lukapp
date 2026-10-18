import { AccountingError } from "../errors";
import { requireWorkspace } from "../membership";
import type {
  AccountingClock,
  AccountingStore,
  AccountSetupInput,
  AccountSetupResult,
} from "../types";
import { journalContext, toPostedJournalEntry, toProfile } from "../views";
import { createFinancialAccountProfile } from "./createFinancialAccountProfile";
import { recordOpeningPosition } from "./recordOpeningPosition";

export async function setupFinancialAccountProfile(
  store: AccountingStore,
  clock: AccountingClock,
  input: AccountSetupInput,
): Promise<AccountSetupResult> {
  const workspace = await requireWorkspace(
    store,
    input.workspaceId,
    input.actor,
  );
  if (!input.idempotencyKey)
    throw new AccountingError("idempotency_key_required");
  const previous = await store.findAccountSetup(
    workspace.id,
    input.idempotencyKey,
  );
  if (previous) {
    if (
      previous.name !== input.name.trim() ||
      previous.productKind !== input.productKind ||
      previous.emoji !== input.emoji ||
      previous.accountingDate !== input.accountingDate ||
      previous.amount.currency !== input.amount.currency ||
      previous.amount.minorUnits !== input.amount.minorUnits
    )
      throw new AccountingError("account_setup_conflict");
    const profile = await store.getProfile(previous.financialAccountProfileId);
    if (!profile)
      throw new AccountingError("financial_account_profile_not_found");
    const entry = previous.openingJournalEntryId
      ? await store.getJournalEntry(previous.openingJournalEntryId)
      : undefined;
    const reversal = entry ? await store.findReversalOf(entry.id) : undefined;
    return {
      financialAccountProfile: toProfile(profile),
      openingEntry: entry
        ? await toPostedJournalEntry(
            store,
            await journalContext(store, workspace),
            entry,
            {
              replay: true,
              ...(reversal ? { reversedByEntryId: reversal.id } : {}),
            },
          )
        : null,
      replay: true,
    };
  }
  if (
    await store.findJournalEntryByIdempotencyKey(
      workspace.id,
      input.idempotencyKey,
    )
  )
    throw new AccountingError("idempotency_key_conflict");
  const financialAccountProfile = await createFinancialAccountProfile(
    store,
    input,
  );
  const openingEntry = await recordOpeningPosition(store, clock, {
    ...input,
    financialAccountProfileId: financialAccountProfile.id,
    description: "Starting amount",
  });
  await store.insertAccountSetup({
    workspaceId: workspace.id,
    name: input.name.trim(),
    productKind: input.productKind,
    ...(input.emoji ? { emoji: input.emoji } : {}),
    amount: input.amount,
    accountingDate: input.accountingDate,
    idempotencyKey: input.idempotencyKey,
    financialAccountProfileId: financialAccountProfile.id,
    ...(openingEntry ? { openingJournalEntryId: openingEntry.id } : {}),
  });
  return { financialAccountProfile, openingEntry, replay: false };
}
