import Ionicons from "@expo/vector-icons/Ionicons";
import type { PropsWithChildren, ReactNode } from "react";
import { Pressable, View } from "react-native";
import { ActionTile, Group, ValueRow } from "./core";
import { Text } from "./Text";
import { useThemeContext } from "./themeContext";
import { EmojiTile, IconTile, ProgressJar, TintCard, type IconName } from "./surfaces";
import { moneyTone, type DesignColor } from "./design";
import { xxxl } from "./tokens";
import { currencyDisplayPrefix, formatAmount, formatMoney, toMajorUnits } from "../features/money";

function amount(minorUnits: number, currency: string, compact = false) {
  const symbol = currencyDisplayPrefix(currency);
  const units = toMajorUnits(Math.abs(minorUnits), currency);
  const scale = compact && units >= 1e6 ? 1e6 : compact && units >= 1e3 ? 1e3 : 1;
  const number = scale === 1 ? formatAmount(Math.abs(minorUnits), currency, { hideZeroDecimals: true }) : (units / scale).toFixed(units / scale >= 10 || units % scale === 0 ? 0 : 1);
  return `${minorUnits < 0 ? "−" : ""}${symbol}${number}${scale === 1e6 ? "M" : scale === 1e3 ? "K" : ""}`;
}
export function FlowSummary({ net, out, in: incoming, currency, scopeNote, legacy = null }: {
  net: number; out: number; in: number; currency: string; scopeNote?: string; legacy?: ReactNode;
}) {
  const { layout, mode } = useThemeContext();
  if (layout.tier !== "xxxl") return legacy;
  return <TintCard style={{ gap: 16 }}>
    <View style={{ gap: 4 }}><Text variant="label" tone="muted">Net</Text><Text variant="screen" tone={moneyTone(net)} accessibilityLabel={formatMoney({ currency, minorUnits: net }, { hideZeroDecimals: true })}>{amount(net, currency, true)}</Text></View>
    <View style={{ gap: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: xxxl.colors[mode].tintBorder }}>
      {([{ label: "Out", icon: "arrow-up", value: -out, tone: "neutral" }, { label: "In", icon: "arrow-down", value: incoming, tone: "positive" }] as const).map(item => <View key={item.label} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        <IconTile icon={item.icon} tone={item.tone} /><View style={{ flex: 1, minWidth: 0, gap: 8 }}><Text variant="meta" tone="muted">{item.label}</Text><Text variant="money" tone={moneyTone(item.value)} accessibilityLabel={formatMoney({ currency, minorUnits: item.value }, { hideZeroDecimals: true })}>{amount(item.value, currency, true)}</Text></View>
      </View>)}
    </View>
    {scopeNote ? <Text variant="meta" tone="muted">{scopeNote}</Text> : null}
  </TintCard>;
}
export function DateSection({ date, net, place, children, legacy = null }: PropsWithChildren<{ date: string; net?: { label: string; minorUnits: number }; place?: string; legacy?: ReactNode }>) {
  const { layout } = useThemeContext();
  if (layout.tier !== "xxxl") return legacy;
  return <View style={{ gap: 12 }}>
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", columnGap: 12, rowGap: 4 }}>
        <Text variant="section" accessibilityRole="header">{date}</Text>
        {net ? <Text variant="money" tone={net.minorUnits > 0 ? "positive" : "muted"}>{net.label}</Text> : null}
      </View>
      {place ? <Text variant="meta" tone="muted">{place}</Text> : null}
    </View>
    <Group pairGap={12}>{children}</Group>
  </View>;
}
export function DestinationRow({ icon, title, detail, onPress, legacy, isLast }: { icon: IconName; title: string; detail: string; onPress?: () => void; legacy?: ReactNode; isLast?: boolean }) {
  const { theme, layout, styles } = useThemeContext();
  if (layout.tier !== "xxxl") return legacy === undefined ? <ActionTile icon={icon} title={title} detail={detail} onPress={onPress} /> : legacy;
  const content = <>
    <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}><IconTile icon={icon} />{onPress ? <Ionicons name="chevron-forward" size={20} color={theme.mutedForeground} /> : null}</View>
    <Text variant="rowTitle">{title}</Text><Text variant="meta" tone="muted">{detail}</Text>
    {!isLast ? <View pointerEvents="none" style={styles.rowDivider} /> : null}
  </>;
  const style = { padding: 16, gap: 8, minHeight: 56 };
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${detail}`} onPress={onPress} style={style}>{content}</Pressable> : <View style={style}>{content}</View>;
}
export function PreviewGroup<T>({ title, items, renderItem, totalCount, viewAllLabel, onViewAll, legacy = null }: {
  title?: string; items: readonly T[]; renderItem: (item: T, index: number) => ReactNode; totalCount: number; viewAllLabel: (count: number) => string; onViewAll: () => void; legacy?: ReactNode;
}) {
  const { layout } = useThemeContext();
  if (layout.tier !== "xxxl") return legacy;
  const preview = items.slice(0, 4);
  return <View style={{ gap: 12 }}><Group title={title} pairGap={xxxl.spacing.betweenGroups}>{preview.map(renderItem)}</Group>
    {totalCount > preview.length ? <Pressable accessibilityRole="button" accessibilityLabel={viewAllLabel(totalCount)} onPress={onViewAll} style={{ minHeight: 56, justifyContent: "center", alignItems: "center", paddingVertical: 12, paddingHorizontal: 20 }}><Text variant="action" tone="primary" style={{ textAlign: "center" }}>{viewAllLabel(totalCount)}</Text></Pressable> : null}
  </View>;
}
export function AmountDirection({ direction, label, legacy = null }: { direction: "in" | "out" | "transfer"; label?: string; legacy?: ReactNode }) {
  const { theme, layout } = useThemeContext();
  if (layout.tier !== "xxxl") return legacy;
  const copy = label ?? (direction === "transfer" ? "Moves between places" : direction === "out" ? "Money out" : "Money in");
  return <View accessible accessibilityLabel={copy} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
    <Ionicons accessible={false} name={direction === "transfer" ? "swap-horizontal" : direction === "out" ? "arrow-up" : "arrow-down"} size={20} color={theme.mutedForeground} style={{ marginTop: 3 }} />
    <Text variant="meta" tone="muted" style={{ flex: 1 }}>{copy}</Text>
  </View>;
}
export function BudgetRow({ category, limitMinorUnits, consumptionMinorUnits, currency, onPress, legacy = null, isLast }: {
  category: { label: string; emoji: string; color: DesignColor }; limitMinorUnits: number; consumptionMinorUnits: number; currency: string; onPress?: () => void; legacy?: ReactNode; isLast?: boolean;
}) {
  const { layout } = useThemeContext();
  if (layout.tier !== "xxxl") return legacy;
  const left = limitMinorUnits - consumptionMinorUnits;
  const status = `${amount(consumptionMinorUnits, currency)} of ${amount(limitMinorUnits, currency)}`;
  return <ValueRow title={category.label} leading={<EmojiTile emoji={category.emoji} color={category.color} size={36} />} value={`${amount(Math.abs(left), currency)} ${left < 0 ? "over" : "left"}`} tone={moneyTone(0, left < 0)} onPress={onPress} isLast={isLast} accessibilityLabel={`${category.label}, ${status}`}>
    <ProgressJar value={left < 0 ? 1 : limitMinorUnits > 0 ? left / limitMinorUnits : 0} color={category.color} over={left < 0} />
    <Text variant="status" tone="muted" numberOfLines={1}>{status}</Text>
  </ValueRow>;
}
