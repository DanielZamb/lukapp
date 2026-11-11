import { useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { useIsFocused } from "@react-navigation/native";
import type { BottomSheetModal, BottomSheetScrollViewMethods } from "@gorhom/bottom-sheet";
import type { Theme } from "../../ui/tokens";
import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useT } from "../../i18n";
import { Presentation, SecondaryButton, Text, useTheme, useUi } from "../../ui/core";
import { Sheet } from "../../ui/Sheet";
import { spacing, touchTarget } from "../../ui/tokens";
import { EntryDetailActions, EntryReversal, useEntryReversalPresentation } from "./EntryReversal";
import { historyAmount, historyDate, type HistoryCategory } from "./listModel";
import { useEntryDetail } from "./useEntryDetail";
import { entryPlaceName } from "../placeEnding/model";
import { api } from "../api";
import { useContextPill } from "../../ui/ContextPill";
import { EntryFacts, EntrySummary, entryPillContent } from "./EntryDetailScreen";

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
  const { detail, reversal, places } = useEntryDetail(props.workspaceId, props.entryId, props.profileId);
  const reversalPresentation = useEntryReversalPresentation(reversal.state);
  const month = detail?.row.date.slice(0, 7);
  const budget = useQuery(api.budget.evaluate, month ? { workspaceId: props.workspaceId, month } : "skip");
  const focused = useIsFocused();
  const [presented, setPresented] = useState(false);
  const scrollRef = useRef<BottomSheetScrollViewMethods>(null);
  const sheetRef = useRef<BottomSheetModal>(null);
  const close = () => sheetRef.current?.dismiss();
  const [covered, setCovered] = useState(false);
  const pill = useContextPill({
    identity: `history-entry:${props.workspaceId}:${props.entryId}:${props.profileId ?? "all"}:${month ?? ""}`,
    active: focused && presented && !covered && detail !== undefined,
    content: detail ? entryPillContent(detail, props.categories, budget) : { kind: "entry", name: t("review.entryDetails"), emoji: "🧾", currency: "", amountMinor: 0 },
    onBackToSummary: ({ y, animated }) => scrollRef.current?.scrollTo({ y, animated }),
  });
  const closeButton = <SecondaryButton label={t("home.sheetCloseDetails")} onPress={close} />;
  return <Sheet label={t("review.entryDetails")} presentation="native" sheetRef={sheetRef} presentOnMount onClose={props.onClose} closeLabel={false} scrollRef={scrollRef} scrollProps={pill.scrollProps}
    footer={<Presentation legacy={closeButton}>{detail ? <EntryDetailActions detail={detail} reversal={reversal.state} places={places} onEntry={props.onEntry}
      onReverse={reversal.request} onConfirm={() => void reversal.confirm()} onClose={close} /> : closeButton}</Presentation>}
    nativeModalProps={{ onChange: (index) => setPresented(index >= 0) }}>
    <Presentation legacy={<EntryDetail key={props.entryId} {...props} detail={detail} reversal={reversal} places={places} reversalPresentation={reversalPresentation} summaryProps={pill.summaryProps} />}>
      {!detail ? <ActivityIndicator accessibilityLabel={t("review.loadingEntry")} /> : <>
        <View {...pill.summaryProps}><EntrySummary detail={detail} reversal={reversal.state} /></View>
        <EntryFacts detail={detail} categories={props.categories} places={places} currentDate={props.currentDate} />
        <EntryReversal presentation={reversalPresentation} detail={detail} reversal={reversal.state} places={places} onEntry={props.onEntry} onReverse={reversal.request}
          onCancel={reversal.cancel} onConfirm={() => void reversal.confirm()} onChildSheetChange={setCovered} />
      </>}
    </Presentation>
  </Sheet>;
}

function EntryDetail({ categories, currentDate, onEntry, detail, reversal, places, summaryProps, reversalPresentation }: Props & ReturnType<typeof useEntryDetail> & {
  summaryProps: ReturnType<typeof useContextPill>["summaryProps"];
  reversalPresentation: ReturnType<typeof useEntryReversalPresentation>;
}) {
  const ui = useUi();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { t, language } = useT();
  if (!detail) return <ActivityIndicator accessibilityLabel={t("review.loadingEntry")} />;
  const { entry, row } = detail;
  const moneyIn = row.amount.minorUnits > 0;
  return <>
    <Text variant="label" style={ui.label}>{moneyIn ? t("review.moneyIn") : t("review.moneyOut")}</Text>
    <View {...summaryProps} style={styles.hero}>
      <Text preset="rowName" accessibilityRole="header" style={styles.title}>{row.title}</Text>
      <Text preset="detailAmount" adjustsFontSizeToFit numberOfLines={1} style={[styles.amount, moneyIn && { color: theme.primary }]}>
        {historyAmount(row.amount, true)}
      </Text>
      {(row.reversed || entry.reversesEntryId || reversal.state.kind === "posted") &&
        <Text preset="body" style={ui.muted}>{entry.reversesEntryId ? t("review.statusReversal") : t("review.statusReversed")}</Text>}
    </View>
    <View>
      <DetailRow label={t("review.when")}><Text preset="rowName" style={styles.value}>{historyDate(row.date, currentDate, language)}</Text></DetailRow>
      {row.transfer && <>
        <DetailRow label={t("review.transferFrom")}><Text preset="rowName" style={styles.value}>{entryPlaceName(row.transfer.from.id, row.transfer.from.name, places, t)}</Text></DetailRow>
        <DetailRow label={t("review.transferTo")}><Text preset="rowName" style={styles.value}>{entryPlaceName(row.transfer.to.id, row.transfer.to.name, places, t)}</Text></DetailRow>
      </>}
      {(!row.transfer || row.userCategories.length > 0) && <DetailRow label={t("review.category")}>
        {row.userCategories.length ? row.userCategories.map((category) => {
          const emoji = categories.find((stored) => stored.id === category.id)?.style.emoji;
          return <Text preset="rowName" key={category.id} style={styles.value}>
            {category.id === row.primaryUserCategoryId
              ? t("review.primaryCategoryName", { name: [emoji, category.name].filter(Boolean).join(" ") })
              : [emoji, category.name].filter(Boolean).join(" ")}
          </Text>;
        }) : <Text preset="rowName" style={styles.value}>{t("review.noCategory")}</Text>}
      </DetailRow>}
      {!row.transfer && <DetailRow label={t("review.place")}><Text preset="rowName" style={styles.value}>{entry.financialAccountProfileName
        ? entryPlaceName(entry.financialAccountProfileId, entry.financialAccountProfileName, places, t) : t("review.noPlace")}</Text></DetailRow>}
    </View>
    <Text preset="footnote" style={[styles.footnote, styles.note]}>{t("review.entryFootnote", { currency: row.amount.currency })}</Text>
    <EntryReversal presentation={reversalPresentation} detail={detail} reversal={reversal.state} places={places} onEntry={onEntry}
      onReverse={reversal.request} onCancel={reversal.cancel} onConfirm={() => void reversal.confirm()} />
  </>;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return <View style={styles.row}>
    <Text preset="rowSubtitle" style={styles.footnote}>{label}</Text>
    <View style={styles.values}>{children}</View>
  </View>;
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    hero: { gap: spacing.xs },
    title: { color: theme.foreground },
    amount: { color: theme.foreground },
    row: { minHeight: touchTarget, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingVertical: spacing.sm },
    values: { flexShrink: 1, gap: spacing.sm, alignItems: "flex-end" },
    value: { color: theme.foreground, textAlign: "right" },
    footnote: { color: theme.mutedForeground },
    note: { textAlign: "center" },
  });
}
