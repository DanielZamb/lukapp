import { useQuery } from "convex/react";
import { api } from "../api";
import { useWorkspaceCalendar } from "../useWorkspaceCalendar";
import { CategoryLookScreen } from "./CategoryLookScreen";
import { categoryLook } from "./model";

export function CategoryLook({ workspaceId, timeZone, categoryId, onBack, onSetLimit }: {
  workspaceId: string; timeZone: string; categoryId: string;
  onBack: () => void; onSetLimit: () => void;
}) {
  const { month } = useWorkspaceCalendar(timeZone);
  const entries = useQuery(api.accounting.listJournalEntries, { workspaceId });
  const categories = useQuery(api.accounting.listUserCategories, { workspaceId });
  const budget = useQuery(api.budget.evaluate, { workspaceId, month });
  const data = entries && categories && budget ? categoryLook({ categoryId, month, entries, categories, budget }) : undefined;
  return <CategoryLookScreen data={data} onBack={onBack} onSetLimit={onSetLimit} />;
}
