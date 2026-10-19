// Settled posting form: A (amount first) with B's typed signed amount.
// Category stays on transfer. Description is an open field, not a card.
// Pickers live in one list group. Place and category always open searchable
// sheets. Amount types as COP (grouped thousands, optional decimals).

import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useMemo, useState, type ComponentType, type ReactNode } from "react";
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
  RestyleSheet,
  SheetTextInput,
  createSetupStyles,
  currencySymbol,
  paletteColor,
  renderSheetBackdrop,
  type CategoryLook,
  type SetupDraft,
} from "./first-time-setup";
import type { Candidate } from "./drafts-inbox";
import { lookFor } from "./level-1-door";
import {
  ComposeModeToggle,
  type ComposeMode,
} from "./segment-toggle";
import type { TxKind } from "./tx-history-data";

export { ComposeModeToggle, SegmentToggle, type ComposeMode, type SegmentOption } from "./segment-toggle";

const NativeDatePicker =
  Platform.OS === "web"
    ? null
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require("@react-native-community/datetimepicker")
        .default as ComponentType<{
        value: Date;
        mode: "date";
        onChange: (event: { type: string }, date?: Date) => void;
      }>);

export type TxPlace = { id: string; name: string; emoji: string };

export type TxDraft = {
  amount: string;
  kind: TxKind;
  category: string;
  placeId: string;
  toPlaceId: string;
  description: string;
  occurred: Date;
};

export type QueuedTx = {
  id: string;
  draft: TxDraft;
};

const monthIndex: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

export function emptyTxDraft(placeId = ""): TxDraft {
  return {
    amount: "",
    kind: "normal",
    category: "Food",
    placeId,
    toPlaceId: "",
    description: "",
    occurred: new Date(2026, 7, 23),
  };
}

export function canPostDraft(draft: TxDraft) {
  const signed = parseCopAmount(draft.amount);
  const needsCategory = draft.kind === "normal" || draft.kind === "transfer";
  return (
    Boolean(draft.description.trim()) &&
    signed !== 0 &&
    (!needsCategory || Boolean(draft.category)) &&
    (draft.kind !== "transfer" ||
      Boolean(draft.toPlaceId && draft.toPlaceId !== draft.placeId))
  );
}

export function placeIdForAccount(name: string, places: TxPlace[]) {
  const needle = name.trim().toLowerCase();
  const exact = places.find((place) => place.name.toLowerCase() === needle);
  if (exact) {
    return exact.id;
  }
  const aliases: Record<string, string[]> = {
    pool: ["daily account", "my money", "pool"],
    wallet: ["digital wallet", "wallet"],
    nequi: ["nequi"],
    savings: ["savings"],
  };
  for (const [id, names] of Object.entries(aliases)) {
    if (names.includes(needle) && places.some((place) => place.id === id)) {
      return id;
    }
  }
  return places[0]?.id ?? "";
}

export function draftFromCandidate(candidate: Candidate, places: TxPlace[]): TxDraft {
  const incoming = /received|income/i.test(candidate.description);
  const match = /^([A-Za-z]+)\s+(\d+)/.exec(candidate.date);
  const month = match ? monthIndex[match[1].toLowerCase()] : 7;
  const day = match ? Number(match[2]) : 23;
  return {
    amount: formatCopInput(`${incoming ? "+" : "-"}${Math.abs(candidate.amount)}`),
    kind: "normal",
    category: candidate.category,
    placeId: /choose/i.test(candidate.account)
      ? ""
      : placeIdForAccount(candidate.account, places),
    toPlaceId: "",
    description: candidate.description,
    occurred: new Date(2026, month ?? 7, day || 23),
  };
}

export function candidateFromDraft(
  draft: TxDraft,
  places: TxPlace[],
  id?: string,
): Candidate {
  const place = places.find((entry) => entry.id === draft.placeId);
  return {
    id: id ?? `manual-${Date.now()}`,
    description: draft.description.trim() || "Untitled",
    amount: Math.abs(parseCopAmount(draft.amount)),
    account: place?.name ?? "Choose account",
    category: draft.category || "Other",
    date: formatOccurred(draft.occurred),
    source: "Manual",
    expiresInDays: 14,
    status: canPostDraft(draft) ? "ready" : "needs-review",
    issue: canPostDraft(draft) ? undefined : "Finish this draft",
  };
}

