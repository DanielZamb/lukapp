import { AccountingError } from "./errors";
import type {
  AccountingStore,
  JournalEntryDraft,
  StoredOpeningMarker,
} from "./types";

export function isOpening(entry: Pick<JournalEntryDraft, "policy">) {
  return (
    entry.policy === "opening-position@1" || entry.policy === "start-tracking@1"
  );
}

export async function findActiveOpening(
  store: AccountingStore,
  workspaceId: string,
  profileId: string,
): Promise<StoredOpeningMarker | undefined> {
  // The newest unreversed marker governs. A zero start has no entry to reverse, so a later
  // Start Tracking supersedes it instead; see requireOpeningOnProfile.
  const markers = await store.listOpeningMarkersByProfile(workspaceId, profileId);
  for (const marker of [...markers].reverse()) {
    if (!marker.journalEntryId) return marker;
    if (!(await store.findReversalOf(marker.journalEntryId))) return marker;
  }
}

export async function requireOpeningOnProfile(
  store: AccountingStore,
  workspaceId: string,
  profileId: string,
  draft: Pick<JournalEntryDraft, "policy" | "accountingDate" | "idempotencyKey">,
) {
  const activeOpening = await findActiveOpening(store, workspaceId, profileId);
  if (isOpening(draft)) {
    if (activeOpening?.journalEntryId && activeOpening.idempotencyKey !== draft.idempotencyKey)
      throw new AccountingError("opening_already_exists");
    const profile = await store.getProfile(profileId);
    if (!profile) return;
    const firstActivity = await store.firstActivityDate(workspaceId, profile.postingAccountId);
    if (firstActivity && firstActivity < draft.accountingDate)
      throw new AccountingError("opening_after_activity");
  } else if (
    activeOpening &&
    draft.accountingDate < activeOpening.accountingDate
  ) {
    throw new AccountingError("activity_before_opening");
  }
}

export async function requireOpeningDate(
  store: AccountingStore,
  workspaceId: string,
  draft: JournalEntryDraft,
) {
  const profiles = await store.listProfiles(workspaceId);
  for (const profile of profiles) {
    if (
      !draft.lines.some(
        (line) => line.ledgerAccountId === profile.postingAccountId,
      )
    )
      continue;
    await requireOpeningOnProfile(store, workspaceId, profile.id, draft);
  }
}
