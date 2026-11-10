import { useMemo } from "react";
import type { Theme } from "../../ui/tokens";
import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useT } from "../../i18n";
import { useTheme, useUi } from "../../ui/core";
import { Sheet } from "../../ui/Sheet";
import { font, spacing, touchTarget } from "../../ui/tokens";
import { EntryReversal } from "./EntryReversal";
import { historyAmount, historyDate, type HistoryCategory } from "./listModel";
import { useEntryDetail } from "./useEntryDetail";

type Props = {
  workspaceId: string;
  entryId: string;
  profileId?: string;
  categories: HistoryCategory[];
  currentDate: string;
  onEntry: (id: string) => void;
  onClose: () => void;
};

export function EntryDetailSheet(props: Props) {
  const { t } = useT();
  return <Sheet label={t("review.entryDetails")} onClose={props.onClose}>
    <EntryDetail key={props.entryId} {...props} />
  </Sheet>;
}

function EntryDetail({ workspaceId, entryId, profileId, categories, currentDate, onEntry }: Props) {
  const ui = useUi();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { t, language } = useT();
  const { detail, reversal } = useEntryDetail(workspaceId, entryId, profileId);
  if (!detail) return <ActivityIndicator accessibilityLabel={t("review.loadingEntry")} />;
  const { entry, row } = detail;
  const moneyIn = row.amount.minorUnits > 0;
  return <>
    <Text style={ui.label}>{moneyIn ? t("review.moneyIn") : t("review.moneyOut")}</Text>
    <View style={styles.hero}>
      <Text accessibilityRole="header" style={styles.title}>{row.title}</Text>
      <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.amount, moneyIn && { color: theme.primary }]}>
        {historyAmount(row.amount, true)}
      </Text>
      {(row.reversed || entry.reversesEntryId || reversal.state.kind === "posted") &&
        <Text style={ui.muted}>{entry.reversesEntryId ? t("review.statusReversal") : t("review.statusReversed")}</Text>}
    </View>
    <View>
      <DetailRow label={t("review.when")}><Text style={styles.value}>{historyDate(row.date, currentDate, language)}</Text></DetailRow>
      {row.transfer && <>
        <DetailRow label={t("review.transferFrom")}><Text style={styles.value}>{row.transfer.from.name}</Text></DetailRow>
        <DetailRow label={t("review.transferTo")}><Text style={styles.value}>{row.transfer.to.name}</Text></DetailRow>
      </>}
      {(!row.transfer || row.userCategories.length > 0) && <DetailRow label={t("review.category")}>
        {row.userCategories.length ? row.userCategories.map((category) => {
          const emoji = categories.find((stored) => stored.id === category.id)?.style.emoji;
          return <Text key={category.id} style={styles.value}>
            {category.id === row.primaryUserCategoryId
              ? t("review.primaryCategoryName", { name: [emoji, category.name].filter(Boolean).join(" ") })
              : [emoji, category.name].filter(Boolean).join(" ")}
          </Text>;
        }) : <Text style={styles.value}>{t("review.noCategory")}</Text>}
      </DetailRow>}
      {!row.transfer && <DetailRow label={t("review.place")}><Text style={styles.value}>{entry.financialAccountProfileName ?? t("review.noPlace")}</Text></DetailRow>}
    </View>
    <Text style={[styles.footnote, styles.note]}>{t("review.entryFootnote", { currency: row.amount.currency })}</Text>
    <EntryReversal detail={detail} reversal={reversal.state} onEntry={onEntry}
      onReverse={reversal.request} onCancel={reversal.cancel} onConfirm={() => void reversal.confirm()} />
  </>;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return <View style={styles.row}>
    <Text style={styles.footnote}>{label}</Text>
    <View style={styles.values}>{children}</View>
  </View>;
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    hero: { gap: spacing.xs },
    title: { color: theme.foreground, fontSize: 16, fontFamily: font.semibold },
    amount: { color: theme.foreground, fontSize: 30, lineHeight: 36, fontFamily: font.extrabold, letterSpacing: -0.6 },
    row: { minHeight: touchTarget, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingVertical: spacing.sm },
    values: { flexShrink: 1, gap: spacing.sm, alignItems: "flex-end" },
    value: { color: theme.foreground, fontSize: 16, fontFamily: font.semibold, textAlign: "right" },
    footnote: { color: theme.mutedForeground, fontSize: 14, lineHeight: 20, fontFamily: font.regular },
    note: { fontSize: 13, lineHeight: 19, textAlign: "center" },
  });
}
