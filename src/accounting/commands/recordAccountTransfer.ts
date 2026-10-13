import { AccountingError } from "../errors";
import { requireWorkspace } from "../membership";
import { requireFunctionalAmount } from "../money";
import { requireProfile } from "../financialAccountProfiles";
import { postJournalEntry } from "../posting";
import type {
  AccountingClock,
  AccountingStore,
  AccountTransferInput,
  PostedJournalEntry,
} from "../types";
import { journalContext, toPostedJournalEntry } from "../views";

export async function recordAccountTransfer(
  store: AccountingStore,
  clock: AccountingClock,
  input: AccountTransferInput,
): Promise<PostedJournalEntry> {
  const workspace = await requireWorkspace(
    store,
    input.workspaceId,
    input.actor,
    "post",
  );
  const amount = requireFunctionalAmount(workspace, input.amount);
  if (
    input.sourceFinancialAccountProfileId ===
    input.destinationFinancialAccountProfileId
  )
    throw new AccountingError("account_transfer_same_profile");
  const source = await requireProfile(
    store,
    input.workspaceId,
    input.sourceFinancialAccountProfileId,
  );
  const destination = await requireProfile(
    store,
    input.workspaceId,
    input.destinationFinancialAccountProfileId,
  );
  const { entry, replay } = await postJournalEntry(store, clock, {
    actor: input.actor,
    workspaceId: input.workspaceId,
    draft: {
      policy: "account-transfer@1",
      financialAccountProfileId: source.id,
      accountingDate: input.accountingDate,
      description: input.description,
      idempotencyKey: input.idempotencyKey,
      lines: [
        {
          ledgerAccountId: destination.postingAccountId,
          debitMinorUnits: amount,
          creditMinorUnits: 0,
        },
        {
          ledgerAccountId: source.postingAccountId,
          debitMinorUnits: 0,
          creditMinorUnits: amount,
        },
      ],
    },
  });
  const reversal = await store.findReversalOf(entry.id);
  return toPostedJournalEntry(
    store,
    await journalContext(store, workspace),
    entry,
    {
      replay,
      ...(reversal ? { reversedByEntryId: reversal.id } : {}),
    },
  );
}
