import { commandIdentity } from "./commandIdentity";
import { assertOpeningDates } from "./openingDate";
import { AccountingError } from "./errors";
import { requireWorkspace } from "./membership";
import { periodFromAccountingDate } from "./period";
import { requirePostablePeriod } from "./periodControl";
import type {
  AccountingClock,
  AccountingStore,
  Actor,
  DraftJournalLine,
  JournalEntryDraft,
  StoredJournalEntry,
} from "./types";

export type PostingResult = {
  entry: StoredJournalEntry;
  replay: boolean;
};

export async function postJournalEntry(
  store: AccountingStore,
  clock: AccountingClock,
  input: { actor: Actor; workspaceId: string; draft: JournalEntryDraft },
): Promise<PostingResult> {
  const { draft } = input;
  await requireWorkspace(store, input.workspaceId, input.actor, "post");
  if (!draft.idempotencyKey) {
    throw new AccountingError("idempotency_key_required");
  }
  const existing = await store.findJournalEntryByIdempotencyKey(
    input.workspaceId,
    draft.idempotencyKey,
  );
  if (existing) {
    if (!sameDraft(existing, draft)) {
      throw new AccountingError("idempotency_key_conflict");
    }
    return { entry: existing, replay: true };
  }
  if (
    await store.findOpeningPositionByKey(
      input.workspaceId,
      draft.idempotencyKey,
    )
  ) {
    throw new AccountingError("idempotency_key_conflict");
  }
  assertBalancedLines(draft.lines);
  await assertPostingAccounts(store, input.workspaceId, draft.lines);
  await assertLinkedRecords(store, input.workspaceId, draft);
  const period = periodFromAccountingDate(draft.accountingDate);
  await assertOpeningDates(store, input.workspaceId, draft);
  await requirePostablePeriod(store, input.workspaceId, draft.accountingDate);
  const entry = await store.insertJournalEntry({
    ...draft,
    workspaceId: input.workspaceId,
    period,
    postedBy: input.actor.userId,
    postedAt: clock.now().getTime(),
  });
  return { entry, replay: false };
}

/** Minimum completeness, one positive side per line, and debits equal to credits. */
export function assertBalancedLines(lines: DraftJournalLine[]): void {
  if (lines.length < 2) {
    throw new AccountingError("journal_entry_incomplete");
  }
  let debit = 0;
  let credit = 0;
  for (const line of lines) {
    const { debitMinorUnits: d, creditMinorUnits: c } = line;
    if (
      !Number.isSafeInteger(d) ||
      !Number.isSafeInteger(c) ||
      d < 0 ||
      c < 0 ||
      d > 0 === c > 0
    ) {
      throw new AccountingError("journal_line_invalid");
    }
    debit += d;
    credit += c;
  }
  if (!Number.isSafeInteger(debit) || debit !== credit) {
    throw new AccountingError("posted_journal_entry_unbalanced");
  }
}

async function assertPostingAccounts(
  store: AccountingStore,
  workspaceId: string,
  lines: DraftJournalLine[],
): Promise<void> {
  for (const line of lines) {
    const account = await store.getLedgerAccount(line.ledgerAccountId);
    if (!account || account.workspaceId !== workspaceId) {
      throw new AccountingError("ledger_account_not_found");
    }
  }
}

async function assertLinkedRecords(
  store: AccountingStore,
  workspaceId: string,
  draft: JournalEntryDraft,
): Promise<void> {
  for (const effect of draft.sourceExpenseEffects ?? []) {
    const source = await store.getJournalEntry(effect.sourceEntryId);
    if (!source || source.workspaceId !== workspaceId || (source.policy !== "cash-expense@1" && source.policy !== "cash-income@1"))
      throw new AccountingError("journal_entry_not_found");
    if (!Number.isSafeInteger(effect.expenseDeltaMinorUnits)) throw new AccountingError("journal_line_invalid");
  }
  for (const line of draft.lines) {
    if (line.category) {
      const category = await store.getCategory(line.category.categoryId);
      if (!category || category.workspaceId !== workspaceId) throw new AccountingError("category_not_found");
    }
    for (const ref of line.categoryCorrection?.sources ?? []) {
      const source = await store.getJournalEntry(ref.entryId);
      if (!source || source.workspaceId !== workspaceId || !source.lines[ref.lineNumber]) throw new AccountingError("journal_entry_not_found");
    }
  }
  if (draft.financialAccountProfileId !== undefined) {
    const profile = await store.getProfile(draft.financialAccountProfileId);
    if (!profile || profile.workspaceId !== workspaceId) {
      throw new AccountingError("financial_account_profile_not_found");
    }
  }
  if (draft.reversesEntryId !== undefined) {
    const reversed = await store.getJournalEntry(draft.reversesEntryId);
    if (!reversed || reversed.workspaceId !== workspaceId) {
      throw new AccountingError("journal_entry_not_found");
    }
  }
}

function sameDraft(
  entry: StoredJournalEntry,
  draft: JournalEntryDraft,
): boolean {
  return (
    entry.accountingDate === draft.accountingDate &&
    entry.description === draft.description &&
    entry.policy === draft.policy &&
    commandIdentity(entry.cashCategoryInput) === commandIdentity(draft.cashCategoryInput) &&
    commandIdentity(entry.sourceExpenseEffects) === commandIdentity(draft.sourceExpenseEffects) &&
    entry.financialAccountProfileId === draft.financialAccountProfileId &&
    entry.reversesEntryId === draft.reversesEntryId &&
    entry.lines.length === draft.lines.length &&
    entry.lines.every((line, index) => {
      const other = draft.lines[index];
      return (
        other !== undefined &&
        commandIdentity(line.category) === commandIdentity(other.category) &&
        commandIdentity(line.categoryCorrection) === commandIdentity(other.categoryCorrection) &&
        line.ledgerAccountId === other.ledgerAccountId &&
        line.debitMinorUnits === other.debitMinorUnits &&
        line.creditMinorUnits === other.creditMinorUnits
      );
    })
  );
}
