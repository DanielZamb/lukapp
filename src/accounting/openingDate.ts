import { AccountingError } from "./errors";
import type { AccountingStore, JournalEntryDraft } from "./types";

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
