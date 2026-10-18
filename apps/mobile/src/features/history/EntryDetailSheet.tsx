import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { theme, ui } from "../../ui/core";
import { Sheet } from "../../ui/Sheet";
import { font, spacing, touchTarget } from "../../ui/tokens";
import { EntryReversal } from "./EntryReversal";
import { historyAmount, historyDate, type HistoryCategory } from "./listModel";
import { useEntryDetail } from "./useEntryDetail";

type Props = {
  workspaceId: string;
  entryId: string;
  categories: HistoryCategory[];
  currentDate: string;
  onEntry: (id: string) => void;
  onClose: () => void;
};

export function EntryDetailSheet(props: Props) {
  return <Sheet label="Entry details" onClose={props.onClose}>
    <EntryDetail key={props.entryId} {...props} />
  </Sheet>;
}

function EntryDetail({ workspaceId, entryId, categories, currentDate, onEntry }: Props) {
  const { detail, reversal } = useEntryDetail(workspaceId, entryId);
  if (!detail) return <ActivityIndicator accessibilityLabel="Loading entry" />;
  const { entry, row } = detail;
  const moneyIn = row.amount.minorUnits > 0;
  return <>
    <Text style={ui.label}>{moneyIn ? "MONEY IN" : "MONEY OUT"}</Text>
    <View style={styles.hero}>
      <Text accessibilityRole="header" style={styles.title}>{row.title}</Text>
      <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.amount, moneyIn && { color: theme.primary }]}>
        {historyAmount(row.amount, true)}
      </Text>
      {(row.reversed || entry.reversesEntryId || reversal.state.kind === "posted") &&
        <Text style={ui.muted}>{entry.reversesEntryId ? "Reversal" : "Reversed"}</Text>}
    </View>
    <View>
      <DetailRow label="When"><Text style={styles.value}>{historyDate(row.date, currentDate)}</Text></DetailRow>
      <DetailRow label="Category">
        {row.userCategories.length ? row.userCategories.map((category) => {
          const emoji = categories.find((stored) => stored.id === category.id)?.style.emoji;
          return <Text key={category.id} style={styles.value}>
            {[emoji, category.name].filter(Boolean).join(" ")}{category.id === row.primaryUserCategoryId ? " · Primary" : ""}
          </Text>;
        }) : <Text style={styles.value}>{moneyIn ? "💸 " : ""}{row.detail || "No category"}</Text>}
      </DetailRow>
      <DetailRow label="Place"><Text style={styles.value}>{entry.financialAccountProfileName ?? "No place"}</Text></DetailRow>
    </View>
    <Text style={[styles.footnote, styles.note]}>Posted entry · amounts in {row.amount.currency}</Text>
    <EntryReversal detail={detail} reversal={reversal.state} onEntry={onEntry}
      onReverse={reversal.request} onCancel={reversal.cancel} onConfirm={() => void reversal.confirm()} />
  </>;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return <View style={styles.row}>
    <Text style={styles.footnote}>{label}</Text>
    <View style={styles.values}>{children}</View>
  </View>;
}

const styles = StyleSheet.create({
  hero: { gap: spacing.xs },
  title: { color: theme.foreground, fontSize: 16, fontFamily: font.semibold },
  amount: { color: theme.foreground, fontSize: 30, lineHeight: 36, fontFamily: font.extrabold, letterSpacing: -0.6 },
  row: { minHeight: touchTarget, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingVertical: spacing.sm },
  values: { flexShrink: 1, gap: spacing.sm, alignItems: "flex-end" },
  value: { color: theme.foreground, fontSize: 16, fontFamily: font.semibold, textAlign: "right" },
  footnote: { color: theme.mutedForeground, fontSize: 14, lineHeight: 20, fontFamily: font.regular },
  note: { fontSize: 13, lineHeight: 19, textAlign: "center" },
});
