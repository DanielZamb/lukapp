import { Redirect, router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Text } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { EntryDetailScreen } from "../src/features/history/EntryDetailScreen";
import { useEntryDetail } from "../src/features/history/useEntryDetail";
import { useT } from "../src/i18n";
import { Header, Screen } from "../src/ui/core";

function Entry({ workspaceId, entryId }: { workspaceId: string; entryId: string }) {
  const { detail, reversal, places } = useEntryDetail(workspaceId, entryId);
  return <EntryDetailScreen detail={detail} reversal={reversal.state} places={places}
    onBack={() => router.back()}
    onEntry={(next) => router.push({ pathname: "/entry", params: { entryId: next } })}
    onReverse={reversal.request} onCancel={reversal.cancel} onConfirm={() => void reversal.confirm()} />;
}
export default function EntryRoute() {
  const { t } = useT();
  const defaults = usePersonalDefaults();
  const { entryId } = useLocalSearchParams<{ entryId?: string }>();
  if (!entryId) return <Screen><Header title={t("review.postedEntry")} onBack={() => router.back()} /><Text>{t("review.chooseEntry")}</Text></Screen>;
  return defaults ? <Entry key={`${defaults.workspace.id}:${entryId}`} workspaceId={defaults.workspace.id} entryId={entryId} /> :
    defaults === null ? <Redirect href="/" /> : <Screen><ActivityIndicator /></Screen>;
}
