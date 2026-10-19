// Three variants of the Plans budget view, switchable via ?plans=, on the
// existing `/` budgets destination under Plans. Recovery is a sibling, not a row.

import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useMemo, useState } from "react";
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
  currencySymbol,
  paletteColor,
  starterLooks,
  type Currency,
} from "./first-time-setup";
import { lookFor } from "./level-1-door";
import {
  LimitSheet,
  tryPost,
  VariantC,
  WalkSheets,
  type Walk,
} from "./plans-budget-flows";
import { PrototypeSwitcher } from "./prototype-switcher";
import {
  compactCop,
  nextAction,
  periodRows,
  PLAN_MONTH,
  PLAN_YEAR,
  planLooks,
  seedBudgets,
  seedExpenses,
  type ParentMatch,
  type PeriodRow,
  type PlanBudget,
  type PlanExpense,
} from "./plans-budget-data";

export const plansVariants = ["A", "B", "C"] as const;
export type PlansVariant = (typeof plansVariants)[number];

export const plansVariantNames: Record<PlansVariant, string> = {
  A: "Remaining jars",
  B: "One next action",
  C: "Post and edit",
};

export function normalizePlansVariant(value?: string): PlansVariant {
  return plansVariants.find((item) => item === value) ?? "A";
}

function lightTap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

const looks = { ...starterLooks, ...planLooks };

export function BudgetsView({
  currency,
  theme,
  themeMode,
  onBack,
}: {
  currency: Currency;
  theme: Theme;
  themeMode: ThemeMode;
  onBack: () => void;
}) {
  const { plans } = useLocalSearchParams<{ plans?: string }>();
  const variant = normalizePlansVariant(
    Array.isArray(plans) ? plans[0] : plans,
  );
  const [budgets, setBudgets] = useState<PlanBudget[]>(seedBudgets);
  const [expenses, setExpenses] = useState<PlanExpense[]>(seedExpenses);
  const [match] = useState<ParentMatch>("direct");
  const [openId, setOpenId] = useState<string | null>(null);
  const [posted, setPosted] = useState(0);
  const [walk, setWalk] = useState<Walk>({ kind: "home" });

  const rows = periodRows(budgets, expenses, match);
  const action = nextAction(rows);
  const open = rows.find((row) => row.id === openId) ?? null;
  const openBudget = budgets.find((budget) => budget.id === openId) ?? null;
  const symbol = currencySymbol(currency);

  function saveBudget(id: string, limit: number, targets: string[]) {
    setBudgets((current) =>
      current.map((budget) =>
        budget.id === id ? { ...budget, limit, targets } : budget,
      ),
    );
    setOpenId(null);
  }

  function commit(draft: PlanExpense) {
    if (expenses.some((item) => item.id === draft.id)) {
      return;
    }
    setExpenses((current) => [...current, draft]);
    setPosted((count) => count + 1);
  }

  function considerPost(draft: PlanExpense) {
    const next = tryPost(draft, expenses, budgets, rows, match);
    if (next.kind === "done") {
      commit(draft);
    }
    setWalk(next);
  }

  const shared = {
    theme,
    themeMode,
    symbol,
    rows,
    action,
    match,
    posted,
    onBack,
    onOpen: (id: string) => {
      setWalk({ kind: "home" });
      setOpenId(id);
    },
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {variant === "A" && <VariantA {...shared} />}
      {variant === "B" && <VariantB {...shared} />}
      {variant === "C" && (
        <VariantC
          theme={theme}
          themeMode={themeMode}
          symbol={symbol}
          rows={rows}
          posted={posted}
          onBack={onBack}
          onOpen={shared.onOpen}
          onPost={() => {
            setOpenId(null);
            setWalk({ kind: "pick" });
          }}
        />
      )}
      {open && openBudget && (
        <LimitSheet
          key={open.id}
          row={open}
          budget={openBudget}
          symbol={symbol}
          theme={theme}
          onClose={() => setOpenId(null)}
          onSave={(limit, targets) => saveBudget(open.id, limit, targets)}
        />
      )}
      <WalkSheets
        walk={walk}
        expenses={expenses}
        symbol={symbol}
        theme={theme}
        onPick={(draft) => setWalk({ kind: "compose", draft })}
        onClose={() => setWalk({ kind: "home" })}
        onPost={considerPost}
        onContinue={(draft) => {
          commit(draft);
          setWalk({ kind: "done", draft });
        }}
        onReconsider={(draft) => setWalk({ kind: "compose", draft })}
        onHome={() => setWalk({ kind: "home" })}
      />
      {__DEV__ && (
        <PrototypeSwitcher
          variants={plansVariants}
          names={plansVariantNames}
          current={variant}
          param="plans"
        />
      )}
    </View>
  );
}

type Shared = {
  theme: Theme;
  themeMode: ThemeMode;
  symbol: string;
  rows: PeriodRow[];
  action: ReturnType<typeof nextAction>;
  match: ParentMatch;
  posted: number;
  onBack: () => void;
  onOpen: (id: string) => void;
};

