import { toMajorUnits } from "../money";
import type { Theme } from "../../ui/tokens";
import { useReadableLayout } from "../../ui/themeContext";
import type { ReadableLayout } from "../../ui/layout";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useT } from "../../i18n";
import { Header, PrimaryButton, Screen, useTheme, useThemeMode, useUi } from "../../ui/core";
import { categoryColor, categoryInk, categoryOutline, faintEdge } from "../categories/appearance";
import { font, fontSize, radius, spacing, touchTarget } from "../../ui/tokens";
import { currencyDisplayPrefix } from "../money";
import { compactAmount, symbolAmount } from "./amounts";
import { CapitalFlow } from "./CapitalFlow";
import { remaining, remainingFill, type MonthOverview, type OverviewCategory } from "./model";

export function OverviewScreen({ data, onBack, onHistory, onCategory }: {
  data: MonthOverview | undefined;
  onBack: () => void;
  onHistory: () => void;
  onCategory: (categoryId: string) => void;
}) {
  const ui = useUi();
  const theme = useTheme();
  const mode = useThemeMode();
  const layout = useReadableLayout();
  const styles = useMemo(() => createStyles(theme, layout), [theme, layout]);
  const { t, language } = useT();
  const compact = (minorUnits: number) => compactAmount(toMajorUnits(minorUnits, data?.currency ?? "COP"), language);
  const [view, setView] = useState<"list" | "spend" | "remaining">("list");
  const symbol = data ? currencyDisplayPrefix(data.currency) : "$";
  const categories = data?.categories ?? [];
  const hasLimit = categories.some((category) => category.limitMinorUnits !== null);
  const showRemaining = view === "remaining" && hasLimit;
  const barRows = showRemaining
    ? categories.filter((category) => category.limitMinorUnits !== null)
      .sort((a, b) => (remaining(a) ?? 0) - (remaining(b) ?? 0) || b.spendMinorUnits - a.spendMinorUnits)
    : categories;
  const maxSpend = Math.max(1, ...categories.map((category) => category.spendMinorUnits));
  return (
    <Screen>
      <Header title={t("review.overviewTitle")} eyebrow={t("review.overviewEyebrow")} onBack={onBack} />
      {data ? <CapitalFlow outMinorUnits={data.outMinorUnits} inMinorUnits={data.inMinorUnits} symbol={symbol} currency={data.currency} />
        : <ActivityIndicator accessibilityLabel={t("review.overviewLoading")} />}
      <PrimaryButton label={t("review.overviewHistory")} trailingIcon="receipt-outline" onPress={onHistory} />
      <View accessibilityRole="radiogroup" style={styles.toggle}>
        <ViewOption label={t("review.overviewList")} icon="list-outline" selected={view === "list"} onPress={() => setView("list")} />
        <ViewOption label={t("review.overviewBars")} icon="bar-chart-outline" selected={view !== "list"}
          onPress={() => setView((current) => current === "list" ? "spend" : current)} />
      </View>
      {data && (categories.length === 0 ? <Text style={ui.muted}>{t("review.overviewEmpty")}</Text> : view === "list" ? (
        <View style={styles.group}>
          {categories.map((category, index) => {
            const left = remaining(category);
            const color = categoryColor(category.style, mode);
            const over = left !== null && left < 0;
            return (
              <Pressable key={category.id} accessibilityRole="button" accessibilityLabel={category.name}
                onPress={() => onCategory(category.id)} style={({ pressed }) => [styles.row, index === categories.length - 1 && styles.lastRow, pressed && styles.pressed]}>
                <CategoryCoin category={category} />
                <View style={styles.categoryCopy}>
                  <Text style={styles.name}>{category.name}</Text>
                  <View style={styles.trail}>
                    <Text style={styles.value} numberOfLines={layout.reflow ? undefined : 1}>{symbolAmount(category.spendMinorUnits, symbol, "grouped", data.currency, language)}</Text>
                    {left !== null && <Text style={[styles.left, { color: over ? theme.danger : categoryInk(color, mode) }]}>
                      {t(over ? "review.amountOver" : "review.amountLeft", { amount: compact(Math.abs(left)) })}
                    </Text>}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={theme.mutedForeground} />
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.chart}>
          {showRemaining && <Text style={styles.muted}>{t("review.whatsLeft")}</Text>}
          {barRows.map((category) => {
            const left = remaining(category);
            const over = showRemaining && left !== null && left < 0;
            const color = over ? theme.danger : categoryColor(category.style, mode);
            const fill = showRemaining ? remainingFill(category) : Math.max(0, Math.min(1, category.spendMinorUnits / maxSpend));
            const value = showRemaining && left !== null
              ? over ? t("review.amountOver", { amount: compact(Math.abs(left)) }) : compact(Math.abs(left))
              : compact(category.spendMinorUnits);
            return (
              <Pressable key={category.id} accessibilityRole="button"
                accessibilityLabel={showRemaining ? t("review.barWhatsLeftA11y", { name: category.name }) : category.name}
                accessibilityHint={hasLimit ? t("review.barToggleHint") : undefined}
                onPress={() => { if (hasLimit) setView(showRemaining ? "spend" : "remaining"); }}
                style={({ pressed }) => [styles.barRow, pressed && hasLimit && styles.pressed]}>
                <Text style={styles.emoji}>{category.style.emoji}</Text>
                <View accessibilityRole="progressbar" accessibilityLabel={t(showRemaining ? "review.barRemainingA11y" : "review.barShareA11y", { name: category.name })}
                  accessibilityValue={{ min: 0, max: 100, now: Math.round(fill * 100) }} style={styles.track}>
                  <View style={[styles.fill, { width: `${fill * 100}%`, backgroundColor: color }, faintEdge(color, mode)]} />
                </View>
                <Text style={[styles.barValue, over && { color: theme.danger }]} numberOfLines={2}>{value}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </Screen>
  );
}

function ViewOption({ label, icon, selected, onPress }: {
  label: string; icon: "list-outline" | "bar-chart-outline"; selected: boolean; onPress: () => void;
}) {
  const theme = useTheme();
  const layout = useReadableLayout();
  const styles = useMemo(() => createStyles(theme, layout), [theme, layout]);
  return (
    <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected }}
      onPress={onPress} style={[styles.segment, selected && styles.selected]}>
      <Ionicons name={icon} size={17} color={selected ? theme.foreground : theme.mutedForeground} />
      <Text style={[styles.segmentText, selected && styles.selectedText]}>{label}</Text>
    </Pressable>
  );
}

function CategoryCoin({ category }: { category: OverviewCategory }) {
  const theme = useTheme();
  const layout = useReadableLayout();
  const styles = useMemo(() => createStyles(theme, layout), [theme, layout]);
  const mode = useThemeMode();
  const left = remaining(category);
  const over = left !== null && left < 0;
  const color = categoryColor(category.style, mode);
  const outline = categoryOutline(color, mode);
  return (
    <View style={[styles.coin, {
      backgroundColor: over ? `${theme.danger}2e` : `${color}14`,
      borderColor: over ? theme.danger : outline === color ? `${color}55` : outline, borderWidth: over ? 2 : 1,
    }]}>
      {left !== null && !over && <View style={[styles.coinFill, { height: `${remainingFill(category) * 100}%`, backgroundColor: `${color}3d` }]} />}
      <Text style={styles.coinEmoji}>{category.style.emoji}</Text>
    </View>
  );
}

function createStyles(theme: Theme, layout: ReadableLayout) {
  return StyleSheet.create({
  toggle: { flexDirection: "row", gap: spacing.xs, padding: spacing.xs, borderRadius: radius.full, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border },
  segment: { flex: 1, minHeight: touchTarget, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.full },
  selected: { backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border },
  segmentText: { flexShrink: 1, color: theme.mutedForeground, fontSize: fontSize.body, fontFamily: font.medium },
  selectedText: { color: theme.foreground, fontFamily: font.bold },
  group: { borderRadius: radius.lg, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border, overflow: "hidden" },
  row: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
  lastRow: { borderBottomWidth: 0 },
  categoryCopy: { flex: 1, minWidth: 0, flexDirection: layout.reflow ? "column" : "row", alignItems: layout.reflow ? "stretch" : "center", gap: spacing.sm },
  name: { flex: layout.reflow ? 0 : 1, minWidth: 0, color: theme.foreground, fontSize: fontSize.body, fontFamily: font.semibold },
  trail: { maxWidth: layout.reflow ? "100%" : "45%", alignItems: layout.reflow ? "flex-start" : "flex-end", gap: spacing.xs },
  value: { color: theme.foreground, fontSize: 14, fontFamily: font.semibold, textAlign: layout.reflow ? "left" : "right" },
  left: { fontSize: fontSize.label, fontFamily: font.bold },
  coin: { width: 40, height: 40, borderRadius: radius.full, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  coinFill: { position: "absolute", left: 0, right: 0, bottom: 0 },
  coinEmoji: { fontSize: 18 },
  chart: { gap: spacing.xs },
  barRow: { minHeight: touchTarget, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  emoji: { width: 32, fontSize: 21, textAlign: "center" },
  track: { flex: 1, height: 20, borderRadius: radius.full, backgroundColor: theme.secondary, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.full },
  barValue: { minWidth: 56, maxWidth: layout.reflow ? "45%" : 80, color: theme.foreground, fontSize: 12, fontFamily: font.bold, textAlign: "right" },
  muted: { color: theme.mutedForeground, fontSize: 14, lineHeight: 20, fontFamily: font.regular },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  });
}
