import { useState } from "react";
import { useT } from "../../i18n";
import type { RecoveryPlace } from "./model";

type Unavailable = "ended" | "undoing" | "gone";

/** The refusals that mean the chosen Place can no longer take money, by what happened to it. */
const endedCodes: Record<string, Unavailable> = {
  financial_account_profile_ended: "ended",
  place_undo_in_progress: "undoing",
};

export function endedPlaceRefusal(code: string): Unavailable | null {
  return endedCodes[code] ?? null;
}

/** A chosen Place that can no longer be used, kept where it was chosen and marked, so what is shown is what would be sent. */
export type UnavailablePlace = { id: string; label: string; detail: string };

/**
 * One Place picked from a live list, kept in its owner's form. The choice is only ever the id the person tapped: when
 * that Place leaves the list or the server refuses it, it stays chosen and marked unavailable until the person picks
 * another, never silently replaced by whichever Place remains.
 */
export type PlaceChoice = { readonly id: string | null; readonly refused: Readonly<Record<string, Unavailable>> };

export const placeChoice = (id: string | null): PlaceChoice => ({ id, refused: {} });
export const choosePlace = (choice: PlaceChoice, id: string): PlaceChoice => ({ ...choice, id });
export const refusePlace = (choice: PlaceChoice, id: string, why: Unavailable): PlaceChoice =>
  ({ ...choice, refused: { ...choice.refused, [id]: why } });

/** Why the chosen Place cannot take money from `live`, or null when it can. */
export function unavailableReason(choice: PlaceChoice, live: readonly RecoveryPlace[]): Unavailable | null {
  if (choice.id === null) return null;
  return choice.refused[choice.id] ?? (live.some((place) => place.id === choice.id) ? null : "gone");
}

/** How an unavailable choice reads, named as the person last saw it even after it left the list. */
export function useChosenPlace(live: RecoveryPlace[], choice: PlaceChoice): UnavailablePlace | null {
  const { t } = useT();
  const [names, setNames] = useState<Record<string, string>>({});
  const unseen = live.filter((place) => names[place.id] !== place.name);
  if (unseen.length) setNames((current) => ({ ...current, ...Object.fromEntries(unseen.map((place) => [place.id, place.name])) }));
  const id = choice.id;
  const reason = unavailableReason(choice, live);
  if (id === null || reason === null) return null;
  const name = names[id] ?? live.find((place) => place.id === id)?.name ?? "";
  return {
    id,
    label: t(reason === "ended" ? "placeEnding.closedName" : reason === "undoing" ? "placeEnding.undoingName" : "recovery.placeUnavailable", { name }),
    detail: t(reason === "ended" ? "placeEnding.postingPlaceEnded" : reason === "undoing" ? "placeEnding.postingPlaceUndoing" : "recovery.placeGone", { name }),
  };
}
