import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useQuery } from "convex/react";
import { useIsFocused } from "@react-navigation/native";
import { ActivityIndicator, Text } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { EntryDetailScreen } from "../src/features/history/EntryDetailScreen";
import { useEntryDetail } from "../src/features/history/useEntryDetail";
import { useT } from "../src/i18n";
import { Header, Screen } from "../src/ui/core";
import { api } from "../src/features/api";
import { useWorkspaceCalendar } from "../src/features/useWorkspaceCalendar";

function Entry({ workspaceId, entryId, timeZone }: { workspaceId: string; entryId: string; timeZone: string }) {
  const { detail, reversal, places } = useEntryDetail(workspaceId, entryId);
  const active = useIsFocused();
  const { date } = useWorkspaceCalendar(timeZone);
  const categories = useQuery(api.accounting.listUserCategories, { workspaceId });
  const month = detail?.row.date.slice(0, 7);
  const budget = useQuery(api.budget.evaluate, month ? { workspaceId, month } : "skip");
  return <EntryDetailScreen detail={detail} reversal={reversal.state}
    categories={categories} places={places} budget={budget} active={active} currentDate={date}
    onBack={() => router.back()}
    onEntry={(next) => router.push({ pathname: "/entry", params: { entryId: next } })}
    onReverse={reversal.request} onCancel={reversal.cancel} onConfirm={() => void reversal.confirm()} />;
}
export default function EntryRoute() {
  const { t } = useT();
  const defaults = usePersonalDefaults();
  const { entryId } = useLocalSearchParams<{ entryId?: string }>();
  if (!entryId) return <Screen><Header title={t("review.postedEntry")} onBack={() => router.back()} /><Text>{t("review.chooseEntry")}</Text></Screen>;
  return defaults ? <Entry key={`${defaults.workspace.id}:${entryId}`} workspaceId={defaults.workspace.id} entryId={entryId} timeZone={defaults.workspace.timeZone} /> :
    defaults === null ? <Redirect href="/" /> : <Screen><ActivityIndicator /></Screen>;
}
