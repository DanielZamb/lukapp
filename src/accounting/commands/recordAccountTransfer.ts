import { AccountingError } from "../errors";
import { requireWorkspace } from "../membership";
import { requireFunctionalAmount } from "../money";
import { postJournalEntry } from "../posting";
import type {
  AccountingClock,
  AccountingStore,
  AccountTransferInput,
} from "../types";
import { journalContext, toPostedJournalEntry } from "../views";
import { requireCategoryAssignments } from "../categories/assignments";

export async function recordAccountTransfer(
  store: AccountingStore,
  clock: AccountingClock,
  input: AccountTransferInput,
) {
  const workspace = await requireWorkspace(
    store,
    input.workspaceId,
    input.actor,
  );
  if (
    input.sourceFinancialAccountProfileId ===
    input.destinationFinancialAccountProfileId
  )
    throw new AccountingError("transfer_profiles_must_differ");
  const amount = requireFunctionalAmount(workspace, input.amount);
  const categoryIds = requireCategoryAssignments(input);
  const source = await store.getProfile(input.sourceFinancialAccountProfileId);
  const destination = await store.getProfile(
    input.destinationFinancialAccountProfileId,
  );
  if (
    !source ||
    !destination ||
    source.workspaceId !== workspace.id ||
    destination.workspaceId !== workspace.id
  )
    throw new AccountingError("financial_account_profile_not_found");
  const { entry, replay } = await postJournalEntry(store, clock, {
    actor: input.actor,
    workspaceId: workspace.id,
    draft: {
      policy: "account-transfer@1",
      accountingDate: input.accountingDate,
      description: input.description,
      idempotencyKey: input.idempotencyKey,
      financialAccountProfileId: source.id,
      lines: [
        {
          ledgerAccountId: destination.postingAccountId,
          debitMinorUnits: amount,
          creditMinorUnits: 0,
        },
        {
          ledgerAccountId: source.postingAccountId,
          ...(categoryIds.length ? { userCategoryIds: categoryIds } : {}),
          ...(input.primaryUserCategoryId
            ? { primaryUserCategoryId: input.primaryUserCategoryId }
            : {}),
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
