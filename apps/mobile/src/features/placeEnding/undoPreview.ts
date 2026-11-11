import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../api";
import type { UndoPreview } from "./model";

/**
 * The whole Undo preview of one Place, asked for again whenever `renewal` changes: in a new month, and after a Start
 * refused as stale. Convex reuses a query's answer for the same arguments while the data it read is unchanged,
 * whatever the time, and the preview's fingerprint covers the workspace month, so the renewal travels as an argument
 * and a new value is computed afresh. The last answer stays until the new one arrives, so the confirmation never
 * blanks while it is read again; `renewed` says whether the preview shown is the answer to this renewal.
 */
export function useUndoPreview(place: { workspaceId: string; financialAccountProfileId: string } | null, renewal: string) {
  const answer = useQuery(api.accounting.previewUndoPlace, place ? { ...place, cursor: null, renewal } : "skip");
  const [last, setLast] = useState<UndoPreview | undefined>(undefined);
  const preview = place ? answer ?? last : undefined;
  if (preview !== last) setLast(preview);
  return { preview, renewed: answer !== undefined };
}
