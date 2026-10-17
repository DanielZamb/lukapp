import { useAction, useQuery } from "convex/react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, Text } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { api } from "../src/features/api";
import { EntryDetailScreen } from "../src/features/history/EntryDetailScreen";
import { useReversal } from "../src/features/history/useReversal";
import { useDeviceAccessFailure } from "../src/local-auth/accessFailure";
import { Header, Screen } from "../src/ui/core";

function Entry({ workspaceId, entryId }: { workspaceId: string; entryId: string }) {
  const detail = useQuery(api.accounting.postedEntry, { workspaceId, journalEntryId: entryId });
  const post = useAction(api.accounting.reversePostedEntry);
  const reportFailure = useDeviceAccessFailure();
  const transport = useMemo(() => ({ post, reportFailure }), [post, reportFailure]);
  const reversal = useReversal(workspaceId, entryId, transport);
  return <EntryDetailScreen detail={detail} reversal={reversal.state}
    onBack={() => router.back()}
    onEntry={(next) => router.push({ pathname: "/entry", params: { entryId: next } })}
    onReverse={reversal.request} onCancel={reversal.cancel} onConfirm={() => void reversal.confirm()} />;
}
export default function EntryRoute() {
  const defaults = usePersonalDefaults();
  const { entryId } = useLocalSearchParams<{ entryId?: string }>();
  if (!entryId) return <Screen><Header title="Posted entry" onBack={() => router.back()} /><Text>Choose an entry from history.</Text></Screen>;
  return defaults ? <Entry key={`${defaults.workspace.id}:${entryId}`} workspaceId={defaults.workspace.id} entryId={entryId} /> :
    defaults === null ? <Redirect href="/" /> : <Screen><ActivityIndicator /></Screen>;
}
