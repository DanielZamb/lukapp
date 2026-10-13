import { AccountingError } from "./errors";
import type {
  AccountingStore,
  JournalEntryDraft,
  StoredProfile,
} from "./types";

export async function assertOpeningDates(
  store: AccountingStore,
  workspaceId: string,
  draft: JournalEntryDraft,
): Promise<void> {
  const accountIds = new Set(draft.lines.map((line) => line.ledgerAccountId));
  const profiles = await store.listProfiles(workspaceId);
  for (const profile of profiles) {
    if (
      (accountIds.has(profile.postingAccountId) ||
        profile.id === draft.financialAccountProfileId) &&
      profile.opening &&
      draft.accountingDate < profile.opening.accountingDate
    ) {
      throw new AccountingError("activity_before_opening");
    }
  }
}

export async function assertOpeningCutover(
  store: AccountingStore,
  profile: StoredProfile,
  accountingDate: string,
): Promise<void> {
  const entries = await store.listJournalEntries(profile.workspaceId);
  const reversals = new Map(
    entries
      .filter((entry) => entry.policy === "reversal@1" && entry.reversesEntryId)
      .map((entry) => [entry.reversesEntryId, entry]),
  );
  const retiredEntryIds = new Set<string>();
  for (const entry of entries) {
    if (
      entry.policy === "opening-position@1" &&
      entry.financialAccountProfileId === profile.id
    ) {
      const reversal = reversals.get(entry.id);
      if (reversal) {
        retiredEntryIds.add(entry.id);
        retiredEntryIds.add(reversal.id);
      }
    }
  }
  if (
    entries.some(
      (entry) =>
        !retiredEntryIds.has(entry.id) &&
        entry.accountingDate < accountingDate &&
        (entry.financialAccountProfileId === profile.id ||
          entry.lines.some(
            (line) => line.ledgerAccountId === profile.postingAccountId,
          )),
    )
  ) {
    throw new AccountingError("activity_before_opening");
  }
}
