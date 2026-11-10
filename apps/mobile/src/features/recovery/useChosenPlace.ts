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
 * One Place picked from a live list. The choice is only ever the id the person tapped: when that Place leaves the
 * list or the server refuses it, it stays chosen and marked unavailable until the person picks another, never
 * silently replaced by whichever Place remains.
 */
export function useChosenPlace(live: RecoveryPlace[], initial: string | null) {
  const { t } = useT();
  const [id, setId] = useState(initial);
  const [refused, setRefused] = useState<Record<string, Unavailable>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const unseen = live.filter((place) => names[place.id] !== place.name);
  if (unseen.length) setNames((current) => ({ ...current, ...Object.fromEntries(unseen.map((place) => [place.id, place.name])) }));
  const offered = live.filter((place) => !refused[place.id]);
  const reason: Unavailable | null = id === null ? null : refused[id] ?? (offered.some((place) => place.id === id) ? null : "gone");
  const name = id === null ? "" : names[id] ?? live.find((place) => place.id === id)?.name ?? "";
  const unavailable: UnavailablePlace | null = id === null || reason === null ? null : {
    id,
    label: t(reason === "ended" ? "placeEnding.closedName" : reason === "undoing" ? "placeEnding.undoingName" : "recovery.placeUnavailable", { name }),
    detail: t(reason === "ended" ? "placeEnding.postingPlaceEnded" : reason === "undoing" ? "placeEnding.postingPlaceUndoing" : "recovery.placeGone", { name }),
  };
  return {
    id,
    unavailable,
    choose: setId,
    refuse: (refusedId: string, why: Unavailable) => setRefused((current) => ({ ...current, [refusedId]: why })),
  };
}
