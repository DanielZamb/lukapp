import { usePaginatedQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "../api";

export function usePostedHistory(workspaceId: string, profileId?: string, enabled = true) {
  const { results, status, loadMore } = usePaginatedQuery(api.accounting.postedHistory,
    enabled ? {
      workspaceId,
      ...(profileId ? { financialAccountProfileId: profileId } : {}),
      includeReversals: true,
    } : "skip", { initialNumItems: 50 });

  useEffect(() => {
    if (enabled && status === "CanLoadMore") loadMore(50);
  }, [enabled, status, loadMore]);

  return enabled && status === "Exhausted" ? results : undefined;
}
