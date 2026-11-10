import { useConvex, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { api } from "../api";
import { addUndoPage, type UndoPreview, type UndoTotals } from "./model";

/** More pages than the backend's 1,000-line safety bound can produce; past it the totals stay lower bounds. */
export const UNDO_PREVIEW_PAGE_LIMIT = 120;

export type UndoPreviewRead = {
  /** The live first page: blockers and closure follow the backend as they change. */
  first: UndoPreview | undefined;
  totals: UndoTotals | null;
  /** True once every page was read, or the page limit was reached and the totals are stated as lower bounds. */
  settled: boolean;
  failed: boolean;
  retry: () => void;
};

/**
 * Reads every preview page before confirmation. The first page stays live; whenever it changes the remaining pages
 * are read again from the start, so the totals always describe one consistent pass.
 */
export function useUndoPreview(workspaceId: string, profileId: string, enabled: boolean): UndoPreviewRead {
  const convex = useConvex();
  const reportFailure = useDeviceAccessFailure();
  const first = useQuery(api.accounting.previewUndoPlace, enabled ? { workspaceId, financialAccountProfileId: profileId, cursor: null } : "skip");
  const [read, setRead] = useState<{ totals: UndoTotals | null; settled: boolean; failed: boolean }>({ totals: null, settled: false, failed: false });
  const [attempt, setAttempt] = useState(0);
  const signature = first ? JSON.stringify(first.page) : "";
  useEffect(() => {
    if (!first) return;
    let current = true;
    let totals = addUndoPage(null, first.page);
    setRead({ totals, settled: totals.complete, failed: false });
    if (totals.complete) return;
    void (async () => {
      let cursor = first.page.continueCursor;
      try {
        for (let page = 1; page < UNDO_PREVIEW_PAGE_LIMIT; page++) {
          const next = await convex.query(api.accounting.previewUndoPlace, { workspaceId, financialAccountProfileId: profileId, cursor });
          if (!current) return;
          totals = addUndoPage(totals, next.page);
          cursor = next.page.continueCursor;
          setRead({ totals, settled: totals.complete, failed: false });
          if (totals.complete) return;
        }
        setRead({ totals, settled: true, failed: false });
      } catch (error) {
        if (!current) return;
        reportFailure(error);
        setRead({ totals, settled: false, failed: true });
      }
    })();
    return () => { current = false; };
    // The signature stands for the first page's content; a new object with the same page must not restart the pass.
  }, [signature, attempt, convex, workspaceId, profileId, reportFailure]);
  return { first, ...read, retry: () => setAttempt((value) => value + 1) };
}
