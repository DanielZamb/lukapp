import type { Theme } from "../../ui/tokens";
import { useReadableLayout } from "../../ui/themeContext";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ActionBar, DateSection, FlowSummary, Header, Presentation, Screen, SecondaryButton, Text, TextInput, useTheme, useUi } from "../../ui/core";
import { radius, spacing, touchTarget } from "../../ui/tokens";
import { CapitalFlow, type Focus } from "./CapitalFlow";
import { HistoryListRow } from "./HistoryListRow";
import { HistoryFilters, HistoryFilterSheet, useHistoryFilterPresentation } from "./HistoryFilters";
import { filterHistory, sortHistory, type HistoryQuery, type SortDir, type SortKey } from "./filter";
import { capitalFlow, compactHistoryAmount, historyDateSections, historyListRow, historyMovements, type HistoryCategory, type HistoryPlace } from "./listModel";
import type { HistoryRow } from "./types";

export function HistoryScreen({ rows, scopedRows, total, categories, places, currentDate, currency, initialProfileId, onScopedProfileId, hasMore, loadingMore, onLoadMore, onEntry, onBack, onPost }: {
  rows: HistoryRow[] | undefined;
  scopedRows: HistoryRow[] | undefined;
  total: number | undefined;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  categories: HistoryCategory[];
  places: HistoryPlace[];
  currentDate: string;
  currency: string;
  initialProfileId?: string;
  onScopedProfileId?: (profileId: string | undefined) => void;
  onEntry: (id: string, profileId?: string) => void;
  onBack: () => void;
  onPost?: () => void;
}) {
  const ui = useUi();
  const layout = useReadableLayout();
  const theme = useTheme();
  const styles = useMemo(() => historyScreenStyles(theme), [theme]);
  const filterPresentation = useHistoryFilterPresentation();
  const [query, setQuery] = useState<HistoryQuery>(() => ({ ...emptyQuery, profileIds: initialProfileId ? [initialProfileId] : [] }));
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "date", dir: "desc" });
  const singleProfileId = query.profileIds.length === 1 ? query.profileIds[0] : undefined;
  useEffect(() => { onScopedProfileId?.(singleProfileId); }, [singleProfileId, onScopedProfileId]);
  const profileNames = useMemo(() => Object.fromEntries(places.map((place) => [place.id, place.name])), [places]);
  const filterQuery = useMemo(
    () => (singleProfileId !== undefined ? { ...query, profileIds: [] } : query),
    [query, singleProfileId],
  );
  const filterRows = singleProfileId !== undefined ? (scopedRows ?? []) : (rows ?? []);
  const movements = useMemo(() => historyMovements(filterRows, singleProfileId), [filterRows, singleProfileId]);
  const movementTotal = total === undefined ? undefined : total + movements.length - filterRows.length;
  const matched = useMemo(() => sortHistory(filterHistory(movements, filterQuery, { today: currentDate, profileNames }),
    sort.key, sort.dir, profileNames).map((row) => historyListRow(row, categories, places, currentDate)),
    [movements, filterQuery, sort, profileNames, categories, places, currentDate]);
  const { out, inn } = capitalFlow(matched);
  const [flowFocus, setFlowFocus] = useState<Focus | null>(null);
  useEffect(() => setFlowFocus(null), [out, inn]);
  const loading = rows === undefined || total === undefined ||
    (singleProfileId !== undefined && scopedRows === undefined);
  const filtered = query.search.trim() !== "" || query.profileIds.length > 0 || query.categoryIds.length > 0 ||
    query.range !== "all" || query.customFrom !== null || query.customTo !== null;
  const legacy = <SafeAreaView style={ui.screen}>
    <FlatList
      data={loading ? [] : matched}
      keyExtractor={(row) => `${row.id}:${row.financialAccountProfileId ?? "all"}`}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: layout.pagePadding, flexGrow: 1 }}
      ListHeaderComponent={<View style={styles.headerContent}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} onPress={onBack}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <Ionicons name="chevron-back" size={24} color={theme.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text variant="label" style={ui.label}>ACROSS ALL PLACES</Text>
            <Text variant="screen" accessibilityRole="header" style={styles.title}>Tx history</Text>
          </View>
        </View>
        {!loading && hasMore && <Text preset="rowSubtitle" style={styles.muted}>Filters and totals cover loaded transactions.</Text>}
        {!loading && <CapitalFlow key={`${out}-${inn}`} out={out} inn={inn} currency={currency} focus={flowFocus} onFocus={setFlowFocus} />}
        <View style={styles.search}>
          <Ionicons name="search-outline" size={18} color={theme.mutedForeground} />
          <TextInput preset="body" accessibilityLabel="Search transactions" placeholder="Search" value={query.search}
            onChangeText={(search) => setQuery((current) => ({ ...current, search }))}
            placeholderTextColor={theme.mutedForeground} style={[ui.input, { flex: 1 }]} />
        </View>
        <HistoryFilters presentation={filterPresentation} query={query} onQuery={setQuery} sort={sort} onSort={setSort}
          places={places} categories={categories} today={currentDate} />
        <View style={styles.count}>
          <Text preset="rowSubtitle" style={styles.muted}>{loading ? "Loading history…" : `${matched.length} of ${movementTotal}${hasMore ? " loaded" : ""}`}</Text>
          {filtered && <Pressable accessibilityRole="button" accessibilityLabel="Clear filters"
            onPress={() => setQuery(emptyQuery)} style={styles.clear}>
            <Text preset="filterSort" style={styles.clearText}>Clear filters</Text>
          </Pressable>}
        </View>
      </View>}
      renderItem={({ item, index }) => <HistoryListRow row={item} onEntry={onEntry} isFirst={index === 0} isLast={index === matched.length - 1} />}
      ListFooterComponent={!loading && hasMore ? <Pressable accessibilityRole="button"
        accessibilityLabel="Load more transactions" disabled={loadingMore} onPress={onLoadMore}
        style={styles.loadMore}>
        {loadingMore ? <ActivityIndicator accessibilityLabel="Loading more transactions" /> :
          <Text preset="filterSort" style={styles.clearText}>Load more transactions</Text>}
      </Pressable> : null}
      ListEmptyComponent={loading ? <ActivityIndicator accessibilityLabel="Loading activity" /> :
        <View style={styles.empty}><Text preset="rowSubtitle" style={styles.muted}>{total === 0 ? "No posted activity yet." :
          hasMore ? "No matches in the loaded transactions. Load more or clear filters." :
          "Nothing matches these filters. Clear them to see everything."}</Text></View>}
    />
  </SafeAreaView>;
  const empty = !loading && matched.length === 0;
  return <><Presentation legacy={legacy}>
    <Screen footer={empty && total !== 0 && filtered ? <ActionBar primary={{ label: "Clear filters", onPress: () => setQuery(emptyQuery), icon: "close" }} /> :
      empty && total === 0 && onPost ? <ActionBar primary={{ label: "Post money", onPress: onPost, icon: "add" }} /> : undefined}>
      <Header title="Tx history" eyebrow="ACROSS ALL PLACES" onBack={onBack} />
      {!loading && total !== 0 && <FlowSummary net={inn - out} out={out} in={inn} currency={currency} />}
      {total !== 0 && <View style={{ gap: 12 }}>
        <View style={[styles.search, { minHeight: 64, borderRadius: 18 }]}>
          <Ionicons name="search-outline" size={22} color={theme.mutedForeground} />
          <TextInput preset="body" accessibilityLabel="Search transactions" placeholder="Search" value={query.search}
            onChangeText={(search) => setQuery((current) => ({ ...current, search }))}
            placeholderTextColor={theme.mutedForeground} style={[ui.input, { flex: 1, minHeight: 64 }]} />
        </View>
        <HistoryFilters presentation={filterPresentation} query={query} onQuery={setQuery} sort={sort} onSort={setSort} places={places} categories={categories} today={currentDate} />
        <Text variant="meta" tone="muted">{loading ? "Loading history…" : `${matched.length} of ${movementTotal} loaded`}</Text>
        {!empty && filtered && <SecondaryButton label="Clear filters" onPress={() => setQuery(emptyQuery)} />}
      </View>}
      {loading ? <ActivityIndicator accessibilityLabel="Loading activity" /> : empty ? <View style={{ gap: 8, paddingTop: 4 }}>
        <Text variant="section">{total === 0 ? "Nothing posted yet" : "Nothing matches"}</Text>
        <Text variant="body" tone="muted">{total === 0 ? "Everything you post shows up here, newest first." : `Search covers the ${movements.length} loaded movements.`}</Text>
      </View> : historyDateSections(matched).map((section, index) => <DateSection key={`${section.date}:${index}`} date={section.dateLabel}
        net={{ label: compactHistoryAmount(section.net, currency), minorUnits: section.net }} place={section.place}>
        {section.rows.map((row) => <HistoryListRow key={`${row.id}:${row.financialAccountProfileId ?? "all"}`} row={row} onEntry={onEntry}
          sharedPlace={section.place} isFirst={false} isLast={false} />)}
      </DateSection>)}
      {!loading && hasMore && <SecondaryButton label="Load more" onPress={onLoadMore} disabled={loadingMore} pending={loadingMore} />}
    </Screen>
  </Presentation>
    <HistoryFilterSheet presentation={filterPresentation} query={query} onQuery={setQuery} sort={sort} onSort={setSort}
      places={places} categories={categories} today={currentDate} />
  </>;
}

const emptyQuery: HistoryQuery = { search: "", profileIds: [], categoryIds: [], range: "all", customFrom: null, customTo: null };

function historyScreenStyles(theme: Theme) {
  return StyleSheet.create({
    headerContent: { gap: spacing.xl, marginBottom: spacing.md },
    header: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    back: {
      width: touchTarget, height: touchTarget, borderRadius: radius.full, backgroundColor: theme.secondary,
      borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center",
    },
    title: { color: theme.foreground },
    search: {
      minHeight: touchTarget, flexDirection: "row", alignItems: "center", gap: spacing.sm,
      paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: theme.ring,
      backgroundColor: theme.secondary,
    },
    count: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
    muted: { color: theme.mutedForeground },
    clear: { minHeight: 32, justifyContent: "center" },
    loadMore: { minHeight: touchTarget, alignItems: "center", justifyContent: "center", marginTop: spacing.lg },
    clearText: { color: theme.primary },
    empty: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border },
    pressed: { opacity: 0.72 },
  });
}
