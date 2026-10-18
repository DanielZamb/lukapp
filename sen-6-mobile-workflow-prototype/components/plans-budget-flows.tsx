// Multi-surface walks for SEN-17. Resting view is August budgets.
// Walk 1: post a 1-tag or 3-tag purchase, warning if a jar would go over.
// Walk 2: open a jar, edit August on the same sheet (targets cap, July note).

import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
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
  paletteColor,
  starterLooks,
} from "./first-time-setup";
import { lookFor, RemainingJar } from "./level-1-door";
import {
  assignTag,
  compactCop,
  crossedBy,
  julyClosed,
  netAmount,
  periodRows,
  PLAN_MONTH,
  planLooks,
  postCandidates,
  targetPool,
  type ParentMatch,
  type PeriodRow,
  type PlanBudget,
  type PlanExpense,
} from "./plans-budget-data";

const looks = { ...starterLooks, ...planLooks };

function lightTap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export type Walk =
  | { kind: "home" }
  | { kind: "pick" }
  | { kind: "compose"; draft: PlanExpense }
  | { kind: "impact"; draft: PlanExpense; hits: PeriodRow[] }
  | { kind: "done"; draft: PlanExpense };

export function VariantC({
  theme,
  themeMode,
  symbol,
  rows,
  posted,
  onBack,
  onOpen,
  onPost,
}: {
  theme: Theme;
  themeMode: ThemeMode;
  symbol: string;
  rows: PeriodRow[];
  posted: number;
  onBack: () => void;
  onOpen: (id: string) => void;
  onPost: () => void;
}) {
  const styles = useMemo(() => pageStyles(theme), [theme]);
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <IconBack theme={theme} onBack={onBack} />
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{PLAN_MONTH.toUpperCase()}</Text>
            <Text style={styles.title}>Budgets</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          onPressIn={lightTap}
          onPress={onPost}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        >
          <Text style={styles.primaryText}>Post a purchase</Text>
          <Ionicons name="add" size={20} color={theme.primaryForeground} />
        </Pressable>
        <View style={styles.grid}>
          {rows.map((row) => {
            const look = lookFor(row.name, looks);
            const color = paletteColor(look.color, themeMode);
            const over = row.remaining < 0;
            const left =
              row.limit > 0
                ? Math.max(0, Math.min(row.remaining / row.limit, 1))
                : 0;
            return (
              <Pressable
                key={row.id}
                accessibilityRole="button"
                onPressIn={lightTap}
                onPress={() => onOpen(row.id)}
                style={({ pressed }) => [
                  styles.jar,
                  {
                    borderColor: over ? theme.danger : color,
                    backgroundColor: over ? `${theme.danger}18` : theme.secondary,
                  },
                  pressed && styles.pressed,
                ]}
              >
                {!over && (
                  <View
                    pointerEvents="none"
                    style={[
                      styles.fill,
                      {
                        height: `${left * 100}%`,
                        backgroundColor: `${color}66`,
                      },
                    ]}
                  />
                )}
                <Text style={styles.emoji}>{look.emoji}</Text>
                <Text style={styles.jarName}>{row.name}</Text>
                <Text
                  style={[
                    styles.jarLeft,
                    { color: over ? theme.danger : theme.foreground },
                  ]}
                >
                  {over
                    ? `${compactCop(-row.remaining)} over`
                    : `${compactCop(row.remaining)} left`}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.state}>
          <Text style={styles.eyebrow}>PROTOTYPE STATE</Text>
          <Text style={styles.note}>
            walk home · posted {posted} · {symbol} balances unchanged
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function WalkSheets({
  walk,
  expenses,
  symbol,
  theme,
  onPick,
  onClose,
  onPost,
  onContinue,
  onReconsider,
  onHome,
}: {
  walk: Walk;
  expenses: PlanExpense[];
  symbol: string;
  theme: Theme;
  onPick: (draft: PlanExpense) => void;
  onClose: () => void;
  onPost: (draft: PlanExpense) => void;
  onContinue: (draft: PlanExpense) => void;
  onReconsider: (draft: PlanExpense) => void;
  onHome: () => void;
}) {
  if (walk.kind === "home") {
    return null;
  }
  const available = postCandidates.filter(
    (item) => !expenses.some((expense) => expense.id === item.id),
  );
  if (walk.kind === "pick") {
    return (
      <Sheet theme={theme} onClose={onClose}>
        <Text style={sheetEyebrow(theme)}>{PLAN_MONTH.toUpperCase()}</Text>
        <Text style={sheetTitle(theme)}>Post a purchase</Text>
        {available.length === 0 ? (
          <Text style={sheetMeta(theme)}>Both held-out purchases are posted.</Text>
        ) : (
          available.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              onPressIn={lightTap}
              onPress={() => onPick(item)}
              style={({ pressed }) => [
                listRow(theme),
                pressed && { opacity: 0.72 },
              ]}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={rowTitle(theme)}>{item.description}</Text>
                <Text style={sheetMeta(theme)}>
                  {item.categories.length}{" "}
                  {item.categories.length === 1 ? "tag" : "tags"} ·{" "}
                  {item.categories.join(" · ")}
                </Text>
              </View>
              <Text style={rowValue(theme)}>
                {symbol}
                {compactCop(netAmount(item))}
              </Text>
            </Pressable>
          ))
        )}
      </Sheet>
    );
  }
  if (walk.kind === "compose") {
    return (
      <Sheet theme={theme} onClose={onClose}>
        <Text style={sheetEyebrow(theme)}>{PLAN_MONTH.toUpperCase()}</Text>
        <Text style={sheetTitle(theme)}>{walk.draft.description}</Text>
        <Text style={sheetAmount(theme)}>
          {symbol}
          {compactCop(netAmount(walk.draft))}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {walk.draft.categories.map((name) => (
            <View
              key={name}
              style={{
                minHeight: 40,
                justifyContent: "center",
                paddingHorizontal: 14,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Text
                style={{
                  color: theme.foreground,
                  fontSize: 14,
                  fontFamily: font.semibold,
                }}
              >
                {name}
              </Text>
            </View>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          onPressIn={lightTap}
          onPress={() => onPost(walk.draft)}
          style={({ pressed }) => [primaryBtn(theme), pressed && { opacity: 0.72 }]}
        >
          <Text style={primaryBtnText(theme)}>Post</Text>
        </Pressable>
      </Sheet>
    );
  }
  if (walk.kind === "impact") {
    const hit = walk.hits[0];
    return (
      <Sheet theme={theme} onClose={onClose}>
        <Text style={sheetEyebrow(theme)}>BUDGET WOULD CROSS</Text>
        <Text style={sheetTitle(theme)}>{walk.draft.description}</Text>
        <Text style={[sheetAmount(theme), { color: theme.danger }]}>
          {hit
            ? `${hit.name} ${compactCop(-hit.remaining)} over`
            : "A limit would break"}
        </Text>
        {walk.hits.slice(1).map((row) => (
          <Text key={row.id} style={sheetMeta(theme)}>
            {row.name} {compactCop(-row.remaining)} over
          </Text>
        ))}
        <Text style={sheetMeta(theme)}>
          Continue still posts. A budget does not block.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPressIn={lightTap}
          onPress={() => onContinue(walk.draft)}
          style={({ pressed }) => [primaryBtn(theme), pressed && { opacity: 0.72 }]}
        >
          <Text style={primaryBtnText(theme)}>Continue anyway</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPressIn={lightTap}
          onPress={() => onReconsider(walk.draft)}
          style={({ pressed }) => [
            secondaryBtn(theme),
            pressed && { opacity: 0.72 },
          ]}
        >
          <Text style={secondaryBtnText(theme)}>Reconsider</Text>
        </Pressable>
      </Sheet>
    );
  }
  return (
    <Sheet theme={theme} onClose={onHome}>
      <Text style={sheetEyebrow(theme)}>POSTED</Text>
      <Text style={sheetTitle(theme)}>{walk.draft.description}</Text>
      <Text style={sheetAmount(theme)}>
        {symbol}
        {compactCop(netAmount(walk.draft))}
      </Text>
      <Text style={sheetMeta(theme)}>
        {walk.draft.categories.join(" · ")}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPressIn={lightTap}
        onPress={onHome}
        style={({ pressed }) => [primaryBtn(theme), pressed && { opacity: 0.72 }]}
      >
        <Text style={primaryBtnText(theme)}>View August</Text>
      </Pressable>
    </Sheet>
  );
}

export function tryPost(
  draft: PlanExpense,
  expenses: PlanExpense[],
  budgets: PlanBudget[],
  rows: PeriodRow[],
  match: ParentMatch,
): Walk {
  const next = periodRows(budgets, [...expenses, draft], match);
  const hits = crossedBy(rows, next);
  if (hits.length > 0) {
    return { kind: "impact", draft, hits };
  }
  return { kind: "done", draft };
}

export function LimitSheet({
  row,
  budget,
  symbol,
  theme,
  onClose,
  onSave,
}: {
  row: PeriodRow;
  budget: PlanBudget;
  symbol: string;
  theme: Theme;
  onClose: () => void;
  onSave: (limit: number, targets: string[]) => void;
}) {
  const styles = useMemo(() => editStyles(theme), [theme]);
  const [limit, setLimit] = useState(row.limit);
  const [targets, setTargets] = useState(budget.targets);
  const [fourth, setFourth] = useState(false);
  const over = row.consumed > limit;
  const remaining = limit - row.consumed;
  const limitChanged = limit !== row.limit;
  const showJuly = budget.id === "tennis" && limitChanged;
  const choices = [
    row.limit,
    Math.round(row.limit * 1.2),
    Math.round(row.consumed / 100000) * 100000 + 200000,
  ].filter((value, index, all) => value > 0 && all.indexOf(value) === index);
  const extras = targetPool.filter((name) => !targets.includes(name));

  function addTarget(name: string) {
    const result = assignTag(targets, name);
    if (!result.ok) {
      setFourth(true);
      return;
    }
    setFourth(false);
    setTargets(result.categories);
  }

  return (
    <View style={styles.veil}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <ScrollView
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheet}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>{PLAN_MONTH.toUpperCase()}</Text>
        <Text style={styles.title}>{row.name}</Text>
        <Text style={[styles.amount, over && { color: theme.danger }]}>
          {over ? "−" : ""}
          {symbol}
          {compactCop(Math.abs(remaining))}
        </Text>
        <RemainingJar
          remaining={remaining}
          limit={limit}
          color={theme.primary}
          emptyColor={theme.danger}
          tall
        />
        <Text style={styles.meta}>Stay under this month</Text>
        <View style={styles.chips}>
          {choices.map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              onPressIn={lightTap}
              onPress={() => setLimit(value)}
              style={[styles.chip, value === limit && styles.chipOn]}
            >
              <Text style={styles.chipText}>
                {symbol}
                {compactCop(value)}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.meta}>Watches {targets.length} of 3 categories</Text>
        <View style={styles.chips}>
          {targets.map((name) => (
            <Pressable
              key={name}
              accessibilityRole="button"
              onPressIn={lightTap}
              onPress={() => {
                setTargets((current) => current.filter((item) => item !== name));
                setFourth(false);
              }}
              style={[styles.chip, styles.chipOn]}
            >
              <Text style={styles.chipText}>{name}</Text>
            </Pressable>
          ))}
        </View>
        {!fourth && extras.length > 0 && (
          <View style={styles.chips}>
            {extras.slice(0, 4).map((name) => (
              <Pressable
                key={name}
                accessibilityRole="button"
                onPressIn={lightTap}
                onPress={() => addTarget(name)}
                style={styles.chip}
              >
                <Text style={styles.chipText}>+ {name}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {fourth && (
          <View style={styles.prompt}>
            <Text style={styles.meta}>
              Three categories is the cap. Replace one, or make a broader
              category for later.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPressIn={lightTap}
              onPress={() => {
                const next = extras[0];
                if (!next || !targets[0]) {
                  return;
                }
                setTargets([next, ...targets.slice(1)]);
                setFourth(false);
              }}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            >
              <Text style={styles.primaryText}>
                Replace {targets[0]} with {extras[0]}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPressIn={lightTap}
              onPress={() => setFourth(false)}
              style={({ pressed }) => [styles.done, pressed && styles.pressed]}
            >
              <Text style={styles.doneText}>Keep these three</Text>
            </Pressable>
          </View>
        )}
        {showJuly && (
          <Text style={styles.note}>
            {julyClosed.month} {julyClosed.name} already spent {symbol}
            {compactCop(julyClosed.spent)}, including the{" "}
            {julyClosed.highlight.description} at {symbol}
            {compactCop(julyClosed.highlight.amount)}. Saving only changes
            August.
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          onPressIn={lightTap}
          onPress={() => onSave(limit, targets)}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        >
          <Text style={styles.primaryText}>Save August</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.done, pressed && styles.pressed]}
        >
          <Text style={styles.doneText}>Close</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Sheet({
  theme,
  onClose,
  children,
}: {
  theme: Theme;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <View
      style={{
        ...StyleSheet.absoluteFillObject,
        justifyContent: "flex-end",
        backgroundColor: "rgba(0,0,0,0.4)",
      }}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View
        style={{
          gap: spacing.md,
          padding: spacing.xxl,
          paddingBottom: 48,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          backgroundColor: theme.background,
        }}
      >
        {children}
      </View>
    </View>
  );
}

function IconBack({ theme, onBack }: { theme: Theme; onBack: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={8}
      onPress={onBack}
      style={({ pressed }) => [
        {
          width: touchTarget,
          height: touchTarget,
          borderRadius: radius.full,
          backgroundColor: theme.secondary,
          borderWidth: 1,
          borderColor: theme.border,
          alignItems: "center" as const,
          justifyContent: "center" as const,
        },
        pressed && { opacity: 0.72 },
      ]}
    >
      <Ionicons name="chevron-back" size={24} color={theme.foreground} />
    </Pressable>
  );
}

function sheetEyebrow(theme: Theme) {
  return {
    color: theme.mutedForeground,
    fontSize: fontSize.label,
    fontFamily: font.bold,
    letterSpacing: 1,
  } as const;
}
function sheetTitle(theme: Theme) {
  return {
    color: theme.foreground,
    fontSize: 24,
    fontFamily: font.extrabold,
  } as const;
}
function sheetAmount(theme: Theme) {
  return {
    color: theme.foreground,
    fontSize: 36,
    fontFamily: font.extrabold,
  } as const;
}
function sheetMeta(theme: Theme) {
  return {
    color: theme.mutedForeground,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: font.regular,
  } as const;
}
function rowTitle(theme: Theme) {
  return {
    color: theme.foreground,
    fontSize: fontSize.body,
    fontFamily: font.semibold,
  } as const;
}
function rowValue(theme: Theme) {
  return { color: theme.foreground, fontSize: 14, fontFamily: font.semibold } as const;
}
function listRow(theme: Theme) {
  return {
    minHeight: 70,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  };
}
function primaryBtn(theme: Theme) {
  return {
    minHeight: 56,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: radius.md,
    backgroundColor: theme.primary,
  };
}
function primaryBtnText(theme: Theme) {
  return {
    color: theme.primaryForeground,
    fontSize: fontSize.action,
    fontFamily: font.bold,
  } as const;
}
function secondaryBtn(theme: Theme) {
  return {
    minHeight: touchTarget,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: theme.border,
  };
}
function secondaryBtnText(theme: Theme) {
  return {
    color: theme.foreground,
    fontSize: fontSize.body,
    fontFamily: font.semibold,
  } as const;
}

const pageStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background },
    page: {
      flexGrow: 1,
      gap: spacing.xl,
      paddingHorizontal: spacing.xxl,
      paddingTop: spacing.md,
      paddingBottom: 132,
    },
    header: {
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
    title: {
      color: theme.foreground,
      fontSize: 32,
      lineHeight: 37,
      fontFamily: font.extrabold,
      letterSpacing: -0.7,
    },
    primary: {
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.xl,
      borderRadius: radius.md,
      backgroundColor: theme.primary,
    },
    primaryText: {
      color: theme.primaryForeground,
      fontSize: fontSize.action,
      fontFamily: font.bold,
    },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    jar: {
      width: "48%",
      minHeight: 132,
      justifyContent: "flex-end",
      gap: 4,
      padding: spacing.md,
      borderRadius: radius.md,
      borderWidth: 2,
      overflow: "hidden",
    },
    fill: { position: "absolute", left: 0, right: 0, bottom: 0 },
    emoji: { fontSize: 28 },
    jarName: {
      color: theme.foreground,
      fontSize: fontSize.body,
      fontFamily: font.semibold,
    },
    jarLeft: { fontSize: fontSize.label, fontFamily: font.bold },
    state: {
      gap: spacing.sm,
      paddingTop: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    note: {
      color: theme.mutedForeground,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: font.regular,
    },
    pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  });

const editStyles = (theme: Theme) =>
  StyleSheet.create({
    veil: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.4)",
    },
    sheetScroll: { maxHeight: "88%" },
    sheet: {
      gap: spacing.sm,
      padding: spacing.xxl,
      paddingBottom: 48,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      backgroundColor: theme.background,
    },
    eyebrow: {
      color: theme.mutedForeground,
      fontSize: fontSize.label,
      fontFamily: font.bold,
      letterSpacing: 1,
    },
    title: {
      color: theme.foreground,
      fontSize: 24,
      fontFamily: font.extrabold,
    },
    meta: {
      color: theme.mutedForeground,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: font.regular,
    },
    amount: {
      color: theme.foreground,
      fontSize: 36,
      fontFamily: font.extrabold,
    },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: {
      minHeight: touchTarget,
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: theme.border,
    },
    chipOn: { borderColor: theme.primary, borderWidth: 2 },
    chipText: {
      color: theme.foreground,
      fontSize: 14,
      fontFamily: font.semibold,
    },
    prompt: { gap: spacing.sm },
    note: {
      color: theme.mutedForeground,
      fontSize: 13,
      lineHeight: 19,
      fontFamily: font.regular,
    },
    primary: {
      minHeight: 56,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.md,
      backgroundColor: theme.primary,
    },
    primaryText: {
      color: theme.primaryForeground,
      fontSize: fontSize.action,
      fontFamily: font.bold,
    },
    done: {
      minHeight: 52,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.md,
      backgroundColor: theme.secondary,
    },
    doneText: {
      color: theme.foreground,
      fontSize: fontSize.action,
      fontFamily: font.bold,
    },
    pressed: { opacity: 0.72 },
  });
