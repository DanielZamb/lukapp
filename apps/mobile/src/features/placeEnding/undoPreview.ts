import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../api";
import type { UndoPreview } from "./model";

/**
 * The whole Undo preview of one Place, subscribed afresh whenever `round` changes. Convex runs a subscribed query
 * again only when data it read changes, never because time passed, and the preview's fingerprint covers the workspace
 * month, so a new month or a Start refused as stale needs a new subscription. The last answer stays until the new one
 * arrives, so the confirmation never blanks while it is read again.
 */
export function useUndoPreview(place: { workspaceId: string; financialAccountProfileId: string } | null, round: string) {
  const [subscribed, setSubscribed] = useState(round);
  const renewing = subscribed !== round;
  useEffect(() => { if (renewing) setSubscribed(round); }, [renewing, round]);
  const answer = useQuery(api.accounting.previewUndoPlace, place && !renewing ? { ...place, cursor: null } : "skip");
  const [last, setLast] = useState<UndoPreview | undefined>(undefined);
  const current = place ? answer ?? last : undefined;
  if (current !== last) setLast(current);
  return current;
}
