import { useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { useIsFocused } from "@react-navigation/native";
import type { BottomSheetModal, BottomSheetScrollViewMethods } from "@gorhom/bottom-sheet";
import type { Theme } from "../../ui/tokens";
import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Presentation, SecondaryButton, Text, useTheme, useUi } from "../../ui/core";
import { Sheet } from "../../ui/Sheet";
import { spacing, touchTarget } from "../../ui/tokens";
import { EntryDetailActions, EntryReversal, useEntryReversalPresentation } from "./EntryReversal";
import { historyAmount, historyDate, type HistoryCategory } from "./listModel";
import { useEntryDetail } from "./useEntryDetail";
import { api } from "../api";
import { useContextPill } from "../../ui/ContextPill";
import { EntryFacts, EntrySummary, entryPillContent } from "./EntryDetailScreen";
import type { EntryPlace } from "./types";

type Props = {
  workspaceId: string;
  entryId: string;
  profileId?: string;
  categories: HistoryCategory[];
  places: EntryPlace[];
  currentDate: string;
  onEntry: (id: string) => void;
  onClose: () => void;
};

export function EntryDetailSheet(props: Props) {
  const data = useEntryDetail(props.workspaceId, props.entryId, props.profileId);
  const reversalPresentation = useEntryReversalPresentation(data.reversal.state);
  const month = data.detail?.row.date.slice(0, 7);
  const budget = useQuery(api.budget.evaluate, month ? { workspaceId: props.workspaceId, month } : "skip");
  const focused = useIsFocused();
  const [presented, setPresented] = useState(false);
  const scrollRef = useRef<BottomSheetScrollViewMethods>(null);
  const sheetRef = useRef<BottomSheetModal>(null);
  const close = () => sheetRef.current?.dismiss();
  const [covered, setCovered] = useState(false);
  const pill = useContextPill({
    identity: `history-entry:${props.workspaceId}:${props.entryId}:${props.profileId ?? "all"}:${month ?? ""}`,
    active: focused && presented && !covered && data.detail !== undefined,
    content: data.detail ? entryPillContent(data.detail, props.categories, budget) : { kind: "entry", name: "Entry", emoji: "🧾", currency: "", amountMinor: 0 },
    onBackToSummary: ({ y, animated }) => scrollRef.current?.scrollTo({ y, animated }),
  });
  const closeButton = <SecondaryButton label="Close details" onPress={close} />;
  return <Sheet label="Entry details" sheetRef={sheetRef} presentOnMount onClose={props.onClose} closeLabel={false} scrollRef={scrollRef} scrollProps={pill.scrollProps}
    footer={<Presentation legacy={closeButton}>{data.detail ? <EntryDetailActions detail={data.detail} reversal={data.reversal.state} onEntry={props.onEntry}
      onReverse={data.reversal.request} onConfirm={() => void data.reversal.confirm()} onClose={close} /> : closeButton}</Presentation>}
    nativeModalProps={{ onChange: (index) => setPresented(index >= 0) }}>
    <Presentation legacy={<EntryDetail key={props.entryId} {...props} {...data} reversalPresentation={reversalPresentation} summaryProps={pill.summaryProps} />}>
      {!data.detail ? <ActivityIndicator accessibilityLabel="Loading entry" /> : <>
        <View {...pill.summaryProps}><EntrySummary detail={data.detail} reversal={data.reversal.state} /></View>
        <EntryFacts detail={data.detail} categories={props.categories} places={props.places} currentDate={props.currentDate} />
        <EntryReversal presentation={reversalPresentation} detail={data.detail} reversal={data.reversal.state} onEntry={props.onEntry} onReverse={data.reversal.request}
          onCancel={data.reversal.cancel} onConfirm={() => void data.reversal.confirm()} onChildSheetChange={setCovered} />
      </>}
    </Presentation>
  </Sheet>;
}

function EntryDetail({ categories, currentDate, onEntry, detail, reversal, summaryProps, reversalPresentation }: Props & ReturnType<typeof useEntryDetail> & {
  summaryProps: ReturnType<typeof useContextPill>["summaryProps"];
  reversalPresentation: ReturnType<typeof useEntryReversalPresentation>;
}) {
  const ui = useUi();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  if (!detail) return <ActivityIndicator accessibilityLabel="Loading entry" />;
  const { entry, row } = detail;
  const moneyIn = row.amount.minorUnits > 0;
  return <>
    <Text variant="label" style={ui.label}>{moneyIn ? "MONEY IN" : "MONEY OUT"}</Text>
    <View {...summaryProps} style={styles.hero}>
      <Text preset="rowName" accessibilityRole="header" style={styles.title}>{row.title}</Text>
      <Text preset="detailAmount" adjustsFontSizeToFit numberOfLines={1} style={[styles.amount, moneyIn && { color: theme.primary }]}>
        {historyAmount(row.amount, true)}
      </Text>
      {(row.reversed || entry.reversesEntryId || reversal.state.kind === "posted") &&
        <Text preset="body" style={ui.muted}>{entry.reversesEntryId ? "Reversal" : "Reversed"}</Text>}
    </View>
    <View>
      <DetailRow label="When"><Text preset="rowName" style={styles.value}>{historyDate(row.date, currentDate)}</Text></DetailRow>
      {row.transfer && <>
        <DetailRow label="From"><Text preset="rowName" style={styles.value}>{row.transfer.from.name}</Text></DetailRow>
        <DetailRow label="To"><Text preset="rowName" style={styles.value}>{row.transfer.to.name}</Text></DetailRow>
      </>}
      {(!row.transfer || row.userCategories.length > 0) && <DetailRow label="Category">
        {row.userCategories.length ? row.userCategories.map((category) => {
          const emoji = categories.find((stored) => stored.id === category.id)?.style.emoji;
          return <Text preset="rowName" key={category.id} style={styles.value}>
            {[emoji, category.name].filter(Boolean).join(" ")}{category.id === row.primaryUserCategoryId ? " · Primary" : ""}
          </Text>;
        }) : <Text preset="rowName" style={styles.value}>No category</Text>}
      </DetailRow>}
      {!row.transfer && <DetailRow label="Place"><Text preset="rowName" style={styles.value}>{entry.financialAccountProfileName ?? "No place"}</Text></DetailRow>}
    </View>
    <Text preset="footnote" style={[styles.footnote, styles.note]}>Posted entry · amounts in {row.amount.currency}</Text>
    <EntryReversal presentation={reversalPresentation} detail={detail} reversal={reversal.state} onEntry={onEntry}
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
