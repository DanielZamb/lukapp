// Tx history: search, bottom-sheet filters (multi-pick places and categories
// with their looks, quick date ranges plus the native calendar for bespoke
// spans), one sort control, and a detail sheet per row. UX budget on the
// page: header 1, search 2, chip row 3, count line 4, list 5. Each sheet is
// its own surface and stays at 5 groups or fewer.

import Ionicons from "@expo/vector-icons/Ionicons";
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  font,
  fontSize,
  radius,
  spacing,
  touchTarget,
  type Theme,
  type ThemeMode,
} from "../theme/tokens";
import {
  SheetTextInput,
  currencySymbol,
  paletteColor,
  renderSheetBackdrop,
  type CategoryLook,
} from "./first-time-setup";
import { CapitalFlow } from "./capital-flow";
import { lookFor } from "./level-1-door";
import {
  dateRanges,
  filterHistory,
  historyPlaces,
  placeEmoji,
  placeName,
  sortHistory,
  type Activity,
  type DateRangeId,
  type SortDir,
  type SortKey,
} from "./tx-history-data";

// No web implementation exists for the native calendar; the web fallback is
// two plain date fields inside the dates sheet.
const NativeDatePicker =
  Platform.OS === "web"
    ? null
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("@react-native-community/datetimepicker")
        .default as React.ComponentType<{
        value: Date;
        mode: "date";
        onChange: (event: { type: string }, date?: Date) => void;
      }>);

function lightTap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

type SheetId = "sort" | "places" | "categories" | "dates" | null;

const sortLabels: Record<SortKey, Record<SortDir, string>> = {
  date: { desc: "Newest first", asc: "Oldest first" },
  amount: { desc: "Biggest first", asc: "Smallest first" },
  place: { asc: "Place A to Z", desc: "Place Z to A" },
  category: { asc: "Category A to Z", desc: "Category Z to A" },
};

const sortDefaults: Record<SortKey, SortDir> = {
  date: "desc",
  amount: "desc",
  place: "asc",
  category: "asc",
};

const monthShort = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function shortLabel(key: string) {
  const [, month, day] = key.split("-");
  const index = Number(month) - 1;
  return `${monthShort[index] ?? month} ${Number(day)}`;
}

function keyFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(key: string | null) {
  if (!key) {
    return new Date(2026, 7, 23);
  }
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

const incomeLook: CategoryLook = { emoji: "💸", color: "h120" };

export function TxHistory({
  activity,
  currency,
  theme,
  themeMode,
  categoryLooks,
  places = historyPlaces,
  initialAccountIds = [],
  onBack,
}: {
  activity: Activity[];
  currency: string;
  theme: Theme;
  themeMode: ThemeMode;
  categoryLooks: Record<string, CategoryLook>;
  places?: readonly { id: string; name: string; emoji: string }[];
  initialAccountIds?: string[];
  onBack: () => void;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [search, setSearch] = useState("");
  const [accountIds, setAccountIds] = useState<string[]>(initialAccountIds);
  const [categories, setCategories] = useState<string[]>([]);
  const [range, setRange] = useState<DateRangeId>("all");
  const [customFrom, setCustomFrom] = useState<string | null>(null);
  const [customTo, setCustomTo] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [sheet, setSheet] = useState<SheetId>(null);
  const [detail, setDetail] = useState<Activity | null>(null);
  const [catSearch, setCatSearch] = useState("");
  const [pickerFor, setPickerFor] = useState<"from" | "to" | null>(null);

  const allCategories = useMemo(() => {
    const seen = new Set<string>();
    for (const item of activity) {
      seen.add(item.category);
    }
    return [...seen].sort((left, right) => left.localeCompare(right));
  }, [activity]);

  const rows = sortHistory(
    filterHistory(activity, {
      search,
      accountIds,
      categories,
      range,
      customFrom,
      customTo,
    }),
    sortKey,
    sortDir,
  );

  const symbol = currencySymbol(currency);
  const out = rows
    .filter((item) => item.direction === "out")
    .reduce((sum, item) => sum + item.amount, 0);
  const inn = rows
    .filter((item) => item.direction === "in")
    .reduce((sum, item) => sum + item.amount, 0);
  const custom = customFrom !== null || customTo !== null;
  const filtersActive =
    accountIds.length > 0 || categories.length > 0 || range !== "all" || custom;

  function lookOf(name: string) {
    return name === "Income" ? incomeLook : lookFor(name, categoryLooks);
  }

  function signed(item: Activity) {
    return `${item.direction === "in" ? "+" : "−"}${symbol}${item.amount.toLocaleString("es-CO")}`;
  }

  function emojiOf(id: string) {
    return places.find((place) => place.id === id)?.emoji ?? placeEmoji(id);
  }

  function nameOf(id: string) {
    return places.find((place) => place.id === id)?.name ?? placeName(id);
  }

  const placesLabel =
    accountIds.length === 0
      ? "All places"
      : accountIds.length === 1
        ? `${emojiOf(accountIds[0])} ${nameOf(accountIds[0])}`
        : `${accountIds.length} places`;
  const firstCategory = categories[0];
  const categoriesLabel =
    categories.length === 0
      ? "All categories"
      : categories.length === 1 && firstCategory
        ? `${lookOf(firstCategory).emoji} ${firstCategory}`
        : `${categories.length} categories`;
  const datesLabel = custom
    ? `${customFrom ? shortLabel(customFrom) : "Start"} – ${customTo ? shortLabel(customTo) : "today"}`
    : (dateRanges.find((entry) => entry.id === range)?.label ?? "Dates");

  function togglePlace(id: string) {
    setAccountIds((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );
  }

  function toggleCategory(name: string) {
    setCategories((current) =>
      current.includes(name)
        ? current.filter((entry) => entry !== name)
        : [...current, name],
    );
  }

  function chooseSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(sortDefaults[key]);
  }

  function pickQuickRange(id: DateRangeId) {
    setRange(id);
    setCustomFrom(null);
    setCustomTo(null);
  }

  function clearFilters() {
    setAccountIds([]);
    setCategories([]);
    setRange("all");
    setCustomFrom(null);
    setCustomTo(null);
    setSearch("");
  }

  const matchedCategories = allCategories.filter((name) =>
    name.toLowerCase().includes(catSearch.trim().toLowerCase()),
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.pageHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            onPress={onBack}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={24} color={theme.foreground} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>ACROSS ALL PLACES</Text>
            <Text style={styles.pageTitle}>Tx history</Text>
          </View>
        </View>

        <CapitalFlow
          key={`${out}-${inn}`}
          out={out}
          inn={inn}
          symbol={symbol}
          theme={theme}
        />

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={theme.mutedForeground} />
          <TextInput
            accessibilityLabel="Search transactions"
            value={search}
            onChangeText={setSearch}
            placeholder="Search"
            placeholderTextColor={theme.mutedForeground}
            style={styles.searchInput}
          />
        </View>

        <View style={styles.chipRow}>
          <FilterChip
            label={sortLabels[sortKey][sortDir]}
            icon="swap-vertical"
            active={sortKey !== "date" || sortDir !== "desc"}
            styles={styles}
            theme={theme}
            onPress={() => setSheet("sort")}
          />
          <FilterChip
            label={placesLabel}
            active={accountIds.length > 0}
            styles={styles}
            theme={theme}
            onPress={() => setSheet("places")}
          />
          <FilterChip
            label={categoriesLabel}
            active={categories.length > 0}
            styles={styles}
            theme={theme}
            onPress={() => {
              setCatSearch("");
              setSheet("categories");
            }}
          />
          <FilterChip
            label={datesLabel === "All time" ? "Dates" : datesLabel}
            active={range !== "all" || custom}
            styles={styles}
            theme={theme}
            onPress={() => setSheet("dates")}
          />
        </View>

        <View style={styles.countRow}>
          <Text style={styles.muted}>
            {rows.length} of {activity.length}
          </Text>
          {(filtersActive || search.trim() !== "") && (
            <Pressable
              accessibilityRole="button"
              onPressIn={lightTap}
              onPress={clearFilters}
              style={styles.clearButton}
            >
              <Text style={styles.clearText}>Clear filters</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.listGroup}>
          {rows.length === 0 ? (
            <View style={styles.listRow}>
              <Text style={styles.muted}>
                Nothing matches these filters. Clear them to see everything.
              </Text>
            </View>
          ) : (
            rows.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`${item.description}, ${signed(item)}`}
                onPressIn={lightTap}
                onPress={() => setDetail(item)}
                style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}
              >
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.description}
                  </Text>
                  <Text style={styles.muted} numberOfLines={1}>
                    {item.date} · {lookOf(item.category).emoji} {item.category} ·{" "}
                    {emojiOf(item.accountId)} {nameOf(item.accountId)}
                  </Text>
                </View>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.rowValue,
                    item.direction === "in" && { color: theme.primary },
                  ]}
                >
                  {signed(item)}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>

      {sheet === "sort" && (
        <BottomSheet
          enablePanDownToClose
          onClose={() => setSheet(null)}
          backdropComponent={renderSheetBackdrop}
          backgroundStyle={styles.sheetSurface}
          handleIndicatorStyle={styles.sheetHandle}
        >
          <BottomSheetView style={styles.sheetBody}>
            <Text style={styles.eyebrow}>SORT BY</Text>
            {(Object.keys(sortLabels) as SortKey[]).map((key) => {
              const selected = key === sortKey;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPressIn={lightTap}
                  onPress={() => chooseSort(key)}
                  style={({ pressed }) => [
                    styles.sheetRow,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.rowTitle}>
                    {key === "date"
                      ? "Date"
                      : key === "amount"
                        ? "Amount"
                        : key === "place"
                          ? "Place"
                          : "Category"}
                  </Text>
                  {selected ? (
                    <View style={styles.sortState}>
                      <Text style={styles.sortStateText}>
                        {sortLabels[key][sortDir]}
                      </Text>
                      <Ionicons
                        name={sortDir === "desc" ? "arrow-down" : "arrow-up"}
                        size={18}
                        color={theme.primary}
                      />
                    </View>
                  ) : (
                    <Text style={styles.muted}>{sortLabels[key][sortDefaults[key]]}</Text>
                  )}
                </Pressable>
              );
            })}
            <Text style={styles.muted}>Tap the active one to flip the order.</Text>
          </BottomSheetView>
        </BottomSheet>
      )}

      {sheet === "places" && (
        <BottomSheet
          enablePanDownToClose
          onClose={() => setSheet(null)}
          backdropComponent={renderSheetBackdrop}
          backgroundStyle={styles.sheetSurface}
          handleIndicatorStyle={styles.sheetHandle}
        >
          <BottomSheetView style={styles.sheetBody}>
            <Text style={styles.eyebrow}>PLACES</Text>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: accountIds.length === 0 }}
              onPressIn={lightTap}
              onPress={() => setAccountIds([])}
              style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
            >
              <Text style={styles.rowTitle}>All places</Text>
              {accountIds.length === 0 && (
                <Ionicons name="checkmark" size={20} color={theme.primary} />
              )}
            </Pressable>
            {places.map((place) => {
              const checked = accountIds.includes(place.id);
              return (
                <Pressable
                  key={place.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  onPressIn={lightTap}
                  onPress={() => togglePlace(place.id)}
                  style={({ pressed }) => [
                    styles.sheetRow,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.rowTitle}>
                    {place.emoji} {place.name}
                  </Text>
                  {checked && (
                    <Ionicons name="checkmark" size={20} color={theme.primary} />
                  )}
                </Pressable>
              );
            })}
          </BottomSheetView>
        </BottomSheet>
      )}

      {sheet === "categories" && (
        <BottomSheet
          enablePanDownToClose
          onClose={() => setSheet(null)}
          backdropComponent={renderSheetBackdrop}
          snapPoints={["70%"]}
          enableDynamicSizing={false}
          backgroundStyle={styles.sheetSurface}
          handleIndicatorStyle={styles.sheetHandle}
          keyboardBehavior="interactive"
          keyboardBlurBehavior="restore"
        >
          <BottomSheetScrollView
            contentContainerStyle={styles.sheetListContent}
            keyboardShouldPersistTaps="handled"
            stickyHeaderIndices={[0]}
          >
            <View style={styles.sheetSearchWrap}>
              <Text style={styles.eyebrow}>CATEGORIES</Text>
              <SheetTextInput
                accessibilityLabel="Search categories"
                value={catSearch}
                onChangeText={setCatSearch}
                placeholder="Search categories"
                placeholderTextColor={theme.mutedForeground}
                style={styles.input}
              />
            </View>
            <View style={styles.sheetChipWrap}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: categories.length === 0 }}
                onPressIn={lightTap}
                onPress={() => setCategories([])}
                style={[
                  styles.lookChip,
                  categories.length === 0 && styles.lookChipNeutral,
                ]}
              >
                <Text style={styles.chipText}>All categories</Text>
              </Pressable>
              {matchedCategories.map((name) => {
                const look = lookOf(name);
                const color = paletteColor(look.color, themeMode);
                const selected = categories.includes(name);
                return (
                  <Pressable
                    key={name}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    onPressIn={lightTap}
                    onPress={() => toggleCategory(name)}
                    style={[
                      styles.lookChip,
                      selected && {
                        backgroundColor: `${color}24`,
                        borderColor: color,
                        borderWidth: 2,
                      },
                    ]}
                  >
                    <Text style={styles.lookChipEmoji}>{look.emoji}</Text>
                    <Text style={styles.chipText}>{name}</Text>
                  </Pressable>
                );
              })}
              {matchedCategories.length === 0 && (
                <Text style={styles.muted}>
                  {`No category matches "${catSearch.trim()}".`}
                </Text>
              )}
            </View>
          </BottomSheetScrollView>
        </BottomSheet>
      )}

      {sheet === "dates" && (
        <BottomSheet
          enablePanDownToClose
          onClose={() => {
            setSheet(null);
            setPickerFor(null);
          }}
          backdropComponent={renderSheetBackdrop}
          backgroundStyle={styles.sheetSurface}
          handleIndicatorStyle={styles.sheetHandle}
          keyboardBehavior="interactive"
          keyboardBlurBehavior="restore"
        >
          <BottomSheetView style={styles.sheetBody}>
            <Text style={styles.eyebrow}>DATES</Text>
            <View style={styles.sheetChipWrap}>
              {dateRanges.map((entry) => {
                const selected = !custom && range === entry.id;
                return (
                  <Pressable
                    key={entry.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPressIn={lightTap}
                    onPress={() => pickQuickRange(entry.id)}
                    style={[styles.lookChip, selected && styles.lookChipNeutral]}
                  >
                    <Text style={styles.chipText}>{entry.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.fieldLabel}>Or choose your own</Text>
            {Platform.OS === "web" ? (
              <View style={styles.dateFieldRow}>
                <SheetTextInput
                  accessibilityLabel="From date"
                  value={customFrom ?? ""}
                  onChangeText={(text) => setCustomFrom(text.trim() || null)}
                  placeholder="From 2026-08-01"
                  placeholderTextColor={theme.mutedForeground}
                  style={[styles.input, styles.dateField]}
                />
                <SheetTextInput
                  accessibilityLabel="To date"
                  value={customTo ?? ""}
                  onChangeText={(text) => setCustomTo(text.trim() || null)}
                  placeholder="To 2026-08-23"
                  placeholderTextColor={theme.mutedForeground}
                  style={[styles.input, styles.dateField]}
                />
              </View>
            ) : (
              <View style={styles.dateFieldRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Pick the from date"
                  onPressIn={lightTap}
                  onPress={() => setPickerFor("from")}
                  style={({ pressed }) => [
                    styles.input,
                    styles.dateField,
                    styles.dateButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.chipText}>
                    {customFrom ? shortLabel(customFrom) : "From"}
                  </Text>
                  <Ionicons
                    name="calendar-outline"
                    size={18}
                    color={theme.mutedForeground}
                  />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Pick the to date"
                  onPressIn={lightTap}
                  onPress={() => setPickerFor("to")}
                  style={({ pressed }) => [
                    styles.input,
                    styles.dateField,
                    styles.dateButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.chipText}>
                    {customTo ? shortLabel(customTo) : "To"}
                  </Text>
                  <Ionicons
                    name="calendar-outline"
                    size={18}
                    color={theme.mutedForeground}
                  />
                </Pressable>
              </View>
            )}
            {NativeDatePicker && pickerFor && (
              <NativeDatePicker
                value={dateFromKey(pickerFor === "from" ? customFrom : customTo)}
                mode="date"
                onChange={(event, date) => {
                  setPickerFor(null);
                  if (event.type !== "set" || !date) {
                    return;
                  }
                  const key = keyFromDate(date);
                  if (pickerFor === "from") {
                    setCustomFrom(key);
                  } else {
                    setCustomTo(key);
                  }
                }}
              />
            )}
          </BottomSheetView>
        </BottomSheet>
      )}

      {detail && (
        <BottomSheet
          enablePanDownToClose
          onClose={() => setDetail(null)}
          backdropComponent={renderSheetBackdrop}
          backgroundStyle={styles.sheetSurface}
          handleIndicatorStyle={styles.sheetHandle}
        >
          <BottomSheetView style={styles.sheetBody}>
            <Text style={styles.eyebrow}>
              {detail.direction === "in" ? "MONEY IN" : "MONEY OUT"}
            </Text>
            <View style={styles.detailHero}>
              <Text style={styles.rowTitle}>{detail.description}</Text>
              <Text
                style={[
                  styles.detailAmount,
                  detail.direction === "in" && { color: theme.primary },
                ]}
              >
                {signed(detail)}
              </Text>
            </View>
            <View style={styles.detailGroup}>
              <View style={styles.sheetRow}>
                <Text style={styles.muted}>When</Text>
                <Text style={styles.rowTitle}>{detail.date}</Text>
              </View>
              <View style={styles.sheetRow}>
                <Text style={styles.muted}>Category</Text>
                <Text style={styles.rowTitle}>
                  {lookOf(detail.category).emoji} {detail.category}
                </Text>
              </View>
              <View style={styles.sheetRow}>
                <Text style={styles.muted}>Place</Text>
                <Text style={styles.rowTitle}>
                  {emojiOf(detail.accountId)} {nameOf(detail.accountId)}
                </Text>
              </View>
            </View>
            <Text style={styles.footnote}>
              Posted entry · amounts in {currency} · prototype data
            </Text>
          </BottomSheetView>
        </BottomSheet>
      )}
    </SafeAreaView>
  );
}

function FilterChip({
  label,
  active,
  icon,
  styles,
  theme,
  onPress,
}: {
  label: string;
  active: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPressIn={lightTap}
      onPress={onPress}
      style={[styles.chip, active && styles.chipSelected]}
    >
      {icon && <Ionicons name={icon} size={16} color={theme.foreground} />}
      <Text style={styles.chipText}>{label}</Text>
      <Ionicons name="chevron-down" size={14} color={theme.mutedForeground} />
    </Pressable>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: theme.background },
    page: {
      flexGrow: 1,
      gap: spacing.xl,
      paddingHorizontal: spacing.xxl,
      paddingTop: spacing.md,
      paddingBottom: 132,
      backgroundColor: theme.background,
    },
    pageHeader: {
      minHeight: touchTarget,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    headerCopy: { flex: 1, gap: spacing.xs },
    eyebrow: {
      color: theme.mutedForeground,
      fontSize: fontSize.label,
      fontFamily: font.bold,
      letterSpacing: 1,
    },
    pageTitle: {
      color: theme.foreground,
      fontSize: 32,
      lineHeight: 37,
      fontFamily: font.extrabold,
      letterSpacing: -0.7,
    },
    iconButton: {
      width: touchTarget,
      height: touchTarget,
      borderRadius: radius.full,
      backgroundColor: theme.secondary,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: "center",
      justifyContent: "center",
    },
    searchWrap: {
      minHeight: touchTarget,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.ring,
      backgroundColor: theme.secondary,
    },
    searchInput: {
      flex: 1,
      minHeight: touchTarget,
      color: theme.foreground,
      fontSize: fontSize.body,
      fontFamily: font.regular,
    },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: {
      minHeight: touchTarget,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.secondary,
    },
    chipSelected: { borderColor: theme.primary, borderWidth: 2 },
    chipText: { color: theme.foreground, fontSize: 14, fontFamily: font.semibold },
    countRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    clearButton: { minHeight: 32, justifyContent: "center" },
    clearText: { color: theme.primary, fontSize: 14, fontFamily: font.bold },
    listGroup: {
      borderRadius: radius.lg,
      backgroundColor: theme.secondary,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: "hidden",
    },
    listRow: {
      minHeight: 70,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    rowCopy: { flex: 1, gap: spacing.xs },
    rowTitle: {
      color: theme.foreground,
      fontSize: fontSize.body,
      fontFamily: font.semibold,
    },
    rowValue: {
      flexShrink: 0,
      color: theme.foreground,
      fontSize: 14,
      fontFamily: font.semibold,
      textAlign: "right",
    },
    muted: {
      color: theme.mutedForeground,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: font.regular,
    },
    pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
    sheetSurface: {
      backgroundColor: theme.background,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      borderWidth: 1,
      borderColor: theme.border,
    },
    sheetHandle: { backgroundColor: theme.ring },
    sheetBody: {
      gap: spacing.md,
      paddingHorizontal: spacing.xxl,
      paddingTop: spacing.sm,
      paddingBottom: 44,
    },
    sheetListContent: { paddingHorizontal: spacing.xxl, paddingBottom: 44 },
    sheetSearchWrap: {
      backgroundColor: theme.background,
      gap: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
    },
    sheetChipWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      paddingTop: spacing.xs,
    },
    sheetRow: {
      minHeight: touchTarget,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    sortState: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    sortStateText: { color: theme.primary, fontSize: 14, fontFamily: font.bold },
    lookChip: {
      minHeight: touchTarget,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.secondary,
    },
    lookChipNeutral: { borderColor: theme.primary, borderWidth: 2 },
    lookChipEmoji: { fontSize: 17 },
    input: {
      minHeight: 56,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.ring,
      color: theme.foreground,
      backgroundColor: theme.secondary,
      fontSize: fontSize.body,
      fontFamily: font.regular,
    },
    fieldLabel: { color: theme.foreground, fontSize: 14, fontFamily: font.semibold },
    dateFieldRow: { flexDirection: "row", gap: spacing.sm },
    dateField: { flex: 1 },
    dateButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    detailHero: { gap: spacing.xs },
    detailAmount: {
      color: theme.foreground,
      fontSize: 30,
      lineHeight: 36,
      fontFamily: font.extrabold,
      letterSpacing: -0.6,
    },
    detailGroup: { gap: spacing.xs },
    footnote: {
      color: theme.mutedForeground,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: font.regular,
      textAlign: "center",
    },
  });
