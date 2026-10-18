import { useAction, useQuery } from "convex/react";
import { useMemo } from "react";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { api } from "../api";
import { useReversal } from "./useReversal";

export function useEntryDetail(workspaceId: string, entryId: string, profileId?: string) {
  const detail = useQuery(api.accounting.postedEntry, {
    workspaceId, journalEntryId: entryId,
    ...(profileId ? { financialAccountProfileId: profileId } : {}),
  });
  const post = useAction(api.accounting.reversePostedEntry);
  const reportFailure = useDeviceAccessFailure();
  const transport = useMemo(() => ({ post, reportFailure }), [post, reportFailure]);
  const reversal = useReversal(workspaceId, entryId, transport);
  return { detail, reversal };
}