const kinds: TxKind[] = ["normal", "opening", "transfer"];

const kindLabel: Record<TxKind, string> = {
  normal: "Normal",
  opening: "Initial balance",
  transfer: "Transfer",
};

function lightTap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function formatOccurred(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// COP: dots group thousands, comma is the decimal. A lone period with 1–2
// fraction digits is treated as a decimal so a US keyboard can still type cents.
export function formatCopInput(raw: string): string {
  const minus = raw.includes("-") || raw.includes("−");
  const plus = raw.includes("+");
  const sign = minus && !plus
    ? "-"
    : plus && !minus
      ? "+"
      : raw.startsWith("-") || raw.startsWith("−")
        ? "-"
        : raw.startsWith("+")
          ? "+"
          : "";

  let rest = raw.replace(/[+\-−]/g, "");
  if (!rest.includes(",")) {
    const parts = rest.split(".");
    const last = parts[parts.length - 1] ?? "";
    if (parts.length === 2 && /^\d*$/.test(parts[0] ?? "") && /^\d{0,2}$/.test(last)) {
      rest = `${parts[0]},${last}`;
    } else if (rest.endsWith(".") && parts.length > 2) {
      rest = `${rest.slice(0, -1)},`;
    }
  }

  const commaAt = rest.indexOf(",");
  const intRaw = (commaAt === -1 ? rest : rest.slice(0, commaAt)).replace(/\D/g, "");
  const decRaw =
    commaAt === -1 ? null : rest.slice(commaAt + 1).replace(/\D/g, "").slice(0, 2);

  if (!intRaw && decRaw === null) {
    return sign;
  }

  const grouped = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decRaw === null ? `${sign}${grouped}` : `${sign}${grouped},${decRaw}`;
}

export function parseCopAmount(value: string): number {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "+" || trimmed === "-" || trimmed === "−") {
    return 0;
  }
  const negative = trimmed.startsWith("-") || trimmed.startsWith("−");
  let body = trimmed.replace(/^[+\-−]/, "");
  if (body.includes(",")) {
    body = body.replace(/\./g, "").replace(",", ".");
  } else {
    const parts = body.split(".");
    const last = parts[parts.length - 1] ?? "";
    body =
      parts.length === 2 && last.length > 0 && last.length <= 2
        ? parts.join(".")
        : body.replace(/\./g, "");
  }
  const amount = Number(body);
  if (!Number.isFinite(amount) || amount === 0) {
    return 0;
  }
  return negative ? -Math.abs(amount) : Math.abs(amount);
}

