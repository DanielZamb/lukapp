import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme, ui } from "../../ui/core";
import { font, radius, spacing, touchTarget } from "../../ui/tokens";
import { CapitalFlow } from "./CapitalFlow";
import { HistoryListRow } from "./HistoryListRow";
import { HistoryFilters } from "./HistoryFilters";
import { filterHistory, sortHistory, type HistoryQuery, type SortDir, type SortKey } from "./filter";
import { capitalFlow, historyListRow, type HistoryCategory, type HistoryPlace } from "./listModel";
import type { HistoryRow } from "./types";

export function HistoryScreen({ rows, total, categories, places, currentDate, currency, initialProfileId, onEntry, onBack }: {
  rows: HistoryRow[] | undefined;
  total: number | undefined;
  categories: HistoryCategory[];
  places: HistoryPlace[];
  currentDate: string;
  currency: string;
  initialProfileId?: string;
  onEntry: (id: string) => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState<HistoryQuery>(() => ({ ...emptyQuery, profileIds: initialProfileId ? [initialProfileId] : [] }));
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "date", dir: "desc" });
  const profileNames = useMemo(() => Object.fromEntries(places.map((place) => [place.id, place.name])), [places]);
  const matched = useMemo(() => sortHistory(filterHistory(rows ?? [], query, { today: currentDate, profileNames }),
    sort.key, sort.dir, profileNames).map((row) => historyListRow(row, categories, places, currentDate)),
    [rows, query, sort, profileNames, categories, places, currentDate]);
  const { out, inn } = capitalFlow(matched);
  const loading = rows === undefined || total === undefined;
  const filtered = query.search.trim() !== "" || query.profileIds.length > 0 || query.categoryIds.length > 0 ||
    query.range !== "all" || query.customFrom !== null || query.customTo !== null;
  return <SafeAreaView style={ui.screen}>
    <FlatList
      data={loading ? [] : matched}
      keyExtractor={(row) => row.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: spacing.xxl, flexGrow: 1 }}
      ListHeaderComponent={<View style={styles.headerContent}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} onPress={onBack}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <Ionicons name="chevron-back" size={24} color={theme.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={ui.label}>ACROSS ALL PLACES</Text>
            <Text accessibilityRole="header" style={styles.title}>Tx history</Text>
          </View>
        </View>
        {!loading && <CapitalFlow key={`${out}-${inn}`} out={out} inn={inn} currency={currency} />}
        <View style={styles.search}>
          <Ionicons name="search-outline" size={18} color={theme.mutedForeground} />
          <TextInput accessibilityLabel="Search transactions" placeholder="Search" value={query.search}
            onChangeText={(search) => setQuery((current) => ({ ...current, search }))}
            placeholderTextColor={theme.mutedForeground} style={[ui.input, { flex: 1 }]} />
        </View>
        <HistoryFilters query={query} onQuery={setQuery} sort={sort} onSort={setSort}
          places={places} categories={categories} today={currentDate} />
        <View style={styles.count}>
          <Text style={styles.muted}>{loading ? "Loading history…" : `${matched.length} of ${total}`}</Text>
          {filtered && <Pressable accessibilityRole="button" accessibilityLabel="Clear filters"
            onPress={() => setQuery(emptyQuery)} style={styles.clear}>
            <Text style={styles.clearText}>Clear filters</Text>
          </Pressable>}
        </View>
      </View>}
      renderItem={({ item, index }) => <HistoryListRow row={item} onEntry={onEntry} isFirst={index === 0} isLast={index === matched.length - 1} />}
      ListEmptyComponent={loading ? <ActivityIndicator accessibilityLabel="Loading activity" /> :
        <View style={styles.empty}><Text style={styles.muted}>{total === 0 ? "No posted activity yet." :
          "Nothing matches these filters. Clear them to see everything."}</Text></View>}
    />
  </SafeAreaView>;
}

const emptyQuery: HistoryQuery = { search: "", profileIds: [], categoryIds: [], range: "all", customFrom: null, customTo: null };

const styles = StyleSheet.create({
  headerContent: { gap: spacing.xl, marginBottom: spacing.md },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  back: {
    width: touchTarget, height: touchTarget, borderRadius: radius.full, backgroundColor: theme.secondary,
    borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center",
  },
  title: { fontFamily: font.extrabold, fontSize: 32, lineHeight: 37, letterSpacing: -0.7, color: theme.foreground },
  search: {
    minHeight: touchTarget, flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: theme.ring,
    backgroundColor: theme.secondary,
  },
  count: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  muted: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: theme.mutedForeground },
  clear: { minHeight: 32, justifyContent: "center" },
  clearText: { fontFamily: font.bold, fontSize: 14, color: theme.primary },
  empty: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border },
  pressed: { opacity: 0.72 },
});
