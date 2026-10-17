import { usePaginatedQuery } from "convex/react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { api } from "../src/features/api";
import { HistoryScreen } from "../src/features/history/HistoryScreen";
import { Screen } from "../src/ui/core";

function History({ workspaceId, profileId }: { workspaceId: string; profileId?: string }) {
  const { results, status, loadMore } = usePaginatedQuery(api.accounting.postedHistory, {
    workspaceId,
    ...(profileId ? { financialAccountProfileId: profileId } : {}),
    includeReversals: true,
  }, { initialNumItems: 50 });
  return <HistoryScreen rows={results} status={status} accountName={profileId ? "ACCOUNT HISTORY" : "WORKSPACE HISTORY"}
    onBack={() => router.back()}
    onEntry={(entryId) => router.push({ pathname: "/entry", params: { entryId } })}
    onMore={() => { if (status === "CanLoadMore") loadMore(50); }} />;
}
export default function HistoryRoute() {
  const defaults = usePersonalDefaults();
  const { profileId } = useLocalSearchParams<{ profileId?: string }>();
  return defaults ? <History key={`${defaults.workspace.id}:${profileId ?? "all"}`} workspaceId={defaults.workspace.id} profileId={profileId} /> :
    defaults === null ? <Redirect href="/" /> : <Screen><ActivityIndicator /></Screen>;
}
