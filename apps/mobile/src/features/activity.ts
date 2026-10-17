import { useQuery } from "convex/react";
import { api } from "./api";
import { useWorkspaceCalendar } from "./useWorkspaceCalendar";

export function usePersonalDefaults() {
  return useQuery(api.accounting.personalDefaults, {});
}
export function usePostedActivity(workspaceId: string, timeZone: string) {
  const { month } = useWorkspaceCalendar(timeZone);
  return useQuery(api.accounting.postedActivity, {
    workspaceId,
    month,
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
