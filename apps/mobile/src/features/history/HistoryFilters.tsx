import Ionicons from "@expo/vector-icons/Ionicons";
import {
  BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme, ui } from "../../ui/core";
import { font, radius, spacing, touchTarget } from "../../ui/tokens";
import { dateRanges, sortDefaults, sortLabels, type HistoryQuery, type SortDir, type SortKey } from "./filter";
import type { HistoryCategory, HistoryPlace } from "./listModel";

type Sheet = "sort" | "places" | "categories" | "dates";
type Props = {
  query: HistoryQuery;
  onQuery: (query: HistoryQuery) => void;
  sort: { key: SortKey; dir: SortDir };
  onSort: (sort: Props["sort"]) => void;
  places: HistoryPlace[];
  categories: HistoryCategory[];
  today: string;
};

function shortDate(key: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${key}T12:00:00Z`));
}

function toggle(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}

export function HistoryFilters(props: Props) {
  const { query, sort, places, categories, today } = props;
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const place = places.find((place) => place.id === query.profileIds[0]);
  const category = categories.find((category) => category.id === query.categoryIds[0]);
  const placesLabel = query.profileIds.length === 0 ? "All places" : query.profileIds.length === 1 ?
    place?.name ?? "1 place" : `${query.profileIds.length} places`;
  const categoriesLabel = query.categoryIds.length === 0 ? "All categories" : query.categoryIds.length === 1 && category ?
    `${category.style.emoji} ${category.name}` : `${query.categoryIds.length} categories`;
  const custom = query.customFrom !== null || query.customTo !== null;
  const datesLabel = custom ? `${query.customFrom ? shortDate(query.customFrom) : "Start"} – ${query.customTo ? shortDate(query.customTo) : "today"}` :
    query.range === "all" ? "Dates" : dateRanges(today).find((range) => range.id === query.range)?.label ?? "Dates";

  return <>
    <View style={styles.chips}>
      <FilterChip label={sortLabels[sort.key][sort.dir]} icon="swap-vertical"
        active={sort.key !== "date" || sort.dir !== "desc"} onPress={() => setSheet("sort")} />
      <FilterChip label={placesLabel} active={query.profileIds.length > 0} onPress={() => setSheet("places")} />
      <FilterChip label={categoriesLabel} active={query.categoryIds.length > 0} onPress={() => setSheet("categories")} />
      <FilterChip label={datesLabel} active={query.range !== "all" || custom} onPress={() => setSheet("dates")} />
    </View>
    {sheet && <FilterSheet key={sheet} {...props} sheet={sheet} onClose={() => setSheet(null)} />}
  </>;
}

function FilterChip({ label, active, icon, onPress }: {
  label: string; active: boolean; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }}
    onPress={onPress} style={[styles.chip, active && styles.selected]}>
    {icon && <Ionicons name={icon} size={16} color={theme.foreground} />}
    <Text style={styles.chipText}>{label}</Text>
    <Ionicons name="chevron-down" size={14} color={theme.mutedForeground} />
  </Pressable>;
}

const sortOptions: { key: SortKey; label: string }[] = [
  { key: "date", label: "Date" }, { key: "amount", label: "Amount" },
  { key: "place", label: "Place" }, { key: "category", label: "Category" },
];

function FilterSheet({ sheet, onClose, query, onQuery, sort, onSort, places, categories, today }: Props & {
  sheet: Sheet; onClose: () => void;
}) {
  const modal = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [pickerFor, setPickerFor] = useState<"customFrom" | "customTo" | null>(null);
  useEffect(() => { modal.current?.present(); }, []);
  const custom = query.customFrom !== null || query.customTo !== null;
  const matchedCategories = categories.filter((category) => category.name.toLowerCase().includes(search.trim().toLowerCase()));
  const pickerValue = pickerFor ? query[pickerFor] ?? today : today;

  return <BottomSheetModal ref={modal} enablePanDownToClose onDismiss={onClose}
    snapPoints={sheet === "categories" ? ["70%"] : undefined} enableDynamicSizing={sheet !== "categories"}
    backgroundStyle={styles.surface} handleIndicatorStyle={{ backgroundColor: theme.ring }}
    keyboardBehavior="interactive" keyboardBlurBehavior="restore"
    backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />}>
    <BottomSheetScrollView keyboardShouldPersistTaps="handled" stickyHeaderIndices={sheet === "categories" ? [0] : undefined}
      contentContainerStyle={[styles.body, { paddingBottom: Math.max(insets.bottom, spacing.xxl) + spacing.xl }]}>
      <View style={sheet === "categories" ? styles.searchHeader : undefined}>
        <Text style={ui.label}>{sheet === "sort" ? "SORT BY" : sheet === "places" ? "PLACES" : sheet === "categories" ? "CATEGORIES" : "DATES"}</Text>
        {sheet === "categories" && <BottomSheetTextInput accessibilityLabel="Search categories" placeholder="Search categories" value={search}
          onChangeText={setSearch} placeholderTextColor={theme.mutedForeground} style={styles.input} />}
      </View>
      {sheet === "categories" ? <View style={styles.chips}>
          <Pressable accessibilityRole="checkbox" accessibilityLabel="All categories"
            accessibilityState={{ checked: query.categoryIds.length === 0 }} onPress={() => onQuery({ ...query, categoryIds: [] })}
            style={[styles.chip, query.categoryIds.length === 0 && styles.selected]}>
            <Text style={styles.chipText}>All categories</Text>
          </Pressable>
          {matchedCategories.map((category) => {
            const selected = query.categoryIds.includes(category.id);
            const color = theme[category.style.tone];
            return <Pressable key={category.id} accessibilityRole="checkbox" accessibilityLabel={category.name}
              accessibilityState={{ checked: selected }} onPress={() => onQuery({ ...query, categoryIds: toggle(query.categoryIds, category.id) })}
              style={[styles.chip, selected && { borderColor: color, borderWidth: 2, backgroundColor: `${color}3D` }]}>
              <Text style={styles.emoji}>{category.style.emoji}</Text><Text style={styles.chipText}>{category.name}</Text>
            </Pressable>;
          })}
          {matchedCategories.length === 0 && <Text style={ui.muted}>{`No category matches "${search.trim()}".`}</Text>}
      </View> : <>
        {sheet === "sort" && <>
          {sortOptions.map(({ key, label }) => {
            const selected = key === sort.key;
            return <Pressable key={key} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected }}
              onPress={() => onSort({ key, dir: selected ? sort.dir === "asc" ? "desc" : "asc" : sortDefaults[key] })}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <Text style={styles.rowTitle}>{label}</Text>
              <View style={styles.sortState}>
                <Text style={selected ? styles.sortText : ui.muted}>{sortLabels[key][selected ? sort.dir : sortDefaults[key]]}</Text>
                {selected && <Ionicons name={sort.dir === "desc" ? "arrow-down" : "arrow-up"} size={18} color={theme.primary} />}
              </View>
            </Pressable>;
          })}
          <Text style={ui.muted}>Tap the active one to flip the order.</Text>
        </>}
        {sheet === "places" && [{ id: null, name: "All places" }, ...places].map((place) => {
          const checked = place.id === null ? query.profileIds.length === 0 : query.profileIds.includes(place.id);
          return <Pressable key={place.id ?? "all"} accessibilityRole="checkbox" accessibilityLabel={place.name}
            accessibilityState={{ checked }} onPress={() => onQuery({ ...query,
              profileIds: place.id === null ? [] : toggle(query.profileIds, place.id) })}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <Text style={styles.rowTitle}>{place.name}</Text>
            {checked && <Ionicons name="checkmark" size={20} color={theme.primary} />}
          </Pressable>;
        })}
        {sheet === "dates" && <>
          <View style={styles.chips}>
            {dateRanges(today).map((range) => {
              const selected = !custom && range.id === query.range;
              return <Pressable key={range.id} accessibilityRole="radio" accessibilityLabel={range.label} accessibilityState={{ selected }}
                onPress={() => { setPickerFor(null); onQuery({ ...query, range: range.id, customFrom: null, customTo: null }); }}
                style={[styles.chip, selected && styles.selected]}><Text style={styles.chipText}>{range.label}</Text></Pressable>;
            })}
          </View>
          <Text style={styles.fieldLabel}>Or choose your own</Text>
          <View style={styles.dateFields}>
            {(["customFrom", "customTo"] as const).map((field) => <Pressable key={field} accessibilityRole="button"
              accessibilityLabel={field === "customFrom" ? "Pick the from date" : "Pick the to date"}
              onPress={() => setPickerFor(field)} style={[styles.input, styles.dateButton]}>
              <Text style={styles.chipText}>{query[field] ? shortDate(query[field]) : field === "customFrom" ? "From" : "To"}</Text>
              <Ionicons name="calendar-outline" size={18} color={theme.mutedForeground} />
            </Pressable>)}
          </View>
          {pickerFor && <>
            <DateTimePicker value={new Date(`${pickerValue}T12:00:00`)} mode="date" display={Platform.OS === "ios" ? "inline" : "default"}
              onChange={(event, date) => {
                if (Platform.OS !== "ios") setPickerFor(null);
                if (event.type !== "set" || !date) return;
                const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
                onQuery({ ...query, [pickerFor]: key });
              }} />
            {Platform.OS === "ios" && <Pressable accessibilityRole="button" accessibilityLabel="Done choosing date"
              onPress={() => setPickerFor(null)} style={styles.row}><Text style={styles.sortText}>Done</Text></Pressable>}
          </>}
        </>}
      </>}
    </BottomSheetScrollView>
  </BottomSheetModal>;
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    minHeight: touchTarget, flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full,
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.secondary,
  },
  selected: { borderWidth: 2, borderColor: theme.primary },
  chipText: { color: theme.foreground, fontFamily: font.semibold, fontSize: 14 },
  emoji: { fontSize: 17 },
  surface: {
    backgroundColor: theme.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    borderWidth: 1, borderColor: theme.border,
  },
  body: { paddingHorizontal: spacing.xxl, paddingTop: spacing.sm, gap: spacing.md },
  searchHeader: { backgroundColor: theme.background, gap: spacing.md, paddingBottom: spacing.md },
  input: {
    minHeight: 56, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1,
    borderColor: theme.ring, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: font.regular, fontSize: 16,
  },
  row: { minHeight: touchTarget, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  rowTitle: { color: theme.foreground, fontFamily: font.semibold, fontSize: 16, flexShrink: 1 },
  sortState: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  sortText: { color: theme.primary, fontFamily: font.bold, fontSize: 14 },
  fieldLabel: { color: theme.foreground, fontFamily: font.semibold, fontSize: 14 },
  dateFields: { flexDirection: "row", gap: spacing.sm },
  dateButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  pressed: { opacity: 0.72 },
});
