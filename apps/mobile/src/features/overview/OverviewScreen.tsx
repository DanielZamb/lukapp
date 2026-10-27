import { toMajorUnits } from "../money";
import type { Theme } from "../../ui/tokens";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { EmojiTile, Group, Header, ListRow, Presentation, PreviewGroup, PrimaryButton, ProgressJar, ReflowItem, ReflowRow, Screen, SecondaryButton, Segmented, ShareBar, Text, useReflowStyles, useTheme } from "../../ui/core";
import { font, radius, spacing, touchTarget } from "../../ui/tokens";
import { currencyDisplayPrefix } from "../money";
import { categoryColor } from "../categories/appearance";
import { compactAmount, symbolAmount } from "./amounts";
import { CapitalFlow, type FlowFocus } from "./CapitalFlow";
import { remaining, remainingFill, type MonthOverview, type OverviewCategory } from "./model";

export function OverviewScreen({ data, monthLabel = "this month", onBack, onHistory, onCategory }: {
  data: MonthOverview | undefined;
  monthLabel?: string;
  onBack: () => void;
  onHistory: () => void;
  onCategory: (categoryId: string) => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const reflow = useReflowStyles();
  const [view, setView] = useState<"list" | "spend" | "remaining">("list");
  const [flowFocus, setFlowFocus] = useState<FlowFocus>(null);
  const [showAll, setShowAll] = useState(false);
  const symbol = data ? currencyDisplayPrefix(data.currency) : "$";
  const categories = data?.categories ?? [];
  const hasLimit = categories.some((category) => category.limitMinorUnits !== null);
  const showRemaining = view === "remaining" && hasLimit;
  const barRows = showRemaining
    ? categories.filter((category) => category.limitMinorUnits !== null)
      .sort((a, b) => (remaining(a) ?? 0) - (remaining(b) ?? 0) || b.spendMinorUnits - a.spendMinorUnits)
    : categories;
  const maxSpend = Math.max(1, ...categories.map((category) => category.spendMinorUnits));
  const flow = data ? <CapitalFlow outMinorUnits={data.outMinorUnits} inMinorUnits={data.inMinorUnits} symbol={symbol} currency={data.currency} focus={flowFocus} onFocus={setFlowFocus} />
    : <ActivityIndicator accessibilityLabel="Loading Overview" />;
  const renderCategory = (category: OverviewCategory) => {
    const color = { light: categoryColor(category.style, "light"), dark: categoryColor(category.style, "dark") };
    return <ListRow key={category.id} title={category.name}
      leading={<EmojiTile emoji={category.style.emoji} color={color} size={36} />}
      value={symbolAmount(category.spendMinorUnits, symbol, "grouped", data?.currency ?? "COP")}
      onPress={view === "list" ? () => onCategory(category.id) : undefined} chevron={view === "list"}>
      {view === "list" ? <ShareBar value={category.spendMinorUnits / maxSpend} color={color} /> : <>
        <ProgressJar value={category.spendMinorUnits / maxSpend} color={color} />
        <Text variant="status" tone="muted">{Math.round(category.spendMinorUnits / Math.max(1, data?.outMinorUnits ?? 0) * 100)}% of {monthLabel}</Text>
      </>}
    </ListRow>;
  };
  return (
    <Screen>
      <Presentation legacy={<Header title="Overview" eyebrow="THIS MONTH" onBack={onBack} />}>
        <Header title="Overview" eyebrow={monthLabel.toUpperCase()} onBack={onBack} />
      </Presentation>
      <Presentation legacy={flow}>{view === "list" ? flow : null}</Presentation>
      <Presentation legacy={<PrimaryButton label="Go to tx history" trailingIcon="receipt-outline" onPress={onHistory} />}>
        {view === "list" ? <SecondaryButton label="Go to tx history" icon="receipt-outline" onPress={onHistory} /> : null}
      </Presentation>
      <Segmented value={view === "list" ? "list" : "bars"} options={[{ value: "list", label: "List", icon: "list-outline" }, { value: "bars", label: "Bars", icon: "bar-chart-outline" }]}
        onChange={(next) => { setView(next === "list" ? "list" : "spend"); setShowAll(false); }} legacy={<View accessibilityRole="radiogroup" style={styles.toggle}>
        <ViewOption label="List" icon="list-outline" selected={view === "list"} onPress={() => setView("list")} />
        <ViewOption label="Bars" icon="bar-chart-outline" selected={view !== "list"}
          onPress={() => setView((current) => current === "list" ? "spend" : current)} />
      </View>} />
      {data && (categories.length === 0 ? <Text preset="body" tone="muted">No categories yet.</Text> : <Presentation legacy={view === "list" ? (
        <View style={styles.group}>
          {categories.map((category, index) => {
            const left = remaining(category);
            const color = theme[category.style.tone];
            const over = left !== null && left < 0;
            return (
              <Pressable key={category.id} accessibilityRole="button" accessibilityLabel={category.name}
                onPress={() => onCategory(category.id)} style={({ pressed }) => [styles.row, index === categories.length - 1 && styles.lastRow, pressed && styles.pressed]}>
                <CategoryCoin category={category} />
                <ReflowRow align="center" reflowAlign="stretch" gap={spacing.sm} style={styles.categoryCopy}>
                  <Text preset="rowName" reflow="copy" style={styles.name}>{category.name}</Text>
                  <ReflowItem maxWidth="45%" reflowMaxWidth="100%" align="flex-end" reflowAlign="flex-start" style={styles.trail}>
                    <Text preset="rowMoney" reflow="unclamp" style={[styles.value, { textAlign: reflow.text.textAlign }]}>{symbolAmount(category.spendMinorUnits, symbol, "grouped", data.currency)}</Text>
                    {left !== null && <Text preset="captionStrong" style={{ color: over ? theme.danger : color }}>
                      {compactAmount(toMajorUnits(Math.abs(left), data.currency))} {over ? "over" : "left"}
                    </Text>}
                  </ReflowItem>
                </ReflowRow>
                <Ionicons name="chevron-forward" size={20} color={theme.mutedForeground} />
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.chart}>
          {showRemaining && <Text variant="meta" tone="muted">{"What's left"}</Text>}
          {barRows.map((category) => {
            const left = remaining(category);
            const over = showRemaining && left !== null && left < 0;
            const color = over ? theme.danger : theme[category.style.tone];
            const fill = showRemaining ? remainingFill(category) : Math.max(0, Math.min(1, category.spendMinorUnits / maxSpend));
            const value = showRemaining && left !== null
              ? `${compactAmount(toMajorUnits(Math.abs(left), data.currency))}${over ? " over" : ""}`
              : compactAmount(toMajorUnits(category.spendMinorUnits, data.currency));
            return (
              <Pressable key={category.id} accessibilityRole="button"
                accessibilityLabel={showRemaining ? `${category.name}, what's left` : category.name}
                accessibilityHint={hasLimit ? "Toggle spending and what's left" : undefined}
                onPress={() => { if (hasLimit) setView(showRemaining ? "spend" : "remaining"); }}
                style={({ pressed }) => [styles.barRow, pressed && hasLimit && styles.pressed]}>
                <Text preset="emoji21" style={styles.emoji}>{category.style.emoji}</Text>
                <View accessibilityRole="progressbar" accessibilityLabel={`${category.name}, ${showRemaining ? "remaining limit" : "share of largest spend"}`}
                  accessibilityValue={{ min: 0, max: 100, now: Math.round(fill * 100) }} style={styles.track}>
                  <View style={[styles.fill, { width: `${fill * 100}%`, backgroundColor: color }]} />
                </View>
                <Text preset="barAmount" reflow="bar" style={[styles.barValue, over && { color: theme.danger }]} numberOfLines={1}>{value}</Text>
              </Pressable>
            );
          })}
        </View>
      )}>
        <View style={{ gap: spacing.md }}>
          <View style={{ gap: spacing.xs }}>
            <Text variant="section" accessibilityRole="header">Where it went</Text>
            {view !== "list" ? <Text variant="meta" tone="muted">Longest bar is the most spent</Text> : null}
          </View>
          {showAll ? <Group>{categories.map(renderCategory)}</Group> : <PreviewGroup items={categories} totalCount={categories.length}
            viewAllLabel={(count) => `View all ${count} categories`} onViewAll={() => setShowAll(true)} renderItem={renderCategory} />}
        </View>
      </Presentation>)}
    </Screen>
  );
}

function ViewOption({ label, icon, selected, onPress }: {
  label: string; icon: "list-outline" | "bar-chart-outline"; selected: boolean; onPress: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected }}
      onPress={onPress} style={[styles.segment, selected && styles.selected]}>
      <Ionicons name={icon} size={17} color={selected ? theme.foreground : theme.mutedForeground} />
      <Text preset="body" style={[styles.segmentText, selected && styles.selectedText]}>{label}</Text>
    </Pressable>
  );
}

function CategoryCoin({ category }: { category: OverviewCategory }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const left = remaining(category);
  const over = left !== null && left < 0;
  const color = theme[category.style.tone];
  return (
    <View style={[styles.coin, {
      backgroundColor: over ? `${theme.danger}2e` : `${color}14`,
      borderColor: over ? theme.danger : `${color}55`, borderWidth: over ? 2 : 1,
    }]}>
      {left !== null && !over && <View style={[styles.coinFill, { height: `${remainingFill(category) * 100}%`, backgroundColor: `${color}3d` }]} />}
      <Text preset="emoji18">{category.style.emoji}</Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
  toggle: { flexDirection: "row", gap: spacing.xs, padding: spacing.xs, borderRadius: radius.full, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border },
  segment: { flex: 1, minHeight: touchTarget, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.full },
  selected: { backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border },
  segmentText: { flexShrink: 1, color: theme.mutedForeground, fontFamily: font.medium },
  selectedText: { color: theme.foreground, fontFamily: font.bold },
  group: { borderRadius: radius.lg, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border, overflow: "hidden" },
  row: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
  lastRow: { borderBottomWidth: 0 },
  categoryCopy: { flex: 1, minWidth: 0 },
  name: { minWidth: 0, color: theme.foreground },
  trail: { gap: spacing.xs },
  value: { color: theme.foreground },
  coin: { width: 40, height: 40, borderRadius: radius.full, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  coinFill: { position: "absolute", left: 0, right: 0, bottom: 0 },
  chart: { gap: spacing.xs },
  barRow: { minHeight: touchTarget, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  emoji: { width: 32, textAlign: "center" },
  track: { flex: 1, height: 20, borderRadius: radius.full, backgroundColor: theme.secondary, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.full },
  barValue: { minWidth: 56, color: theme.foreground, textAlign: "right" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  });
}
