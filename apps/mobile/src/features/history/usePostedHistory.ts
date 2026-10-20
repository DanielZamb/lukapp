import { usePaginatedQuery } from "convex/react";
import { api } from "../api";

export function usePostedHistory(workspaceId: string, profileId?: string, enabled = true) {
  const { results, status, loadMore } = usePaginatedQuery(api.accounting.postedHistory,
    enabled ? {
      workspaceId,
      ...(profileId ? { financialAccountProfileId: profileId } : {}),
      includeReversals: true,
    } : "skip", { initialNumItems: 50 });

  return {
    rows: enabled && status !== "LoadingFirstPage" ? results : undefined,
    hasMore: enabled && status !== "Exhausted",
    loadingMore: status === "LoadingMore",
    loadMore: () => { if (enabled && status === "CanLoadMore") loadMore(50); },
  };
}
