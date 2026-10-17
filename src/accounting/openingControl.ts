import { AccountingError } from "./errors";
import type {
  AccountingStore,
  JournalEntryDraft,
  StoredJournalEntry,
} from "./types";

export function isOpening(entry: Pick<JournalEntryDraft, "policy">) {
  return (
    entry.policy === "opening-position@1" || entry.policy === "start-tracking@1"
  );
}

export async function requireOpeningDate(
  store: AccountingStore,
  workspaceId: string,
  draft: JournalEntryDraft,
) {
  const entries = await store.listJournalEntries(workspaceId);
  const reversed = new Set(
    entries.flatMap((entry) =>
      entry.reversesEntryId ? [entry.reversesEntryId] : [],
    ),
  );
  const profiles = await store.listProfiles(workspaceId);
  for (const profile of profiles) {
    if (
      !draft.lines.some(
        (line) => line.ledgerAccountId === profile.postingAccountId,
      )
    )
      continue;
    const touches = (entry: StoredJournalEntry) =>
      entry.lines.some(
        (line) => line.ledgerAccountId === profile.postingAccountId,
      );
    const activeOpening = entries.find(
      (entry) => isOpening(entry) && !reversed.has(entry.id) && touches(entry),
    );
    if (isOpening(draft)) {
      if (activeOpening) throw new AccountingError("opening_already_exists");
      if (
        entries.some(
          (entry) =>
            !isOpening(entry) &&
            !entry.reversesEntryId &&
            touches(entry) &&
            entry.accountingDate < draft.accountingDate,
        )
      )
        throw new AccountingError("opening_after_activity");
    } else if (
      activeOpening &&
      draft.accountingDate < activeOpening.accountingDate
    ) {
      throw new AccountingError("activity_before_opening");
    }
  }
}
