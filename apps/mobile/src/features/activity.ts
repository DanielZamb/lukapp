import { useQuery } from "convex/react";
import { api } from "./api";
import { useWorkspaceCalendar } from "./useWorkspaceCalendar";

export function usePersonalDefaults() {
  return useQuery(api.accounting.personalDefaults, {});
}
/** Balances of open Places by default; a Place's own page and the Places list also read ended ones. */
export function usePostedActivity(workspaceId: string, timeZone: string, status?: "all") {
  const { month } = useWorkspaceCalendar(timeZone);
  return useQuery(api.accounting.postedActivity, {
    workspaceId,
    month,
    includeRows: false,
    ...(status ? { status } : {}),
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
