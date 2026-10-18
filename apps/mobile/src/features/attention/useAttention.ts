import { useQuery } from "convex/react";
import { api } from "../api";
import { useWorkspaceCalendar } from "../useWorkspaceCalendar";
import { budgetAttention, type AttentionState } from "./model";

export function useAttention(input: { workspaceId: string; timeZone: string }): AttentionState {
  const { month } = useWorkspaceCalendar(input.timeZone);
  const budget = useQuery(api.budget.evaluate, { workspaceId: input.workspaceId, month });
  return budget === undefined ? { kind: "loading" } : { kind: "ready", data: budgetAttention(budget) };
}
