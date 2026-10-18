// Three variants of the level 1 door, switchable via ?variant=, on the
// existing home. First-run stays D. Either door, a second account or a
// budget, opens the level. There is no settings toggle.

import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useMemo, useState } from "react";
import {
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
  fallbackLook,
  paletteColor,
  type CategoryLook,
  type Currency,
} from "./first-time-setup";

export const doorVariants = ["A", "B", "C"] as const;
export type DoorVariant = (typeof doorVariants)[number];

export const doorVariantNames: Record<DoorVariant, string> = {
  A: "Ask first",
  B: "Just start",
  C: "Look then ask",
};

export function normalizeDoorVariant(value?: string): DoorVariant {
  return doorVariants.find((candidate) => candidate === value) ?? "C";
}

export type DoorAsk =
  | { kind: "budget"; category: string }
  | { kind: "account" };

export type BudgetMap = Record<string, number>;

function lightTap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function money(amount: number, currency: Currency) {
  return `${currency} ${amount.toLocaleString("es-CO")}`;
}

export function compactAmount(amount: number) {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "−" : "";
  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000;
    const body = millions >= 10 || millions % 1 === 0
      ? millions.toFixed(0)
      : millions.toFixed(1);
    return `${sign}${body}M`;
  }
  if (abs >= 1000) {
    const thousands = abs / 1000;
    const body = thousands >= 10 || thousands % 1 === 0
      ? thousands.toFixed(0)
      : thousands.toFixed(1);
    return `${sign}${body}K`;
  }
  return `${sign}${abs}`;
}

export function RemainingJar({
  remaining,
  limit,
  color,
  emptyColor,
  tall = false,
}: {
  remaining: number;
  limit: number;
  color: string;
  emptyColor: string;
  tall?: boolean;
}) {
  const left = limit > 0 ? Math.max(0, Math.min(remaining / limit, 1)) : 0;
  const over = remaining < 0;
  return (
    <View
      style={{
        height: tall ? 22 : 8,
        borderRadius: 999,
        backgroundColor: over ? `${emptyColor}33` : `${color}22`,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          height: "100%",
          width: `${over ? 0 : left * 100}%`,
          borderRadius: 999,
          backgroundColor: over ? emptyColor : color,
        }}
      />
    </View>
  );
}

// The coin is the jar: the category emoji sits in its tinted circle and the
// tint drains from the bottom as the budget is spent. Full tint = untouched
// limit, empty coin = nearly spent, danger coin = over. Without a budget the
// coin is a flat identity tint with no gauge.
export function CategoryCoin({
  emoji,
  color,
  emptyColor,
  remaining,
  limit,
  size = 40,
}: {
  emoji: string;
  color: string;
  emptyColor: string;
  remaining?: number;
  limit?: number;
  size?: number;
}) {
  const gauged = limit != null && limit > 0 && remaining != null;
  const left = gauged ? Math.max(0, Math.min(remaining / limit, 1)) : 0;
  const over = gauged && (remaining ?? 0) < 0;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        backgroundColor: over ? `${emptyColor}2e` : `${color}14`,
        borderWidth: over ? 2 : 1,
        borderColor: over ? emptyColor : `${color}55`,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {gauged && !over && (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: `${left * 100}%`,
            backgroundColor: `${color}3d`,
          }}
        />
      )}
      <Text style={{ fontSize: size >= 40 ? 18 : 15 }}>{emoji}</Text>
    </View>
  );
}

export function parseAmount(value: string) {
  return Number(value.replace(/[^0-9.-]/g, "")) || 0;
}

export function spentFor(index: number) {
  return Math.max(80000, 860000 - index * 140000);
}

export function lookFor(
  name: string,
  looks: Record<string, CategoryLook>,
): CategoryLook {
  return looks[name] ?? fallbackLook;
}

export function limitSuggestions(spent: number) {
  const step = 200000;
  const around = Math.max(step, Math.round(spent / step) * step);
  return [around - step, around, around + step, around + step * 2].filter(
    (value) => value > 0,
  );
}

