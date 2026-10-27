import type { Theme } from "../../ui/tokens";
import { useReadableLayout } from "../../ui/themeContext";
import type { ReadableLayout } from "../../ui/layout";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  BottomSheetBackdrop, BottomSheetScrollView, BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useMemo, useState, type ComponentProps } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionBar, ChoiceRow, Group, IconTile, ListRow, Presentation, SheetHeader, Text, TextInput, useReflowStyles, useTheme, useUi } from "../../ui/core";
import { PickerSheet } from "../../ui/PickerSheet";
import { radius, spacing, touchTarget } from "../../ui/tokens";
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
  presentation: ReturnType<typeof useHistoryFilterPresentation>;
};

export function useHistoryFilterPresentation() {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [search, setSearch] = useState("");
  const [pickerFor, setPickerFor] = useState<"customFrom" | "customTo" | null>(null);
  function open(next: Sheet) { setSearch(""); setPickerFor(null); setSheet(next); }
  return { sheet, open, close: () => setSheet(null), search, setSearch, pickerFor, setPickerFor };
}

function shortDate(key: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${key}T12:00:00Z`));
}

function toggle(ids: string[], id: string) {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}

export function HistoryFilters(props: Props) {
  const theme = useTheme();
  const layout = useReadableLayout();
  const styles = useMemo(() => createStyles(theme, layout), [theme, layout]);
  const { query, sort, places, categories, today } = props;
  const { open } = props.presentation;
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
    <Presentation legacy={<View style={styles.chips}>
      <FilterChip label={sortLabels[sort.key][sort.dir]} icon="swap-vertical"
        active={sort.key !== "date" || sort.dir !== "desc"} onPress={() => open("sort")} />
      <FilterChip label={placesLabel} active={query.profileIds.length > 0} onPress={() => open("places")} />
      <FilterChip label={categoriesLabel} active={query.categoryIds.length > 0} onPress={() => open("categories")} />
      <FilterChip label={datesLabel} active={query.range !== "all" || custom} onPress={() => open("dates")} />
    </View>}>
      <Group pairGap={12}>
        {([
          { key: "sort", label: "Sort", value: sortLabels[sort.key][sort.dir], icon: "swap-vertical" },
          { key: "places", label: "Places", value: query.profileIds.length ? placesLabel : `All ${places.length} places`, icon: "wallet-outline" },
          { key: "categories", label: "Categories", value: query.categoryIds.length ? categoriesLabel : `All ${categories.length}`, icon: "pricetag-outline" },
          { key: "dates", label: "Dates", value: datesLabel === "Dates" ? "All time" : datesLabel, icon: "calendar-outline" },
        ] as const).map((filter) => <ListRow key={filter.key} title={filter.label} onPress={() => open(filter.key)}
          leading={<IconTile icon={filter.icon} tone={filter.key === "sort" ? "primary" : "neutral"} size={36} />}
          accessibilityLabel={`${filter.label}, ${filter.value}`}>
          <Text variant="status" tone="muted">{filter.value}</Text>
        </ListRow>)}
      </Group>
    </Presentation>
  </>;
}

export function HistoryFilterSheet(props: Props) {
  const { sheet, close } = props.presentation;
  return sheet ? <FilterSheet key={sheet} {...props} sheet={sheet} onClose={close} /> : null;
}

function FilterChip({ label, active, icon, onPress }: {
  label: string; active: boolean; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void;
}) {
  const theme = useTheme();
  const layout = useReadableLayout();
  const styles = useMemo(() => createStyles(theme, layout), [theme, layout]);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }}
    onPress={onPress} style={[styles.chip, active && styles.selected]}>
    {icon && <Ionicons name={icon} size={16} color={theme.foreground} />}
    <Text preset="rowMoney" style={styles.chipText}>{label}</Text>
    <Ionicons name="chevron-down" size={14} color={theme.mutedForeground} />
  </Pressable>;
}

const sortOptions: { key: SortKey; label: string }[] = [
  { key: "date", label: "Date" }, { key: "amount", label: "Amount" },
  { key: "place", label: "Place" }, { key: "category", label: "Category" },
];

function FilterSheet({ sheet, onClose, query, onQuery, sort, onSort, places, categories, today, presentation }: Props & {
  sheet: Sheet; onClose: () => void;
}) {
  const ui = useUi();
  const reflow = useReflowStyles();
  const theme = useTheme();
  const layout = useReadableLayout();
  const styles = useMemo(() => createStyles(theme, layout), [theme, layout]);
  const insets = useSafeAreaInsets();
  const { search, setSearch, pickerFor, setPickerFor } = presentation;
  const custom = query.customFrom !== null || query.customTo !== null;
  const matchedCategories = categories.filter((category) => category.name.toLowerCase().includes(search.trim().toLowerCase()));
  const pickerValue = pickerFor ? query[pickerFor] ?? today : today;

  const legacyNativeModalProps: NonNullable<ComponentProps<typeof PickerSheet>["legacyNativeModalProps"]> = { enablePanDownToClose: true,
    snapPoints: sheet === "categories" ? ["70%"] : undefined, enableDynamicSizing: sheet !== "categories",
    backgroundStyle: styles.surface, handleIndicatorStyle: { backgroundColor: theme.ring },
    keyboardBehavior: "interactive", keyboardBlurBehavior: "restore",
    backdropComponent: (props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" /> };
  const legacyBody = <BottomSheetScrollView keyboardShouldPersistTaps="handled" stickyHeaderIndices={sheet === "categories" ? [0] : undefined}
      contentContainerStyle={[styles.body, { paddingBottom: Math.max(insets.bottom, spacing.xxl) + spacing.xl }]}>
      <View style={sheet === "categories" ? styles.searchHeader : undefined}>
        <Text variant="label" style={ui.label}>{sheet === "sort" ? "SORT BY" : sheet === "places" ? "PLACES" : sheet === "categories" ? "CATEGORIES" : "DATES"}</Text>
        {sheet === "categories" && <TextInput preset="body" InputComponent={BottomSheetTextInput} accessibilityLabel="Search categories" placeholder="Search categories" value={search}
          onChangeText={setSearch} placeholderTextColor={theme.mutedForeground} style={styles.input} />}
      </View>
      {sheet === "categories" ? <View style={styles.chips}>
          <Pressable accessibilityRole="checkbox" accessibilityLabel="All categories"
            accessibilityState={{ checked: query.categoryIds.length === 0 }} onPress={() => onQuery({ ...query, categoryIds: [] })}
            style={[styles.chip, query.categoryIds.length === 0 && styles.selected]}>
            <Text preset="rowMoney" style={styles.chipText}>All categories</Text>
          </Pressable>
          {matchedCategories.map((category) => {
            const selected = query.categoryIds.includes(category.id);
            const color = theme[category.style.tone];
            return <Pressable key={category.id} accessibilityRole="checkbox" accessibilityLabel={category.name}
              accessibilityState={{ checked: selected }} onPress={() => onQuery({ ...query, categoryIds: toggle(query.categoryIds, category.id) })}
              style={[styles.chip, selected && { borderColor: color, borderWidth: 2, backgroundColor: `${color}3D` }]}>
              <Text preset="emoji17">{category.style.emoji}</Text><Text preset="rowMoney" style={styles.chipText}>{category.name}</Text>
            </Pressable>;
          })}
          {matchedCategories.length === 0 && <Text preset="body" style={ui.muted}>{`No category matches "${search.trim()}".`}</Text>}
      </View> : <>
        {sheet === "sort" && <>
          {sortOptions.map(({ key, label }) => {
            const selected = key === sort.key;
            return <Pressable key={key} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected }}
              onPress={() => onSort({ key, dir: selected ? sort.dir === "asc" ? "desc" : "asc" : sortDefaults[key] })}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <Text preset="rowName" style={styles.rowTitle}>{label}</Text>
              <View style={styles.sortState}>
                <Text preset={selected ? "filterSort" : "body"} style={selected ? styles.sortText : ui.muted}>{sortLabels[key][selected ? sort.dir : sortDefaults[key]]}</Text>
                {selected && <Ionicons name={sort.dir === "desc" ? "arrow-down" : "arrow-up"} size={18} color={theme.primary} />}
              </View>
            </Pressable>;
          })}
          <Text preset="body" style={ui.muted}>Tap the active one to flip the order.</Text>
        </>}
        {sheet === "places" && [{ id: null, name: "All places" }, ...places].map((place) => {
          const checked = place.id === null ? query.profileIds.length === 0 : query.profileIds.includes(place.id);
          return <Pressable key={place.id ?? "all"} accessibilityRole="checkbox" accessibilityLabel={place.name}
            accessibilityState={{ checked }} onPress={() => onQuery({ ...query,
              profileIds: place.id === null ? [] : toggle(query.profileIds, place.id) })}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <Text preset="rowName" style={styles.rowTitle}>{place.name}</Text>
            {checked && <Ionicons name="checkmark" size={20} color={theme.primary} />}
          </Pressable>;
        })}
        {sheet === "dates" && <>
          <View style={styles.chips}>
            {dateRanges(today).map((range) => {
              const selected = !custom && range.id === query.range;
              return <Pressable key={range.id} accessibilityRole="radio" accessibilityLabel={range.label} accessibilityState={{ selected }}
                onPress={() => { setPickerFor(null); onQuery({ ...query, range: range.id, customFrom: null, customTo: null }); }}
                style={[styles.chip, selected && styles.selected]}><Text preset="rowMoney" style={styles.chipText}>{range.label}</Text></Pressable>;
            })}
          </View>
          <Text preset="fieldLabel" style={styles.fieldLabel}>Or choose your own</Text>
          <View style={[styles.dateFields, reflow.row()]}>
            {(["customFrom", "customTo"] as const).map((field) => <Pressable key={field} accessibilityRole="button"
              accessibilityLabel={field === "customFrom" ? "Pick the from date" : "Pick the to date"}
              onPress={() => setPickerFor(field)} style={[styles.input, styles.dateButton, reflow.flex(1, 0)]}>
              <Text preset="rowMoney" style={styles.chipText}>{query[field] ? shortDate(query[field]) : field === "customFrom" ? "From" : "To"}</Text>
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
              onPress={() => setPickerFor(null)} style={styles.row}><Text preset="filterSort" style={styles.sortText}>Done</Text></Pressable>}
          </>}
        </>}
      </>}
    </BottomSheetScrollView>;
  const title = sheet === "sort" ? "Sort" : sheet === "places" ? "Places" : sheet === "categories" ? "Categories" : "Dates";
  return <PickerSheet legacyBody={legacyBody} legacyBodyMode="native" legacyNativeModalProps={legacyNativeModalProps} onDismiss={onClose} stickyHeader={false} footer={<ActionBar primary={{ label: "Show movements", onPress: onClose, icon: "checkmark" }} />}>
      <SheetHeader title={title} eyebrow="FILTER TX HISTORY" onClose={onClose} />
      {sheet === "sort" && <>
        {sortOptions.map(({ key, label }) => <ChoiceRow key={key} presentation="option" label={label}
          detail={sortLabels[key][key === sort.key ? sort.dir : sortDefaults[key]]} selected={key === sort.key}
          onPress={() => onSort({ key, dir: key === sort.key ? sort.dir === "asc" ? "desc" : "asc" : sortDefaults[key] })} />)}
        <Text variant="meta" tone="muted">Tap the chosen one to flip the order.</Text>
      </>}
      {sheet === "places" && [{ id: null, name: "All places" }, ...places].map((place) => <ChoiceRow key={place.id ?? "all"}
        kind="checkbox" presentation="option" label={place.name}
        selected={place.id === null ? query.profileIds.length === 0 : query.profileIds.includes(place.id)}
        onPress={() => onQuery({ ...query, profileIds: place.id === null ? [] : toggle(query.profileIds, place.id) })} />)}
      {sheet === "categories" && <>
        <TextInput preset="body" InputComponent={BottomSheetTextInput} accessibilityLabel="Search categories" placeholder="Search categories" value={search}
          onChangeText={setSearch} placeholderTextColor={theme.mutedForeground} style={[styles.input, { minHeight: 64 }]} />
        <ChoiceRow kind="checkbox" presentation="option" label="All categories" selected={query.categoryIds.length === 0}
          onPress={() => onQuery({ ...query, categoryIds: [] })} />
        {matchedCategories.map((category) => <ChoiceRow key={category.id} kind="checkbox" presentation="option" label={category.name}
          selected={query.categoryIds.includes(category.id)} onPress={() => onQuery({ ...query, categoryIds: toggle(query.categoryIds, category.id) })} />)}
        {matchedCategories.length === 0 && <Text variant="meta" tone="muted">{`No category matches "${search.trim()}".`}</Text>}
      </>}
      {sheet === "dates" && <>
        {dateRanges(today).map((range) => <ChoiceRow key={range.id} presentation="option" label={range.label} selected={!custom && range.id === query.range}
          onPress={() => { setPickerFor(null); onQuery({ ...query, range: range.id, customFrom: null, customTo: null }); }} />)}
        <ChoiceRow presentation="option" label="Pick dates" selected={custom} onPress={() => setPickerFor("customFrom")} />
        <ChoiceRow presentation="option" label={query.customFrom ? `From ${shortDate(query.customFrom)}` : "From"} selected={pickerFor === "customFrom"}
          onPress={() => setPickerFor("customFrom")} />
        <ChoiceRow presentation="option" label={query.customTo ? `To ${shortDate(query.customTo)}` : "To"} selected={pickerFor === "customTo"}
          onPress={() => setPickerFor("customTo")} />
        {pickerFor && <DateTimePicker value={new Date(`${pickerValue}T12:00:00`)} mode="date" display={Platform.OS === "ios" ? "inline" : "default"}
          onChange={(event, date) => {
            if (Platform.OS !== "ios") setPickerFor(null);
            if (event.type !== "set" || !date) return;
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
            onQuery({ ...query, [pickerFor]: key });
          }} />}
        {pickerFor && Platform.OS === "ios" && <ChoiceRow presentation="option" label="Done choosing date" selected={false} onPress={() => setPickerFor(null)} />}
      </>}
  </PickerSheet>;
}

function createStyles(theme: Theme, layout: ReadableLayout) {
  return StyleSheet.create({
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: {
      maxWidth: "100%",
      minHeight: touchTarget, flexDirection: "row", alignItems: "center", gap: spacing.sm,
      paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full,
      borderWidth: 1, borderColor: theme.border, backgroundColor: theme.secondary,
    },
    selected: { borderWidth: 2, borderColor: theme.primary },
    chipText: { flexShrink: 1, color: theme.foreground },
    surface: {
      backgroundColor: theme.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
      borderWidth: 1, borderColor: theme.border,
    },
    body: { paddingHorizontal: layout.pagePadding, paddingTop: spacing.sm, gap: spacing.md },
    searchHeader: { backgroundColor: theme.background, gap: spacing.md, paddingBottom: spacing.md },
    input: {
      minHeight: 56, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1,
      borderColor: theme.ring, backgroundColor: theme.secondary, color: theme.foreground,
    },
    row: { minHeight: touchTarget, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
    rowTitle: { color: theme.foreground, flexShrink: 1 },
    sortState: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    sortText: { color: theme.primary },
    fieldLabel: { color: theme.foreground },
    dateFields: { gap: spacing.sm },
    dateButton: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    pressed: { opacity: 0.72 },
  });
}
