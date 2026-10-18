import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme, ui } from "../../ui/core";
import { font, radius, spacing, touchTarget } from "../../ui/tokens";
import { CapitalFlow } from "./CapitalFlow";
import { HistoryListRow } from "./HistoryListRow";
import { capitalFlow, historyListRow, searchHistory, type HistoryCategory, type HistoryPlace } from "./listModel";
import type { HistoryRow } from "./types";

export function HistoryScreen({ rows, total, categories, places, currentDate, currency, placeSelected, onClear, onEntry, onBack }: {
  rows: HistoryRow[] | undefined;
  total: number | undefined;
  categories: HistoryCategory[];
  places: HistoryPlace[];
  currentDate: string;
  currency: string;
  placeSelected: boolean;
  onClear: () => void;
  onEntry: (id: string) => void;
  onBack: () => void;
}) {
  const [search, setSearch] = useState("");
  const listRows = useMemo(() => (rows ?? []).map((row) => historyListRow(row, categories, places, currentDate)),
    [rows, categories, places, currentDate]);
  const matched = useMemo(() => searchHistory(listRows, search), [listRows, search]);
  const { out, inn } = capitalFlow(matched);
  const loading = rows === undefined || total === undefined;
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
          <TextInput accessibilityLabel="Search transactions" placeholder="Search" value={search} onChangeText={setSearch}
            placeholderTextColor={theme.mutedForeground} style={[ui.input, { flex: 1 }]} />
        </View>
        <View style={styles.count}>
          <Text style={styles.muted}>{loading ? "Loading history…" : `${matched.length} of ${total}`}</Text>
          {(search.trim() !== "" || placeSelected) && <Pressable accessibilityRole="button" accessibilityLabel="Clear filters"
            onPress={() => { setSearch(""); onClear(); }} style={styles.clear}>
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
