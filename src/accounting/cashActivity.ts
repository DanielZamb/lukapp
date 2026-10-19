import { categoryPostingCode } from "./categories/posting";
import { requireCategoryAssignments } from "./categories/assignments";
import { requireTemplateAccount } from "./chartOfAccounts";
import { AccountingError } from "./errors";
import { requireWorkspace } from "./membership";
import { requireFunctionalAmount } from "./money";
import { postJournalEntry } from "./posting";
import type {
  AccountingClock,
  AccountingStore,
  CashActivityInput,
  PostedJournalEntry,
  PostingPolicy,
} from "./types";
import { journalContext, toPostedJournalEntry } from "./views";

/**
 * Cash-style activity between a Financial Account Profile and one Chart of Accounts
 * counterpart. Money out credits the profile; money in debits it. The profile's
 * nature decides what that does to its balance, so a card purchase grows a Liability.
 * Categories overlap for management reporting. A mixed classification requires an
 * explicit selected primary to choose the one counterpart. Without categories the
 * template default applies. An advanced override must still match the recording use.
 */
export async function recordCashActivity(
  store: AccountingStore,
  clock: AccountingClock,
  input: CashActivityInput,
  treatment: {
    policy: PostingPolicy;
    direction: "out" | "in";
    counterpart: "expense" | "income";
  },
): Promise<PostedJournalEntry> {
  const workspace = await requireWorkspace(
    store,
    input.workspaceId,
    input.actor,
  );
  const amount = requireFunctionalAmount(workspace, input.amount);
  const profile = await store.getProfile(input.financialAccountProfileId);
  if (!profile || profile.workspaceId !== input.workspaceId) {
    throw new AccountingError("financial_account_profile_not_found");
  }
  const categoryCode = await categoryPostingCode(
    store,
    workspace,
    input,
    treatment.counterpart,
  );
  const categoryIds = requireCategoryAssignments(input);
  const categories = {
    ...(input.userCategoryId ? { userCategoryId: input.userCategoryId } : {}),
    ...(input.userCategoryIds ? { userCategoryIds: categoryIds } : {}),
    ...(input.primaryUserCategoryId ? { primaryUserCategoryId: input.primaryUserCategoryId } : {}),
  };
  const counterpart = await requireTemplateAccount(
    store,
    workspace,
    treatment.counterpart,
    input.ledgerAccountCode ?? categoryCode,
  );
  const debitAccountId =
    treatment.direction === "out" ? counterpart.id : profile.postingAccountId;
  const creditAccountId =
    treatment.direction === "out" ? profile.postingAccountId : counterpart.id;
  const { entry, replay } = await postJournalEntry(store, clock, {
    actor: input.actor,
    workspaceId: input.workspaceId,
    draft: {
      accountingDate: input.accountingDate,
      description: input.description,
      idempotencyKey: input.idempotencyKey,
      policy: treatment.policy,
      financialAccountProfileId: profile.id,
      lines: [
        {
          ledgerAccountId: debitAccountId,
          debitMinorUnits: amount,
          creditMinorUnits: 0,
          ...(treatment.direction === "out"
            ? categories
            : {}),
        },
        {
          ledgerAccountId: creditAccountId,
          debitMinorUnits: 0,
          creditMinorUnits: amount,
          ...(treatment.direction === "in"
            ? categories
            : {}),
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
