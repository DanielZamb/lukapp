import { AccountingError } from "./errors";
import type { PlaceStatus, StoredProfile } from "./types";

export function placeStatus(profile: Pick<StoredProfile, "ending" | "undoOperationId">): PlaceStatus {
  return profile.ending?.act === "close" ? "closed" : profile.ending ? "undone" : profile.undoOperationId ? "undoing" : "open";
}

export function requireOpenPlace(profile: Pick<StoredProfile, "ending" | "undoOperationId">) {
  if (profile.ending) throw new AccountingError("financial_account_profile_ended");
  if (profile.undoOperationId) throw new AccountingError("place_undo_in_progress");
}
