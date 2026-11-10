import type { Theme } from "../../ui/tokens";
import { useReadableLayout } from "../../ui/themeContext";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useT } from "../../i18n";
import { useTheme, useUi } from "../../ui/core";
import { font, radius, spacing, touchTarget } from "../../ui/tokens";
import { CapitalFlow } from "./CapitalFlow";
import { HistoryListRow } from "./HistoryListRow";
import { HistoryFilters } from "./HistoryFilters";
import { filterHistory, sortHistory, type HistoryQuery, type SortDir, type SortKey } from "./filter";
import { capitalFlow, historyListRow, historyMovements, type HistoryCategory, type HistoryPlace } from "./listModel";
import type { HistoryRow } from "./types";

export function HistoryScreen({ rows, scopedRows, total, categories, places, currentDate, currency, initialProfileId, onScopedProfileId, hasMore, loadingMore, onLoadMore, onEntry, onBack }: {
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
}) {
  const ui = useUi();
  const layout = useReadableLayout();
  const theme = useTheme();
  const translator = useT();
  const { t, language } = translator;
  const styles = useMemo(() => historyScreenStyles(theme), [theme]);
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
  const matched = useMemo(() => sortHistory(filterHistory(movements, filterQuery, { today: currentDate, language, profileNames }),
    sort.key, sort.dir, profileNames).map((row) => historyListRow(row, categories, places, currentDate, translator)),
    [movements, filterQuery, sort, profileNames, categories, places, currentDate, translator, language]);
  const { out, inn } = capitalFlow(matched);
  const loading = rows === undefined || total === undefined ||
    (singleProfileId !== undefined && scopedRows === undefined);
  const filtered = query.search.trim() !== "" || query.profileIds.length > 0 || query.categoryIds.length > 0 ||
    query.range !== "all" || query.customFrom !== null || query.customTo !== null;
  return <SafeAreaView style={ui.screen}>
    <FlatList
      data={loading ? [] : matched}
      keyExtractor={(row) => `${row.id}:${row.financialAccountProfileId ?? "all"}`}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: layout.pagePadding, flexGrow: 1 }}
      ListHeaderComponent={<View style={styles.headerContent}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("review.historyBack")} hitSlop={8} onPress={onBack}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <Ionicons name="chevron-back" size={24} color={theme.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={ui.label}>{t("review.historyEyebrow")}</Text>
            <Text accessibilityRole="header" style={styles.title}>{t("review.historyTitle")}</Text>
          </View>
        </View>
        {!loading && hasMore && <Text style={styles.muted}>{t("review.historyLoadedOnly")}</Text>}
        {!loading && <CapitalFlow key={`${out}-${inn}`} out={out} inn={inn} currency={currency} />}
        <View style={styles.search}>
          <Ionicons name="search-outline" size={18} color={theme.mutedForeground} />
          <TextInput accessibilityLabel={t("review.historySearchA11y")} placeholder={t("review.historySearchPlaceholder")} value={query.search}
            onChangeText={(search) => setQuery((current) => ({ ...current, search }))}
            placeholderTextColor={theme.mutedForeground} style={[ui.input, { flex: 1 }]} />
        </View>
        <HistoryFilters query={query} onQuery={setQuery} sort={sort} onSort={setSort}
          places={places} categories={categories} today={currentDate} />
        <View style={styles.count}>
          <Text style={styles.muted}>{loading ? t("review.historyLoading")
            : t(hasMore ? "review.historyCountLoaded" : "review.historyCount", { shown: matched.length, total: movementTotal ?? 0 })}</Text>
          {filtered && <Pressable accessibilityRole="button" accessibilityLabel={t("review.clearFilters")}
            onPress={() => setQuery(emptyQuery)} style={styles.clear}>
            <Text style={styles.clearText}>{t("review.clearFilters")}</Text>
          </Pressable>}
        </View>
      </View>}
      renderItem={({ item, index }) => <HistoryListRow row={item} onEntry={onEntry} isFirst={index === 0} isLast={index === matched.length - 1} />}
      ListFooterComponent={!loading && hasMore ? <Pressable accessibilityRole="button"
        accessibilityLabel={t("review.loadMore")} disabled={loadingMore} onPress={onLoadMore}
        style={styles.loadMore}>
        {loadingMore ? <ActivityIndicator accessibilityLabel={t("review.loadingMore")} /> :
          <Text style={styles.clearText}>{t("review.loadMore")}</Text>}
      </Pressable> : null}
      ListEmptyComponent={loading ? <ActivityIndicator accessibilityLabel={t("review.loadingActivity")} /> :
        <View style={styles.empty}><Text style={styles.muted}>{total === 0 ? t("review.historyEmpty") :
          hasMore ? t("review.historyNoLoadedMatch") : t("review.historyNoMatch")}</Text></View>}
    />
  </SafeAreaView>;
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
    title: { fontFamily: font.extrabold, fontSize: 32, lineHeight: 37, letterSpacing: -0.7, color: theme.foreground },
    search: {
      minHeight: touchTarget, flexDirection: "row", alignItems: "center", gap: spacing.sm,
      paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: theme.ring,
      backgroundColor: theme.secondary,
    },
    count: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
    muted: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: theme.mutedForeground },
    clear: { minHeight: 32, justifyContent: "center" },
    loadMore: { minHeight: touchTarget, alignItems: "center", justifyContent: "center", marginTop: spacing.lg },
    clearText: { fontFamily: font.bold, fontSize: 14, color: theme.primary },
    empty: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border },
    pressed: { opacity: 0.72 },
  });
}
