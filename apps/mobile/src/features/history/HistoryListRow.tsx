import { useMemo } from "react";
import type { Theme } from "../../ui/tokens";
import { Pressable, StyleSheet, View } from "react-native";
import { EmojiTile, IconTile, ListRow, Presentation, Text, moneyTone, useReflowStyles, useTheme } from "../../ui/core";
import { radius, spacing } from "../../ui/tokens";
import type { HistoryListRow as Row } from "./listModel";
import { historyRowDescription } from "./listModel";

export function HistoryListRow({ row, onEntry, isFirst, isLast, sharedPlace }: {
  row: Row; onEntry: (id: string, profileId?: string) => void; isFirst: boolean; isLast: boolean; sharedPlace?: string;
}) {
  const theme = useTheme();
  const reflow = useReflowStyles();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const open = () => row.transfer ? onEntry(row.id, row.financialAccountProfileId) : onEntry(row.id);
  const legacy = <Pressable accessibilityRole="button" accessibilityLabel={`${row.title}, ${row.amountLabel}`}
    onPress={() => row.transfer ? onEntry(row.id, row.financialAccountProfileId) : onEntry(row.id)}
    style={({ pressed }) => [styles.row, reflow.row("center", "stretch"), isFirst && styles.first, isLast && styles.last, pressed && styles.pressed]}>
    <View style={styles.copy}>
      <Text preset="rowName" reflow="unclamp" style={styles.title}>{row.title}</Text>
      <Text preset="rowSubtitle" reflow="unclamp" style={styles.subtitle}>{row.subtitle}</Text>
    </View>
    <Text preset="rowMoney" reflow="trail" style={[styles.amount, row.amount.minorUnits > 0 && { color: theme.primary }]}>{row.amountLabel}</Text>
  </Pressable>;
  return <Presentation legacy={legacy}>
    <ListRow title={row.transfer ? "Transfer" : row.categoryName} value={row.amountLabel}
      meta={historyRowDescription(row, sharedPlace)} tone={moneyTone(row.amount.minorUnits)} isLast={isLast} onPress={open}
      leading={row.transfer ? <IconTile icon="swap-horizontal" tone="neutral" size={36} /> :
        <EmojiTile emoji={row.emoji || "🧾"} color={theme[row.categoryStyle?.tone ?? "mutedForeground"]} size={36} />} />
  </Presentation>;
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    row: {
      minHeight: 70, gap: spacing.md,
      paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: theme.secondary,
      borderColor: theme.border, borderLeftWidth: 1, borderRightWidth: 1,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    first: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
    last: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
    copy: { flex: 1, minWidth: 0, gap: spacing.xs },
    title: { color: theme.foreground },
    subtitle: { color: theme.mutedForeground },
    amount: { color: theme.foreground },
    pressed: { opacity: 0.72 },
  });
}
