import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../../ui/core";
import { font, radius, spacing } from "../../ui/tokens";
import type { HistoryListRow as Row } from "./listModel";

export function HistoryListRow({ row, onEntry, isFirst, isLast }: {
  row: Row; onEntry: (id: string) => void; isFirst: boolean; isLast: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${row.title}, ${row.amountLabel}`}
    onPress={() => onEntry(row.id)}
    style={({ pressed }) => [styles.row, isFirst && styles.first, isLast && styles.last, pressed && styles.pressed]}>
    <View style={styles.copy}>
      <Text numberOfLines={1} style={styles.title}>{row.title}</Text>
      <Text numberOfLines={1} style={styles.subtitle}>{row.subtitle}</Text>
    </View>
    <Text numberOfLines={1} style={[styles.amount, row.amount.minorUnits > 0 && { color: theme.primary }]}>{row.amountLabel}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  row: {
    minHeight: 70, flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: theme.secondary,
    borderColor: theme.border, borderLeftWidth: 1, borderRightWidth: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  first: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  last: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  copy: { flex: 1, minWidth: 0, gap: spacing.xs },
  title: { color: theme.foreground, fontFamily: font.semibold, fontSize: 16 },
  subtitle: { color: theme.mutedForeground, fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  amount: { maxWidth: "45%", color: theme.foreground, fontFamily: font.semibold, fontSize: 14, textAlign: "right" },
  pressed: { opacity: 0.72 },
});