function VariantA({
  theme,
  themeMode,
  symbol,
  rows,
  action,
  match,
  posted,
  onBack,
  onOpen,
}: Shared) {
  const styles = useMemo(() => jarStyles(theme), [theme]);
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Back theme={theme} onBack={onBack} />
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{PLAN_MONTH.toUpperCase()}</Text>
            <Text style={styles.title}>Budgets</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          onPressIn={lightTap}
          onPress={() => action.id && onOpen(action.id)}
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        >
          <Text style={styles.primaryText}>{action.label}</Text>
          <Ionicons name="arrow-forward" size={20} color={theme.primaryForeground} />
        </Pressable>
        <View style={styles.grid}>
          {rows.map((row) => {
            const look = lookFor(row.name, looks);
            const color = paletteColor(look.color, themeMode);
            const over = row.remaining < 0;
            const left =
              row.limit > 0 ? Math.max(0, Math.min(row.remaining / row.limit, 1)) : 0;
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
                      { height: `${left * 100}%`, backgroundColor: `${color}66` },
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
        <StateLine
          theme={theme}
          variant="A"
          match={match}
          posted={posted}
          symbol={symbol}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function VariantB({
  theme,
  rows,
  action,
  match,
  posted,
  symbol,
  onBack,
  onOpen,
}: Shared) {
  const styles = useMemo(() => actionStyles(theme), [theme]);
  const rest = rows.filter((row) => row.id !== action.id);
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          <Back theme={theme} onBack={onBack} />
          <Text style={styles.month}>
            {PLAN_MONTH} {PLAN_YEAR}
          </Text>
        </View>
        <View style={styles.hero}>
          <Text style={styles.kicker}>Next</Text>
          <Text style={styles.heroTitle}>{action.label}</Text>
          <Text style={styles.heroDetail}>{action.detail}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPressIn={lightTap}
          onPress={() => action.id && onOpen(action.id)}
          style={({ pressed }) => [styles.doIt, pressed && styles.pressed]}
        >
          <Text style={styles.doItText}>Do this</Text>
        </Pressable>
        <Text style={styles.later}>The rest of August</Text>
        {rest.map((row) => {
          const over = row.remaining < 0;
          return (
            <Pressable
              key={row.id}
              accessibilityRole="button"
              onPressIn={lightTap}
              onPress={() => onOpen(row.id)}
              style={({ pressed }) => [styles.quietRow, pressed && styles.pressed]}
            >
              <Text style={styles.quietName}>{row.name}</Text>
              <Text style={{ color: over ? theme.danger : theme.mutedForeground }}>
                {over
                  ? `${compactCop(-row.remaining)} over`
                  : `${compactCop(row.remaining)} left`}
              </Text>
            </Pressable>
          );
        })}
        <StateLine
          theme={theme}
          variant="B"
          match={match}
          posted={posted}
          symbol={symbol}
        />
      </ScrollView>
    </SafeAreaView>
  );
}


function Back({ theme, onBack }: { theme: Theme; onBack: () => void }) {
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

function StateLine({
  theme,
  variant,
  match,
  posted,
  symbol,
}: {
  theme: Theme;
  variant: PlansVariant;
  match: ParentMatch;
  posted: number;
  symbol: string;
}) {
  return (
    <View
      style={{
        gap: spacing.sm,
        paddingTop: spacing.lg,
        borderTopWidth: 1,
        borderTopColor: theme.border,
      }}
    >
      <Text
        style={{
          color: theme.mutedForeground,
          fontSize: fontSize.label,
          fontFamily: font.bold,
          letterSpacing: 1,
        }}
      >
        PROTOTYPE STATE
      </Text>
      <Text
        style={{
          color: theme.mutedForeground,
          fontSize: 13,
          lineHeight: 19,
          fontFamily: font.regular,
        }}
      >
        plans {variant} · {PLAN_MONTH} {PLAN_YEAR} · matching {match} · posted{" "}
        {posted} · {symbol} balances unchanged
      </Text>
    </View>
  );
}

const jarStyles = (theme: Theme) =>
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
    pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  });

const actionStyles = (theme: Theme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background },
    page: {
      flexGrow: 1,
      gap: spacing.lg,
      paddingHorizontal: spacing.xxl,
      paddingTop: spacing.md,
      paddingBottom: 132,
    },
    top: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    month: {
      color: theme.mutedForeground,
      fontSize: 14,
      fontFamily: font.semibold,
    },
    hero: { gap: spacing.sm, paddingTop: spacing.section },
    kicker: {
      color: theme.primary,
      fontSize: fontSize.label,
      fontFamily: font.bold,
      letterSpacing: 1,
    },
    heroTitle: {
      color: theme.foreground,
      fontSize: 40,
      lineHeight: 46,
      fontFamily: font.extrabold,
      letterSpacing: -1,
    },
    heroDetail: {
      color: theme.mutedForeground,
      fontSize: fontSize.body,
      lineHeight: 24,
      fontFamily: font.regular,
    },
    doIt: {
      minHeight: 64,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.lg,
      backgroundColor: theme.foreground,
    },
    doItText: {
      color: theme.background,
      fontSize: 18,
      fontFamily: font.extrabold,
    },
    later: {
      color: theme.mutedForeground,
      fontSize: fontSize.label,
      fontFamily: font.bold,
      letterSpacing: 1,
      paddingTop: spacing.xl,
    },
    quietRow: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    quietName: {
      color: theme.foreground,
      fontSize: fontSize.body,
      fontFamily: font.regular,
    },
    pressed: { opacity: 0.72 },
  });

