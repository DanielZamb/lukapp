import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActivityRow } from "../ActivityRows";
import { Header, SecondaryButton, ui } from "../../ui/core";
import { spacing } from "../../ui/tokens";
import type { HistoryRow } from "./types";

export function HistoryScreen({ rows, status, accountName, onMore, onEntry, onBack }: {
  rows: HistoryRow[];
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  accountName?: string;
  onMore: () => void;
  onEntry: (id: string) => void;
  onBack: () => void;
}) {
  return <SafeAreaView style={ui.screen}>
    <FlatList
      data={rows}
      keyExtractor={(row) => row.id}
      contentContainerStyle={{ padding: spacing.xxl, flexGrow: 1 }}
      ListHeaderComponent={<View style={{ gap: spacing.xl, marginBottom: spacing.xxl }}>
        <Header title="Posted activity" eyebrow={accountName} onBack={onBack} />
        <Text style={ui.muted}>All postings, including linked reversals.</Text>
      </View>}
      renderItem={({ item }) => <ActivityRow row={item} onEntry={onEntry} />}
      ListEmptyComponent={status === "LoadingFirstPage" ? <ActivityIndicator accessibilityLabel="Loading activity" /> : <Text style={ui.muted}>No posted activity yet.</Text>}
      ListFooterComponent={<View style={{ marginTop: spacing.xxl }}>
        {status === "LoadingMore" ? <ActivityIndicator accessibilityLabel="Loading more activity" /> :
          status === "CanLoadMore" ? <SecondaryButton label="Load 50 more" onPress={onMore} /> :
            status === "Exhausted" && rows.length > 0 ? <Text style={ui.muted}>You have reached the beginning.</Text> : null}
      </View>}
    />
  </SafeAreaView>;
}
