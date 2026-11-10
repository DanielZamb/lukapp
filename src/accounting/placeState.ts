import { AccountingError } from "./errors";
import type { PlaceStatus, StoredProfile } from "./types";

export function placeStatus(profile: Pick<StoredProfile, "ending">): PlaceStatus {
  return profile.ending?.act === "close" ? "closed" : profile.ending ? "undone" : "open";
}

export function requireOpenPlace(profile: Pick<StoredProfile, "ending">) {
  if (profile.ending) throw new AccountingError("financial_account_profile_ended");
}
