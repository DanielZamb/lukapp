import { AccountingError } from "../errors";
import { requireWorkspace } from "../membership";
import { periodFromAccountingDate } from "../period";
import { earliestPermittedDate } from "../periodControl";
import { postJournalEntry } from "../posting";
import type {
  AccountingClock,
  AccountingStore,
  Actor,
  PostedJournalEntry,
} from "../types";
import { journalContext, toPostedJournalEntry } from "../views";

/**
 * Append-only correction: a new Posted entry that mirrors every line of the original,
 * so the pair nets to zero and the original stays untouched. Record a Replacement
 * Entry afterwards when the correct treatment is a different amount or account.
 *
 * Without an explicit date the reversal takes the original Accounting Date, or the
 * first day of the next unlocked period when the original's period is Locked.
 */
export async function reversePostedEntry(
  store: AccountingStore,
  clock: AccountingClock,
  input: {
    actor: Actor;
    workspaceId: string;
    journalEntryId: string;
    accountingDate?: string;
    description?: string;
    idempotencyKey: string;
  },
): Promise<PostedJournalEntry> {
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor);
  const original = await store.getJournalEntry(input.journalEntryId);
  if (!original || original.workspaceId !== input.workspaceId) {
    throw new AccountingError("journal_entry_not_found");
  }
  if (original.reversesEntryId) {
    throw new AccountingError("reversal_cannot_be_reversed");
  }
  const earlier = await store.findReversalOf(original.id);
  if (earlier && earlier.idempotencyKey !== input.idempotencyKey) {
    throw new AccountingError("journal_entry_already_reversed");
  }
  const accountingDate =
    input.accountingDate ??
    earlier?.accountingDate ??
    (await earliestPermittedDate(store, input.workspaceId, original.accountingDate));
  periodFromAccountingDate(accountingDate);
  if (accountingDate < original.accountingDate) {
    throw new AccountingError("reversal_date_before_original");
  }
  const draft = {
    accountingDate,
    description: input.description ?? `Reversal: ${original.description}`,
    idempotencyKey: input.idempotencyKey,
    policy: "reversal@1" as const,
    reversesEntryId: original.id,
    lines: original.lines.map((line) => ({
      ledgerAccountId: line.ledgerAccountId,
      debitMinorUnits: line.creditMinorUnits,
      creditMinorUnits: line.debitMinorUnits,
    })),
  };
  const { entry, replay } = await postJournalEntry(store, clock, {
    actor: input.actor,
    workspaceId: input.workspaceId,
    draft: original.financialAccountProfileId
      ? { ...draft, financialAccountProfileId: original.financialAccountProfileId }
      : draft,
  });
  return toPostedJournalEntry(store, await journalContext(store, workspace), entry, {
    replay,
  });
}
