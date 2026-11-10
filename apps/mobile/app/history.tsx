import { useQuery } from "convex/react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { api } from "../src/features/api";
import { HistoryScreen } from "../src/features/history/HistoryScreen";
import { EntryDetailSheet } from "../src/features/history/EntryDetailSheet";
import { usePostedHistory } from "../src/features/history/usePostedHistory";
import { placeLabel } from "../src/features/placeEnding/model";
import { useWorkspaceCalendar } from "../src/features/useWorkspaceCalendar";
import { useT } from "../src/i18n";
import { Screen } from "../src/ui/core";

function History({ workspaceId, profileId, timeZone, currency }: {
  workspaceId: string; profileId?: string; timeZone: string; currency: string;
}) {
  const [scopedProfileId, setScopedProfileId] = useState<string | undefined>(profileId);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [entryProfileId, setEntryProfileId] = useState<string | undefined>(profileId);
  const all = usePostedHistory(workspaceId);
  const allRows = all.rows;
  const scoped = usePostedHistory(workspaceId, scopedProfileId, scopedProfileId !== undefined);
  const scopedRows = scoped.rows;
  const activePage = scopedProfileId !== undefined ? scoped : all;
  const categories = useQuery(api.accounting.listUserCategories, { workspaceId });
  const { t } = useT();
  const profiles = useQuery(api.accounting.listFinancialAccountProfiles, { workspaceId, status: "all" });
  const places = useMemo(() => profiles?.map((place) => ({ ...place, name: placeLabel(place, t) })), [profiles, t]);
  const { date } = useWorkspaceCalendar(timeZone);
  const scopedReady = scopedProfileId === undefined || scopedRows !== undefined;
  const ready = categories !== undefined && places !== undefined && allRows !== undefined && scopedReady;
  return <><HistoryScreen rows={ready ? allRows : undefined}
    scopedRows={scopedProfileId !== undefined ? scopedRows : undefined}
    total={activePage.rows?.length} hasMore={activePage.hasMore}
    loadingMore={activePage.loadingMore} onLoadMore={activePage.loadMore} categories={categories ?? []} places={places ?? []} currentDate={date} currency={currency}
    initialProfileId={profileId} onScopedProfileId={setScopedProfileId}
    onBack={() => router.back()}
    onEntry={(id, movementProfileId) => { setEntryProfileId(movementProfileId ?? scopedProfileId); setEntryId(id); }} />
    {entryId && <EntryDetailSheet workspaceId={workspaceId} entryId={entryId} profileId={entryProfileId} categories={categories ?? []}
      currentDate={date} onEntry={setEntryId} onClose={() => setEntryId(null)} />}
  </>;
}
export default function HistoryRoute() {
  const defaults = usePersonalDefaults();
  const { profileId } = useLocalSearchParams<{ profileId?: string }>();
  return defaults ? <History key={`${defaults.workspace.id}:${profileId ?? "all"}`} workspaceId={defaults.workspace.id}
    profileId={profileId} timeZone={defaults.workspace.timeZone} currency={defaults.workspace.functionalCurrency} /> :
    defaults === null ? <Redirect href="/" /> : <Screen><ActivityIndicator /></Screen>;
}