export function toDateKey(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function signedLabel(value: string) {
  const amount = parseCopAmount(value);
  if (!value.trim() || amount === 0) {
    return "0";
  }
  return amount > 0
    ? `+${amount.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
    : amount.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

type SheetId = "category" | "place" | "destination" | "date" | "create-category" | null;

export function CreateTxPrototype({
  theme,
  themeMode,
  currency,
  draft,
  categories,
  categoryLooks,
  places,
  onDraft,
  onCategories,
  onLooks,
  onSave,
  onAddPlace,
  onBack,
  saveLabel = "Post",
  saveKind = "post",
  sourceNote,
  composeMode,
  onComposeMode,
  batchCount = 0,
}: {
  theme: Theme;
  themeMode: ThemeMode;
  currency: string;
  draft: TxDraft;
  categories: string[];
  categoryLooks: Record<string, CategoryLook>;
  places: TxPlace[];
  onDraft: (next: TxDraft) => void;
  onCategories: (next: string[]) => void;
  onLooks: (next: Record<string, CategoryLook>) => void;
  onSave: () => boolean;
  onAddPlace: (field: "place" | "destination") => void;
  onBack: () => void;
  saveLabel?: string;
  saveKind?: "post" | "queue";
  sourceNote?: string;
  composeMode?: ComposeMode;
  onComposeMode?: (mode: ComposeMode) => void;
  batchCount?: number;
}) {
  const [sheet, setSheet] = useState<SheetId>(null);
  const [posted, setPosted] = useState<{ description: string; amount: string } | null>(
    null,
  );
  const styles = useMemo(() => createStyles(theme), [theme]);
  const setupStyles = useMemo(() => createSetupStyles(theme), [theme]);
  const symbol = currencySymbol(currency);
  const place = places.find((entry) => entry.id === draft.placeId);
  const destination = places.find((entry) => entry.id === draft.toPlaceId);
  const look = lookFor(draft.category, categoryLooks);
  const signed = parseCopAmount(draft.amount);
  const needsCategory = draft.kind === "normal" || draft.kind === "transfer";
  const canPost =
    Boolean(draft.description.trim()) &&
    signed !== 0 &&
    (!needsCategory || Boolean(draft.category)) &&
    (draft.kind !== "transfer" ||
      Boolean(draft.toPlaceId && draft.toPlaceId !== draft.placeId));

  const setupDraft: SetupDraft = {
    currency,
    notifications: null,
    categories,
    categoryLooks,
    startingAmount: "",
    wantsBudgets: false,
  };

  function patch(next: Partial<TxDraft>) {
    onDraft({ ...draft, ...next });
  }

  function handlePost() {
    if (!onSave()) {
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
    if (saveKind === "queue") {
      return;
    }
    setPosted({
      description: draft.description.trim(),
      amount: signedLabel(draft.amount),
    });
  }

  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <ScrollView
          contentContainerStyle={styles.page}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.pageHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
              onPressIn={lightTap}
              onPress={onBack}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Ionicons name="chevron-back" size={24} color={theme.foreground} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>NEW ENTRY</Text>
              <Text style={styles.pageTitle}>Post money</Text>
              {sourceNote ? <Text style={styles.muted}>{sourceNote}</Text> : null}
            </View>
          </View>

          {onComposeMode && composeMode ? (
            <ComposeModeToggle
              mode={composeMode}
              theme={theme}
              count={batchCount}
              onMode={onComposeMode}
            />
          ) : null}

          <View style={styles.amountBlock}>
            <Text style={styles.symbol}>{symbol}</Text>
            <TextInput
              accessibilityLabel="Amount"
              value={draft.amount}
              onChangeText={(amount) => patch({ amount: formatCopInput(amount) })}
              keyboardType="numbers-and-punctuation"
              placeholder="-0"
              placeholderTextColor={theme.mutedForeground}
              style={styles.heroAmount}
            />
          </View>

          <View style={styles.chipRow}>
            {kinds.map((kind) => (
              <Pressable
                key={kind}
                accessibilityRole="radio"
                accessibilityState={{ selected: draft.kind === kind }}
                onPressIn={lightTap}
                onPress={() => patch({ kind })}
                style={[styles.chip, draft.kind === kind && styles.chipOn]}
              >
                <Text style={styles.chipText}>{kindLabel[kind]}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.openField}>
            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              accessibilityLabel="Description"
              value={draft.description}
              onChangeText={(description) => patch({ description })}
              placeholder="What was it"
              placeholderTextColor={theme.mutedForeground}
              style={styles.plainDescription}
              multiline
            />
          </View>

          <View style={styles.listGroup}>
            <ListRow
              title="Place"
              value={place ? `${place.emoji} ${place.name}` : "Pick"}
              onPress={() => setSheet("place")}
              styles={styles}
              theme={theme}
            />
            {draft.kind === "transfer" && (
              <ListRow
                title="To"
                value={
                  destination ? `${destination.emoji} ${destination.name}` : "Pick"
                }
                onPress={() => setSheet("destination")}
                styles={styles}
                theme={theme}
              />
            )}
            {needsCategory && (
              <ListRow
                title="Category"
                value={`${look.emoji} ${draft.category || "Pick"}`}
                onPress={() => setSheet("category")}
                styles={styles}
                theme={theme}
              />
            )}
            <ListRow
              title="Date occurred"
              value={formatOccurred(draft.occurred)}
              onPress={() => setSheet("date")}
              styles={styles}
              theme={theme}
            />
          </View>

          {!posted && (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canPost }}
              disabled={!canPost}
              onPressIn={lightTap}
              onPress={handlePost}
              style={({ pressed }) => [
                styles.primaryButton,
                !canPost && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>{saveLabel}</Text>
              <Ionicons name="checkmark" size={20} color="#f5f3ff" />
            </Pressable>
          )}

          <View style={styles.state}>
            <Text style={styles.eyebrow}>PROTOTYPE STATE</Text>
            <Text style={styles.muted}>
              {composeMode ?? "single"} · {draft.kind} · {signedLabel(draft.amount)} ·{" "}
              {place?.name ?? "no place"}
              {draft.kind === "transfer"
                ? ` → ${destination?.name ?? "no dest"}`
                : ""}{" "}
              · {needsCategory ? draft.category || "no category" : "opening"} ·{" "}
              {draft.description || "no description"} · {toDateKey(draft.occurred)}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>

      {posted && (
        <SafeAreaView
          style={styles.postedWrap}
          edges={["bottom"]}
          pointerEvents="box-none"
        >
          <View
            style={styles.postedCard}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <View style={styles.postedIcon}>
              <Ionicons name="checkmark" size={18} color={theme.primaryForeground} />
            </View>
            <View style={styles.postedCopy}>
              <Text style={styles.postedTitle}>Posted</Text>
              <Text style={styles.postedDetail} numberOfLines={1}>
                {posted.description} · {posted.amount}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done"
              onPressIn={lightTap}
              onPress={onBack}
              style={({ pressed }) => [styles.postedDone, pressed && styles.pressed]}
            >
              <Text style={styles.postedDoneText}>Done</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      )}

      {sheet === "category" && (
        <CategorySheet
          categories={categories}
          selected={draft.category}
          categoryLooks={categoryLooks}
          theme={theme}
          themeMode={themeMode}
          onPick={(name) => {
            patch({ category: name });
            setSheet(null);
          }}
          onAdd={() => setSheet("create-category")}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "place" && (
        <AccountSheet
          title="From"
          places={places}
          selected={draft.placeId}
          hideId={draft.kind === "transfer" ? draft.toPlaceId : undefined}
          theme={theme}
          onPick={(id) => {
            patch({ placeId: id });
            setSheet(null);
          }}
          onAdd={() => {
            setSheet(null);
            onAddPlace("place");
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "destination" && (
        <AccountSheet
          title="To"
          places={places}
          selected={draft.toPlaceId}
          hideId={draft.placeId}
          theme={theme}
          onPick={(id) => {
            patch({ toPlaceId: id });
            setSheet(null);
          }}
          onAdd={() => {
            setSheet(null);
            onAddPlace("destination");
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "date" && (
        <DateSheet
          value={draft.occurred}
          theme={theme}
          styles={styles}
          onPick={(occurred) => {
            patch({ occurred });
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "create-category" && (
        <RestyleSheet
          target={{ mode: "create" }}
          draft={setupDraft}
          styles={setupStyles}
          theme={theme}
          themeMode={themeMode}
          onDraft={(next) => {
            onCategories(next.categories);
            onLooks(next.categoryLooks);
            const added = next.categories.find((name) => !categories.includes(name));
            if (added) {
              patch({ category: added });
            }
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </View>
  );
}

function ListRow({
  title,
  value,
  onPress,
  styles,
  theme,
}: {
  title: string;
  value: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPressIn={lightTap}
      onPress={onPress}
      style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}
    >
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
      </View>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
      <Ionicons name="chevron-forward" size={20} color={theme.mutedForeground} />
    </Pressable>
  );
}

function PickSheet({
  title,
  theme,
  query,
  onQuery,
  searchLabel,
  onClose,
  children,
}: {
  title: string;
  theme: Theme;
  query: string;
  onQuery: (value: string) => void;
  searchLabel: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const styles = createStyles(theme);
  return (
    <BottomSheet
      enablePanDownToClose
      onClose={onClose}
      backdropComponent={renderSheetBackdrop}
      snapPoints={["70%"]}
      enableDynamicSizing={false}
      backgroundStyle={styles.sheetSurface}
      handleIndicatorStyle={styles.sheetHandle}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
    >
      <BottomSheetScrollView
        contentContainerStyle={styles.sheetList}
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={[0]}
      >
        <View style={styles.sheetSearchWrap}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <SheetTextInput
            accessibilityLabel={searchLabel}
            value={query}
            onChangeText={onQuery}
            placeholder="Search"
            placeholderTextColor={theme.mutedForeground}
            style={styles.sheetSearch}
          />
        </View>
        {children}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

function CategorySheet({
  categories,
  selected,
  categoryLooks,
  theme,
  themeMode,
  onPick,
  onAdd,
  onClose,
}: {
  categories: string[];
  selected: string;
  categoryLooks: Record<string, CategoryLook>;
  theme: Theme;
  themeMode: ThemeMode;
  onPick: (name: string) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const styles = createStyles(theme);
  const needle = query.trim().toLowerCase();
  const matches = categories.filter((name) => name.toLowerCase().includes(needle));

  return (
    <PickSheet
      title="Category"
      theme={theme}
      query={query}
      onQuery={setQuery}
      searchLabel="Search categories"
      onClose={onClose}
    >
      {matches.map((name) => {
        const item = lookFor(name, categoryLooks);
        const color = paletteColor(item.color, themeMode);
        return (
          <Pressable
            key={name}
            accessibilityRole="button"
            onPressIn={lightTap}
            onPress={() => onPick(name)}
            style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
          >
            <View
              style={[
                styles.lookDot,
                { backgroundColor: `${color}2e`, borderColor: color },
              ]}
            >
              <Text style={styles.sheetEmoji}>{item.emoji}</Text>
            </View>
            <Text style={styles.sheetRowTitle}>{name}</Text>
            {selected === name && (
              <Ionicons name="checkmark" size={20} color={theme.primary} />
            )}
          </Pressable>
        );
      })}
      {matches.length === 0 && (
        <Text style={styles.muted}>
          {needle ? `Nothing matches "${query.trim()}".` : "No categories yet."}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        onPressIn={lightTap}
        onPress={onAdd}
        style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
      >
        <View style={styles.addDot}>
          <Ionicons name="add" size={20} color={theme.foreground} />
        </View>
        <Text style={styles.sheetRowTitle}>Add your own</Text>
      </Pressable>
    </PickSheet>
  );
}

function AccountSheet({
  title,
  places,
  selected,
  hideId,
  theme,
  onPick,
  onAdd,
  onClose,
}: {
  title: string;
  places: TxPlace[];
  selected: string;
  hideId?: string;
  theme: Theme;
  onPick: (id: string) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const styles = createStyles(theme);
  const needle = query.trim().toLowerCase();
  const matches = places.filter((entry) => {
    if (entry.id === hideId) {
      return false;
    }
    return `${entry.emoji} ${entry.name}`.toLowerCase().includes(needle);
  });

  return (
    <PickSheet
      title={title}
      theme={theme}
      query={query}
      onQuery={setQuery}
      searchLabel="Search places"
      onClose={onClose}
    >
      {matches.map((entry) => (
        <Pressable
          key={entry.id}
          accessibilityRole="button"
          onPressIn={lightTap}
          onPress={() => onPick(entry.id)}
          style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
        >
          <Text style={styles.sheetEmoji}>{entry.emoji}</Text>
          <Text style={styles.sheetRowTitle}>{entry.name}</Text>
          {selected === entry.id && (
            <Ionicons name="checkmark" size={20} color={theme.primary} />
          )}
        </Pressable>
      ))}
      {matches.length === 0 && (
        <Text style={styles.muted}>
          {needle ? `Nothing matches "${query.trim()}".` : "No places yet."}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        onPressIn={lightTap}
        onPress={onAdd}
        style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}
      >
        <View style={styles.addDot}>
          <Ionicons name="add" size={20} color={theme.foreground} />
        </View>
        <Text style={styles.sheetRowTitle}>Add a place</Text>
      </Pressable>
    </PickSheet>
  );
}

function DateSheet({
  value,
  theme,
  styles,
  onPick,
  onClose,
}: {
  value: Date;
  theme: Theme;
  styles: ReturnType<typeof createStyles>;
  onPick: (date: Date) => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState(toDateKey(value));
  return (
    <BottomSheet
      enablePanDownToClose
      onClose={onClose}
      backdropComponent={renderSheetBackdrop}
      backgroundStyle={styles.sheetSurface}
      handleIndicatorStyle={styles.sheetHandle}
    >
      <BottomSheetView style={styles.sheetBody}>
        <Text style={styles.sheetTitle}>Date occurred</Text>
        {NativeDatePicker ? (
          <NativeDatePicker
            value={value}
            mode="date"
            onChange={(_event, date) => {
              if (date) {
                onPick(date);
              }
            }}
          />
        ) : (
          <SheetTextInput
            accessibilityLabel="Date occurred"
            value={typed}
            onChangeText={(next) => {
              setTyped(next);
              const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(next);
              if (match) {
                onPick(
                  new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
                );
              }
            }}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.mutedForeground}
            style={styles.dateInput}
          />
        )}
      </BottomSheetView>
    </BottomSheet>
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
      paddingBottom: 48,
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
    amountBlock: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    symbol: {
      color: theme.mutedForeground,
      fontSize: 28,
      fontFamily: font.semibold,
    },
    heroAmount: {
      flex: 1,
      minHeight: 72,
      color: theme.foreground,
      fontSize: 44,
      lineHeight: 52,
      fontFamily: font.extrabold,
    },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    modeTrack: {
      flexDirection: "row",
      padding: 3,
      borderRadius: radius.full,
      backgroundColor: theme.secondary,
      borderWidth: 1,
      borderColor: theme.border,
    },
    modeSegment: {
      flex: 1,
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      borderRadius: radius.full,
    },
    modeSegmentOn: {
      backgroundColor: theme.background,
      shadowColor: "#000",
      shadowOpacity: 0.1,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
    },
    modeLabel: {
      color: theme.mutedForeground,
      fontSize: 14,
      fontFamily: font.medium,
    },
    modeLabelOn: { color: theme.foreground, fontFamily: font.bold },
    modeBadge: {
      minWidth: 20,
      height: 20,
      paddingHorizontal: 5,
      borderRadius: radius.full,
      backgroundColor: theme.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    modeBadgeText: {
      color: theme.primaryForeground,
      fontSize: 11,
      fontFamily: font.bold,
    },
    chip: {
      minHeight: touchTarget,
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.secondary,
    },
    chipOn: { borderColor: theme.primary, borderWidth: 2 },
    chipText: {
      color: theme.foreground,
      fontSize: 14,
      fontFamily: font.semibold,
    },
    openField: { gap: spacing.xs },
    fieldLabel: {
      color: theme.mutedForeground,
      fontSize: 14,
      fontFamily: font.semibold,
    },
    plainDescription: {
      minHeight: 44,
      color: theme.foreground,
      fontSize: fontSize.body,
      lineHeight: 24,
      fontFamily: font.regular,
    },
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
    primaryButton: {
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.xl,
      borderRadius: radius.md,
      backgroundColor: theme.primary,
    },
    primaryButtonText: {
      color: theme.primaryForeground,
      fontSize: fontSize.action,
      fontFamily: font.bold,
    },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
    muted: {
      color: theme.mutedForeground,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: font.regular,
    },
    state: { gap: spacing.xs },
    dateInput: {
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
    sheetList: {
      gap: spacing.lg,
      paddingHorizontal: spacing.xxl,
      paddingBottom: 44,
    },
    sheetTitle: {
      color: theme.foreground,
      fontSize: 28,
      lineHeight: 34,
      fontFamily: font.extrabold,
      letterSpacing: -0.6,
    },
    sheetSearchWrap: {
      gap: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      backgroundColor: theme.background,
    },
    sheetSearch: {
      minHeight: touchTarget,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.ring,
      color: theme.foreground,
      backgroundColor: theme.secondary,
      fontSize: fontSize.body,
      fontFamily: font.regular,
    },
    sheetRow: {
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.lg,
      paddingVertical: spacing.sm,
    },
    sheetRowTitle: {
      flex: 1,
      color: theme.foreground,
      fontSize: fontSize.body,
      fontFamily: font.semibold,
    },
    sheetEmoji: { fontSize: 22 },
    lookDot: {
      width: touchTarget,
      height: touchTarget,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.full,
      borderWidth: 2,
    },
    addDot: {
      width: touchTarget,
      height: touchTarget,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.full,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: theme.border,
      backgroundColor: theme.secondary,
    },
    postedWrap: {
      position: "absolute",
      left: spacing.xxl,
      right: spacing.xxl,
      bottom: 28,
    },
    postedCard: {
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingLeft: spacing.md,
      paddingRight: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: theme.secondary,
      borderWidth: 1,
      borderColor: theme.border,
    },
    postedIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      backgroundColor: theme.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    postedCopy: { flex: 1, gap: 2 },
    postedTitle: {
      color: theme.foreground,
      fontSize: fontSize.body,
      fontFamily: font.bold,
    },
    postedDetail: {
      color: theme.mutedForeground,
      fontSize: 14,
      fontFamily: font.regular,
    },
    postedDone: {
      minHeight: 40,
      justifyContent: "center",
      paddingHorizontal: spacing.sm,
    },
    postedDoneText: {
      color: theme.primary,
      fontSize: 14,
      fontFamily: font.bold,
    },
  });
