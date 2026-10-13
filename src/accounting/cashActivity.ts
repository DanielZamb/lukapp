import { commandIdentity } from "./commandIdentity";
import { resolveCashCategory } from "./cashCategory";
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
 * The counterpart is the template account for `ledgerAccountCode`, or the template
 * default, and its template use must match the flow: an expense for money out,
 * income for money in.
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
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor, "post");
  const amount = requireFunctionalAmount(workspace, input.amount);
  const profile = await store.getProfile(input.financialAccountProfileId);
  if (!profile || profile.workspaceId !== input.workspaceId) {
    throw new AccountingError("financial_account_profile_not_found");
  }
  const cashCategoryInput = input.userCategoryId === undefined ? undefined : {
    userCategoryId: input.userCategoryId,
    ...(input.categoryRevision !== undefined ? { categoryRevision: input.categoryRevision } : {}),
    ...(input.ledgerAccountCode !== undefined ? { ledgerAccountCode: input.ledgerAccountCode } : {}),
  };
  const existing = await store.findJournalEntryByIdempotencyKey(input.workspaceId, input.idempotencyKey);
  if (existing && commandIdentity(existing.cashCategoryInput) !== commandIdentity(cashCategoryInput))
    throw new AccountingError("idempotency_key_conflict");
  const saved = existing?.lines.find(line => line.category)?.category;
  if (existing && input.userCategoryId !== undefined && (!saved || saved.categoryId !== input.userCategoryId))
    throw new AccountingError("idempotency_key_conflict");
  const category = await resolveCashCategory(store, input, treatment.counterpart, saved);
  const counterpart = await requireTemplateAccount(
    store,
    workspace,
    treatment.counterpart,
    input.ledgerAccountCode ?? category?.account.accountCode,
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
      ...(cashCategoryInput ? { cashCategoryInput } : {}),
      financialAccountProfileId: profile.id,
      lines: [
        { ledgerAccountId: debitAccountId, debitMinorUnits: amount, creditMinorUnits: 0,
          ...(category && treatment.direction === "out" ? { category } : {}) },
        { ledgerAccountId: creditAccountId, debitMinorUnits: 0, creditMinorUnits: amount,
          ...(category && treatment.direction === "in" ? { category } : {}) },
      ],
    },
  });
  const reversal = await store.findReversalOf(entry.id);
  return toPostedJournalEntry(store, await journalContext(store, workspace), entry, {
    replay,
    ...(reversal ? { reversedByEntryId: reversal.id } : {}),
  });
}
