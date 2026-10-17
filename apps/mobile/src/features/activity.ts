import { useQuery } from "convex/react";
import { api } from "./api";
import { localDate } from "./money";

export function usePersonalDefaults() {
  return useQuery(api.accounting.personalDefaults, {});
}
export function usePostedActivity(workspaceId: string) {
  return useQuery(api.accounting.postedActivity, {
    workspaceId,
    month: localDate().slice(0, 7),
    includeRows: false,
  });
}
export function useRecentActivity(workspaceId: string, count: number, financialAccountProfileId?: string) {
  return useQuery(api.accounting.postedHistory, {
    workspaceId,
    ...(financialAccountProfileId ? { financialAccountProfileId } : {}),
    includeReversals: false,
    paginationOpts: { cursor: null, numItems: count },
  });
}
