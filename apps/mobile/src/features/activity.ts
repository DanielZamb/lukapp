import { useQuery } from "convex/react";
import { api } from "./api";
import { calendarDate } from "./timeZones";

export function usePersonalDefaults() {
  return useQuery(api.accounting.personalDefaults, {});
}
export function usePostedActivity(workspaceId: string, timeZone: string) {
  return useQuery(api.accounting.postedActivity, {
    workspaceId,
    month: calendarDate(new Date(), timeZone).slice(0, 7),
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
