/* The one entry point that writes to the General Ledger. Commands build drafts; this recognizes them. */
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
  await requireWorkspace(store, input.workspaceId, input.actor);
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
  assertBalancedLines(draft.lines);
  await assertPostingAccounts(store, input.workspaceId, draft.lines);
  await assertLinkedRecords(store, input.workspaceId, draft);
  const period = periodFromAccountingDate(draft.accountingDate);
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
      (d > 0) === (c > 0)
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

/** Every line hits an existing account in this Workspace. All accounts are Posting Accounts until Summary Accounts exist. */
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

/** A draft may only link to a profile or an entry in its own Workspace. */
async function assertLinkedRecords(
  store: AccountingStore,
  workspaceId: string,
  draft: JournalEntryDraft,
): Promise<void> {
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

function sameDraft(entry: StoredJournalEntry, draft: JournalEntryDraft): boolean {
  return (
    entry.accountingDate === draft.accountingDate &&
    entry.description === draft.description &&
    entry.policy === draft.policy &&
    entry.financialAccountProfileId === draft.financialAccountProfileId &&
    entry.reversesEntryId === draft.reversesEntryId &&
    entry.lines.length === draft.lines.length &&
    entry.lines.every((line, index) => {
      const other = draft.lines[index];
      return (
        other !== undefined &&
        line.ledgerAccountId === other.ledgerAccountId &&
        line.debitMinorUnits === other.debitMinorUnits &&
        line.creditMinorUnits === other.creditMinorUnits
      );
    })
  );
}
