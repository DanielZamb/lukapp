import { useRef, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { EmojiTile, FactRow, Group, Header, IconTile, ListGroup, ListRow, MoneyHero, Presentation, Screen, StatusBadge, Text, moneyTone, useTheme, useUi } from "../../ui/core";
import { EntryDetailActions, EntryReversal, useEntryReversalPresentation } from "./EntryReversal";
import { formatActivityAmount } from "./format";
import type { EntryDetail, EntryPlace } from "./types";
import type { ReversalState } from "./useReversal";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../api";
import type { ContextPillContent } from "../../ui/contextPillModel";
import { useContextPill } from "../../ui/ContextPill";
import { historyDate, type HistoryCategory } from "./listModel";
import { formatAmount } from "../money";
import { accountEmoji } from "../places/model";

export function entryPillContent(detail: EntryDetail, categories: HistoryCategory[], budget?: FunctionReturnType<typeof api.budget.evaluate>): ContextPillContent {
  const { row } = detail;
  const primary = row.userCategories.find((category) => category.id === row.primaryUserCategoryId) ?? row.userCategories[0];
  const category = categories.find((category) => category.id === primary?.id);
  const jar = budget?.month === row.date.slice(0, 7) ? budget.jars.find((jar) => jar.category.id === primary?.id) : undefined;
  if (jar) return { kind: "budget", name: jar.category.name, emoji: category?.style.emoji ?? jar.category.emoji,
    currency: budget?.currency ?? row.amount.currency, limitMinor: jar.limitMinorUnits, spentMinor: jar.consumptionMinorUnits };
  return { kind: "entry", name: row.title, emoji: category?.style.emoji ?? (row.transfer ? "↔️" : "🧾"),
    currency: row.amount.currency, amountMinor: row.amount.minorUnits };
}

export function EntryDetailScreen({ detail, reversal, onBack, onEntry, onReverse, onCancel, onConfirm, categories = [], places = [], budget, active = true, currentDate }: {
  detail: EntryDetail | undefined;
  reversal: ReversalState;
  onBack: () => void;
  onEntry: (id: string) => void;
  onReverse: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  categories?: HistoryCategory[];
  places?: EntryPlace[];
  budget?: FunctionReturnType<typeof api.budget.evaluate>;
  active?: boolean;
  currentDate?: string;
}) {
  const ui = useUi();
  const reversalPresentation = useEntryReversalPresentation(reversal);
  const scrollRef = useRef<ScrollView>(null);
  const [covered, setCovered] = useState(false);
  const pill = useContextPill({
    identity: `entry:${detail?.entry.id ?? "loading"}:${detail?.row.date.slice(0, 7) ?? ""}`,
    active: active && detail !== undefined && !covered,
    content: detail ? entryPillContent(detail, categories, budget) : { kind: "entry", name: "Entry", emoji: "🧾", currency: "", amountMinor: 0 },
    onBackToSummary: ({ y, animated }) => scrollRef.current?.scrollTo({ y, animated }),
  });
  const entry = detail?.entry;
  const primary = detail?.row.userCategories.find((category) => category.id === detail.row.primaryUserCategoryId);
  const legacy = <Screen scrollRef={scrollRef} scrollProps={pill.scrollProps}>
    <Header title="Posted entry" onBack={onBack} />
    {!detail ? <ActivityIndicator accessibilityLabel="Loading entry" /> : <>
      <View {...pill.summaryProps} style={ui.section}>
        <Text variant="section" style={ui.title}>{detail.row.title}</Text>
        <Text variant="hero" adjustsFontSizeToFit numberOfLines={1} style={ui.hero}>{formatActivityAmount(detail.row.amount)}</Text>
        <Text preset="body" style={ui.muted}>{detail.row.reversed ? "Reversed" : entry?.reversesEntryId ? "Reversal" : "Posted"}</Text>
      </View>
      <ListGroup>
        <ListRow title="Date" value={detail.row.date} />
        {detail.row.transfer ? <>
          <ListRow title="From" value={detail.row.transfer.from.name} />
          <ListRow title="To" value={detail.row.transfer.to.name} />
        </> : entry?.financialAccountProfileName && <ListRow title="Account" value={entry.financialAccountProfileName} />}
        {(!detail.row.transfer || detail.row.userCategories.length > 0) &&
          <ListRow title="Category" detail={detail.row.userCategories.map((category) => category.name).join(" · ") || "No category"} />}
        {primary && <ListRow title="Primary category" value={primary.name} />}
      </ListGroup>
      <EntryReversal presentation={reversalPresentation} detail={detail} reversal={reversal} onEntry={onEntry}
        onReverse={onReverse} onCancel={onCancel} onConfirm={onConfirm} />
    </>}
  </Screen>;
  return <Presentation legacy={legacy}>
    <Screen scrollRef={scrollRef} scrollProps={pill.scrollProps} footer={detail ? <EntryDetailActions detail={detail} reversal={reversal}
      onEntry={onEntry} onReverse={onReverse} onConfirm={onConfirm} onClose={onBack} /> : undefined}>
      {!detail ? <ActivityIndicator accessibilityLabel="Loading entry" /> : <>
        <View {...pill.summaryProps}><EntrySummary detail={detail} reversal={reversal} /></View>
        <EntryFacts detail={detail} categories={categories} places={places} currentDate={currentDate ?? detail.row.date} />
        <EntryReversal presentation={reversalPresentation} detail={detail} reversal={reversal} onEntry={onEntry} onReverse={onReverse}
          onCancel={onCancel} onConfirm={onConfirm} onChildSheetChange={setCovered} />
      </>}
    </Screen>
  </Presentation>;
}

export function EntrySummary({ detail, reversal }: { detail: EntryDetail; reversal: ReversalState }) {
  const { row, entry } = detail;
  const reversed = row.reversed || reversal.kind === "posted";
  return <View style={{ gap: 12, paddingTop: 8 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <IconTile icon={row.amount.minorUnits > 0 ? "arrow-down" : "arrow-up"} tone="neutral" />
      <Text variant="label" tone="muted">{row.amount.minorUnits > 0 ? "MONEY IN" : "MONEY OUT"}</Text>
    </View>
    <Text variant="detailName" accessibilityRole="header">{row.title}</Text>
    <MoneyHero currency={row.amount.currency} amount={formatAmount(Math.abs(row.amount.minorUnits), row.amount.currency, { hideZeroDecimals: true })}
      negative={row.amount.minorUnits < 0} tone={moneyTone(row.amount.minorUnits)} />
    {reversed ? <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <IconTile icon="arrow-undo-outline" tone="muted" size={36} /><Text variant="rowTitle" tone="muted">Reversed</Text>
    </View> : <StatusBadge tone="positive" icon="checkmark" label={entry.reversesEntryId ? "Reversal" : "Posted"} />}
  </View>;
}

export function EntryFacts({ detail, categories, places = [], currentDate }: { detail: EntryDetail; categories: HistoryCategory[]; places?: EntryPlace[]; currentDate: string }) {
  const theme = useTheme();
  const { row, entry } = detail;
  const placeEmoji = (id: string | undefined) => {
    const place = places.find((place) => place.id === id);
    return place ? accountEmoji(place) : "💰";
  };
  return <Group title="About this entry" pairGap={12}>
    <FactRow label="When" value={historyDate(row.date, currentDate)} icon="calendar-outline" />
    {row.transfer && <>
      <FactRow label="From" value={row.transfer.from.name} emoji={placeEmoji(row.transfer.from.id)} />
      <FactRow label="To" value={row.transfer.to.name} emoji={placeEmoji(row.transfer.to.id)} />
    </>}
    {row.userCategories.map((category) => {
      const stored = categories.find((stored) => stored.id === category.id);
      return <FactRow key={category.id} label="Category" value={category.name}
        leading={<EmojiTile emoji={stored?.style.emoji ?? "🧾"} color={theme[stored?.style.tone ?? "mutedForeground"]} />} />;
    })}
    {!row.transfer && row.userCategories.length === 0 && <FactRow label="Category" value="No category" icon="pricetag-outline" />}
    {!row.transfer && <FactRow label="Place" value={entry.financialAccountProfileName ?? "No place"} emoji={placeEmoji(entry.financialAccountProfileId)} />}
  </Group>;
}
