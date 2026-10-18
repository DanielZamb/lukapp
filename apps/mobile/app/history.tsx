import { useQuery } from "convex/react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { api } from "../src/features/api";
import { HistoryScreen } from "../src/features/history/HistoryScreen";
import { usePostedHistory } from "../src/features/history/usePostedHistory";
import { useWorkspaceCalendar } from "../src/features/useWorkspaceCalendar";
import { Screen } from "../src/ui/core";

function History({ workspaceId, profileId, timeZone, currency }: {
  workspaceId: string; profileId?: string; timeZone: string; currency: string;
}) {
  const [scopedProfileId, setScopedProfileId] = useState<string | undefined>();
  const allRows = usePostedHistory(workspaceId);
  const scopedRows = usePostedHistory(workspaceId, scopedProfileId, scopedProfileId !== undefined);
  const categories = useQuery(api.accounting.listUserCategories, { workspaceId });
  const places = useQuery(api.accounting.listFinancialAccountProfiles, { workspaceId });
  const { date } = useWorkspaceCalendar(timeZone);
  const scopedReady = scopedProfileId === undefined || scopedRows !== undefined;
  const ready = categories !== undefined && places !== undefined && allRows !== undefined && scopedReady;
  return <HistoryScreen rows={ready ? allRows : undefined}
    scopedRows={scopedProfileId !== undefined ? scopedRows : undefined}
    total={allRows?.length} categories={categories ?? []} places={places ?? []} currentDate={date} currency={currency}
    initialProfileId={profileId} onScopedProfileId={setScopedProfileId}
    onBack={() => router.back()}
    onEntry={(entryId) => router.push({ pathname: "/entry", params: { entryId } })} />;
}
export default function HistoryRoute() {
  const defaults = usePersonalDefaults();
  const { profileId } = useLocalSearchParams<{ profileId?: string }>();
  return defaults ? <History key={`${defaults.workspace.id}:${profileId ?? "all"}`} workspaceId={defaults.workspace.id}
    profileId={profileId} timeZone={defaults.workspace.timeZone} currency={defaults.workspace.functionalCurrency} /> :
    defaults === null ? <Redirect href="/" /> : <Screen><ActivityIndicator /></Screen>;
}
