import { useQuery } from "convex/react";
import { api } from "../api";
import { useWorkspaceCalendar } from "../useWorkspaceCalendar";
import { monthOverview } from "./model";
import { OverviewScreen } from "./OverviewScreen";

export function Overview({ workspaceId, timeZone, onBack, onHistory, onCategory }: {
  workspaceId: string; timeZone: string;
  onBack: () => void; onHistory: () => void; onCategory: (categoryId: string) => void;
}) {
  const { month } = useWorkspaceCalendar(timeZone);
  const entries = useQuery(api.accounting.listJournalEntries, { workspaceId });
  const categories = useQuery(api.accounting.listUserCategories, { workspaceId });
  const budget = useQuery(api.budget.evaluate, { workspaceId, month });
  const data = entries && categories && budget ? monthOverview({ month, entries, categories, budget }) : undefined;
  return <OverviewScreen data={data} onBack={onBack} onHistory={onHistory} onCategory={onCategory} />;
}
