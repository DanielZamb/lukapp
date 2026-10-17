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
  });
}