export function DoorAskSheet({
  ask,
  look,
  theme,
  themeMode,
  onAccept,
  onDismiss,
}: {
  ask: DoorAsk;
  look: CategoryLook;
  theme: Theme;
  themeMode: ThemeMode;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const color = paletteColor(look.color, themeMode);
  const budget = ask.kind === "budget";

  return (
    <View style={styles.scrim} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        style={styles.scrimFill}
        onPress={onDismiss}
      />
      <View style={styles.sheet}>
        {budget && (
          <View
            style={[
              styles.lookChip,
              { backgroundColor: `${color}24`, borderColor: color, borderWidth: 2 },
            ]}
          >
            <Text style={styles.lookChipEmoji}>{look.emoji}</Text>
            <Text style={styles.chipText}>{ask.category}</Text>
          </View>
        )}
        <Text style={styles.sheetTitle}>
          {budget
            ? `Keep ${ask.category} under a limit?`
            : "Does this money live in more than one place?"}
        </Text>
        <Text style={styles.muted}>
          {budget
            ? "A monthly line, and a nudge when you cross it."
            : "A second place unlocks moves between them, and limits that cover both."}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPressIn={lightTap}
          onPress={onAccept}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {budget ? "Set a limit" : "Add a place"}
          </Text>
          <Ionicons name="arrow-forward" size={20} color="#f5f3ff" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPressIn={lightTap}
          onPress={onDismiss}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.secondaryButtonText}>
            {budget ? "Not now" : "Keep one pool"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export function BudgetComposer({
  category,
  look,
  spent,
  currency,
  theme,
  themeMode,
  unlocking,
  onBack,
  onSave,
}: {
  category: string;
  look: CategoryLook;
  spent: number;
  currency: Currency;
  theme: Theme;
  themeMode: ThemeMode;
  unlocking: boolean;
  onBack: () => void;
  onSave: (limit: number) => void;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const suggestions = limitSuggestions(spent);
  const [amount, setAmount] = useState(String(suggestions[1] ?? 400000));
  const limit = parseAmount(amount);
  const color = paletteColor(look.color, themeMode);
  const remaining = limit - spent;

  return (
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
            onPress={onBack}
            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={24} color={theme.foreground} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>
              {unlocking ? "THIS OPENS LEVEL 1" : "BUDGET"}
            </Text>
            <Text style={styles.pageTitle}>Limit for {category}</Text>
          </View>
        </View>

        <View
          style={[
            styles.lookChip,
            { backgroundColor: `${color}24`, borderColor: color, borderWidth: 2 },
          ]}
        >
          <Text style={styles.lookChipEmoji}>{look.emoji}</Text>
          <Text style={styles.chipText}>
            {money(spent, currency)} out this month
          </Text>
        </View>

        <View style={styles.board}>
          <Text style={styles.fieldLabel}>Stay under</Text>
          <TextInput
            accessibilityLabel="Monthly limit"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={theme.mutedForeground}
            style={styles.amountHero}
          />
          <RemainingJar
            remaining={remaining}
            limit={limit}
            color={color}
            emptyColor={theme.danger}
            tall
          />
          <Text style={styles.jarHint}>
            {remaining < 0
              ? "This jar is already empty."
              : "What is still in the jar. Spent eats it."}
          </Text>
        </View>

        <View style={styles.chipRow}>
          {suggestions.map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              onPressIn={lightTap}
              onPress={() => setAmount(String(value))}
              style={[
                styles.chip,
                parseAmount(amount) === value && styles.chipSelected,
              ]}
            >
              <Text style={styles.chipText}>{money(value, currency)}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: limit <= 0 }}
          disabled={limit <= 0}
          onPressIn={lightTap}
          onPress={() => onSave(limit)}
          style={({ pressed }) => [
            styles.primaryButton,
            limit <= 0 && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>Save this limit</Text>
          <Ionicons name="checkmark" size={20} color="#f5f3ff" />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

export function CategoryLookPage({
  category,
  look,
  spent,
  limit,
  currency,
  recent,
  theme,
  themeMode,
  onBack,
  onSetLimit,
}: {
  category: string;
  look: CategoryLook;
  spent: number;
  limit?: number;
  currency: Currency;
  recent: { id: string; description: string; amount: number; date: string }[];
  theme: Theme;
  themeMode: ThemeMode;
  onBack: () => void;
  onSetLimit: () => void;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const color = paletteColor(look.color, themeMode);
  const remaining = limit != null ? limit - spent : null;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
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
            <Text style={styles.eyebrow}>THIS MONTH</Text>
            <Text style={styles.pageTitle}>{category}</Text>
          </View>
        </View>

        <View style={styles.openAmount}>
          <View
            style={[
              styles.lookChip,
              { backgroundColor: `${color}24`, borderColor: color, borderWidth: 2 },
            ]}
          >
            <Text style={styles.lookChipEmoji}>{look.emoji}</Text>
            <Text style={styles.chipText}>{category}</Text>
          </View>
          <Text style={styles.muted}>Out this month</Text>
          <Text style={styles.heroAmount}>{money(spent, currency)}</Text>
          {limit != null && remaining != null && (
            <View style={styles.jarBlock}>
              <RemainingJar
                remaining={remaining}
                limit={limit}
                color={color}
                emptyColor={theme.danger}
                tall
              />
              <Text style={styles.jarHint}>
                {remaining < 0
                  ? `Over the ${money(limit, currency)} line`
                  : `${money(remaining, currency)} still in the jar`}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.listGroup}>
          {recent.length === 0 ? (
            <View style={styles.listRow}>
              <Text style={styles.muted}>Nothing in this category yet</Text>
            </View>
          ) : (
            recent.map((item) => (
              <View key={item.id} style={styles.listRow}>
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{item.description}</Text>
                  <Text style={styles.muted}>{item.date}</Text>
                </View>
                <Text style={styles.rowValue}>
                  −{money(item.amount, currency)}
                </Text>
              </View>
            ))
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          onPressIn={lightTap}
          onPress={onSetLimit}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {limit != null ? "Change this limit" : "Keep this under a limit"}
          </Text>
          <Ionicons name="flag-outline" size={20} color="#f5f3ff" />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

export function PlacesLookPage({
  accounts,
  currency,
  theme,
  onBack,
  onAddPlace,
  onOpenPlace,
  onOpenHistory,
}: {
  accounts: { id: string; name: string; kind: string; balance: number; emoji: string }[];
  currency: Currency;
  theme: Theme;
  onBack: () => void;
  onAddPlace: () => void;
  onOpenPlace: (id: string) => void;
  onOpenHistory: (id: string) => void;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const total = accounts.reduce((sum, account) => sum + account.balance, 0);
  const many = accounts.length > 1;

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
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
            <Text style={styles.eyebrow}>
              {many ? "YOUR PLACES" : "ONE POOL"}
            </Text>
            <Text style={styles.pageTitle}>
              {many ? "Places" : "My money"}
            </Text>
          </View>
        </View>

        <View style={styles.openAmount}>
          <Text style={styles.muted}>What you have now</Text>
          <Text style={styles.heroAmount}>{money(total, currency)}</Text>
          <Text style={styles.muted}>
            {many
              ? `Across ${accounts.length} places`
              : "Bank and pocket are still one pool. Add a place when money lives apart."}
          </Text>
        </View>

        <View style={styles.listGroup}>
          {accounts.map((account) => (
            <Pressable
              key={account.id}
              accessibilityRole="button"
              accessibilityLabel={account.name}
              onPressIn={lightTap}
              onPress={() => onOpenPlace(account.id)}
              style={({ pressed }) => [
                styles.listRow,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.placeGlyph}>{account.emoji}</Text>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{account.name}</Text>
              </View>
              <Text style={styles.rowValue}>
                {money(account.balance, currency)}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Tx history for ${account.name}`}
                hitSlop={6}
                onPressIn={lightTap}
                onPress={() => onOpenHistory(account.id)}
                style={({ pressed }) => [
                  styles.rowAction,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="receipt-outline"
                  size={18}
                  color={theme.foreground}
                />
              </Pressable>
            </Pressable>
          ))}
        </View>

        <Pressable
          accessibilityRole="button"
          onPressIn={lightTap}
          onPress={onAddPlace}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>Add another place</Text>
          <Ionicons name="add" size={20} color="#f5f3ff" />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

export function LevelUnlocked({
  door,
  category,
  look,
  limit,
  accountName,
  currency,
  theme,
  themeMode,
  onHome,
}: {
  door: "budget" | "account";
  category?: string;
  look: CategoryLook;
  limit?: number;
  accountName?: string;
  currency: Currency;
  theme: Theme;
  themeMode: ThemeMode;
  onHome: () => void;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const color = paletteColor(look.color, themeMode);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={styles.completion}>
          <View style={styles.completionIcon}>
            <Ionicons name="checkmark" size={32} color={theme.primaryForeground} />
          </View>
          <Text style={styles.completionTitle}>
            {door === "budget" ? "Limit is on" : "A second place"}
          </Text>
          {door === "budget" && category && limit != null && (
            <View
              style={[
                styles.lookChip,
                styles.lookChipCentered,
                {
                  backgroundColor: `${color}24`,
                  borderColor: color,
                  borderWidth: 2,
                },
              ]}
            >
              <Text style={styles.lookChipEmoji}>{look.emoji}</Text>
              <Text style={styles.chipText}>
                {category} · {money(limit, currency)}
              </Text>
            </View>
          )}
          <Text style={styles.completionCopy}>
            {door === "budget"
              ? "Alerts will watch this line. You can add another place whenever money lives in more than one."
              : `${accountName ?? "The new place"} is live. Moving money between places is now a thing, and any category can take a limit.`}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPressIn={lightTap}
            onPress={onHome}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>Back to the month</Text>
            <Ionicons name="home-outline" size={20} color="#f5f3ff" />
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
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
    openAmount: { gap: spacing.sm, paddingVertical: spacing.md },
    heroAmount: {
      color: theme.foreground,
      fontSize: fontSize.hero,
      lineHeight: 52,
      fontFamily: font.extrabold,
      letterSpacing: -1.2,
    },
    board: { gap: spacing.md },
    fieldLabel: { color: theme.foreground, fontSize: 14, fontFamily: font.semibold },
    amountHero: {
      minHeight: 88,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.ring,
      color: theme.foreground,
      backgroundColor: theme.secondary,
      fontSize: fontSize.hero,
      lineHeight: 52,
      fontFamily: font.extrabold,
      letterSpacing: -1.2,
    },
    jarBlock: { gap: spacing.sm, paddingTop: spacing.sm },
    jarHint: {
      color: theme.mutedForeground,
      fontSize: fontSize.label,
      lineHeight: 16,
      fontFamily: font.regular,
    },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: {
      minHeight: touchTarget,
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.secondary,
    },
    chipSelected: { borderColor: theme.primary, borderWidth: 2 },
    chipText: { color: theme.foreground, fontSize: 14, fontFamily: font.semibold },
    lookChip: {
      alignSelf: "flex-start",
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
    lookChipCentered: { alignSelf: "center" },
    lookChipEmoji: { fontSize: 18 },
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
    placeGlyph: { width: 32, fontSize: 22, textAlign: "center" },
    rowAction: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.background,
    },
    rowCopy: { flex: 1, gap: spacing.xs },
    rowTitle: { color: theme.foreground, fontSize: fontSize.body, fontFamily: font.semibold },
    rowValue: {
      maxWidth: "42%",
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
    primaryButton: {
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      paddingHorizontal: spacing.xl,
      borderRadius: radius.md,
      backgroundColor: theme.primary,
    },
    primaryButtonText: {
      color: theme.primaryForeground,
      fontSize: fontSize.action,
      fontFamily: font.bold,
    },
    secondaryButton: {
      minHeight: touchTarget,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background,
    },
    secondaryButtonText: {
      color: theme.foreground,
      fontSize: fontSize.body,
      fontFamily: font.semibold,
    },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
    completion: {
      flex: 1,
      minHeight: 560,
      justifyContent: "center",
      alignItems: "center",
      gap: spacing.xl,
    },
    completionIcon: {
      width: 68,
      height: 68,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.primary,
    },
    completionTitle: {
      color: theme.foreground,
      fontSize: 30,
      lineHeight: 36,
      fontFamily: font.extrabold,
      textAlign: "center",
    },
    completionCopy: {
      maxWidth: 340,
      color: theme.mutedForeground,
      fontSize: fontSize.body,
      lineHeight: 24,
      fontFamily: font.regular,
      textAlign: "center",
    },
    scrim: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: "flex-end",
      zIndex: 40,
    },
    scrimFill: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(10, 10, 10, 0.4)",
    },
    sheet: {
      gap: spacing.lg,
      paddingHorizontal: spacing.xxl,
      paddingTop: spacing.xxl,
      paddingBottom: 120,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      backgroundColor: theme.background,
    },
    sheetTitle: {
      color: theme.foreground,
      fontSize: 28,
      lineHeight: 34,
      fontFamily: font.extrabold,
      letterSpacing: -0.6,
    },
  });
