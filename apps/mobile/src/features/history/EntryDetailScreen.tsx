import { useRef, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { useT } from "../../i18n";
import { EmojiTile, FactRow, Group, Header, IconTile, ListGroup, ListRow, MoneyHero, Presentation, Screen, StatusBadge, Text, moneyTone, useTheme, useUi } from "../../ui/core";
import { entryPlaceName, type PlaceProfile } from "../placeEnding/model";
import { EntryDetailActions, EntryReversal, useEntryReversalPresentation } from "./EntryReversal";
import { formatActivityAmount } from "./format";
import type { EntryDetail } from "./types";
import type { ReversalState } from "./useReversal";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../api";
import type { ContextPillContent } from "../../ui/contextPillModel";
import { useContextPill } from "../../ui/ContextPill";
import { historyDate, type HistoryCategory } from "./listModel";
import { formatAmount } from "../money";
import { accountEmoji } from "../places/model";

/** Every Place with its status: an entry on an ended Place reads as such and offers no reversal. */
export type EntryPlaces = readonly Pick<PlaceProfile, "id" | "name" | "status" | "emoji" | "productKind">[];

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

export function EntryDetailScreen({ detail, reversal, onBack, onEntry, onReverse, onCancel, onConfirm, categories = [], places, budget, active = true, currentDate }: {
  detail: EntryDetail | undefined;
  reversal: ReversalState;
  onBack: () => void;
  onEntry: (id: string) => void;
  onReverse: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  categories?: HistoryCategory[];
  places?: EntryPlaces;
  budget?: FunctionReturnType<typeof api.budget.evaluate>;
  active?: boolean;
  currentDate?: string;
}) {
  const ui = useUi();
  const { t } = useT();
  const reversalPresentation = useEntryReversalPresentation(reversal);
  const scrollRef = useRef<ScrollView>(null);
  const [covered, setCovered] = useState(false);
  const pill = useContextPill({
    identity: `entry:${detail?.entry.id ?? "loading"}:${detail?.row.date.slice(0, 7) ?? ""}`,
    active: active && detail !== undefined && !covered,
    content: detail ? entryPillContent(detail, categories, budget) : { kind: "entry", name: t("review.postedEntry"), emoji: "🧾", currency: "", amountMinor: 0 },
    onBackToSummary: ({ y, animated }) => scrollRef.current?.scrollTo({ y, animated }),
  });
  const entry = detail?.entry;
  const primary = detail?.row.userCategories.find((category) => category.id === detail.row.primaryUserCategoryId);
  const legacy = <Screen scrollRef={scrollRef} scrollProps={pill.scrollProps}>
    <Header title={t("review.postedEntry")} onBack={onBack} />
    {!detail ? <ActivityIndicator accessibilityLabel={t("review.loadingEntry")} /> : <>
      <View {...pill.summaryProps} style={ui.section}>
        <Text variant="section" style={ui.title}>{detail.row.title}</Text>
        <Text variant="hero" adjustsFontSizeToFit numberOfLines={1} style={ui.hero}>{formatActivityAmount(detail.row.amount)}</Text>
        <Text preset="body" style={ui.muted}>{detail.row.reversed ? t("review.statusReversed") : entry?.reversesEntryId ? t("review.statusReversal") : t("review.statusPosted")}</Text>
      </View>
      <ListGroup>
        <ListRow title={t("review.date")} value={detail.row.date} />
        {detail.row.transfer ? <>
          <ListRow title={t("review.transferFrom")} value={entryPlaceName(detail.row.transfer.from.id, detail.row.transfer.from.name, places, t)} />
          <ListRow title={t("review.transferTo")} value={entryPlaceName(detail.row.transfer.to.id, detail.row.transfer.to.name, places, t)} />
        </> : entry?.financialAccountProfileName && <ListRow title={t("review.account")}
          value={entryPlaceName(entry.financialAccountProfileId, entry.financialAccountProfileName, places, t)} />}
        {(!detail.row.transfer || detail.row.userCategories.length > 0) &&
          <ListRow title={t("review.category")} detail={detail.row.userCategories.map((category) => category.name).join(" · ") || t("review.noCategory")} />}
        {primary && <ListRow title={t("review.primaryCategory")} value={primary.name} />}
      </ListGroup>
      <EntryReversal presentation={reversalPresentation} detail={detail} reversal={reversal} places={places} onEntry={onEntry}
        onReverse={onReverse} onCancel={onCancel} onConfirm={onConfirm} />
    </>}
  </Screen>;
  return <Presentation legacy={legacy}>
    <Screen scrollRef={scrollRef} scrollProps={pill.scrollProps} footer={detail ? <EntryDetailActions detail={detail} reversal={reversal} places={places}
      onEntry={onEntry} onReverse={onReverse} onConfirm={onConfirm} onClose={onBack} /> : undefined}>
      {!detail ? <ActivityIndicator accessibilityLabel={t("review.loadingEntry")} /> : <>
        <View {...pill.summaryProps}><EntrySummary detail={detail} reversal={reversal} /></View>
        <EntryFacts detail={detail} categories={categories} places={places} currentDate={currentDate ?? detail.row.date} />
        <EntryReversal presentation={reversalPresentation} detail={detail} reversal={reversal} places={places} onEntry={onEntry} onReverse={onReverse}
          onCancel={onCancel} onConfirm={onConfirm} onChildSheetChange={setCovered} />
      </>}
    </Screen>
  </Presentation>;
}

export function EntrySummary({ detail, reversal }: { detail: EntryDetail; reversal: ReversalState }) {
  const { t } = useT();
  const { row, entry } = detail;
  const reversed = row.reversed || reversal.kind === "posted";
  return <View style={{ gap: 12, paddingTop: 8 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <IconTile icon={row.amount.minorUnits > 0 ? "arrow-down" : "arrow-up"} tone="neutral" />
      <Text variant="label" tone="muted">{row.amount.minorUnits > 0 ? t("review.moneyIn") : t("review.moneyOut")}</Text>
    </View>
    <Text variant="detailName" accessibilityRole="header">{row.title}</Text>
    <MoneyHero currency={row.amount.currency} amount={formatAmount(Math.abs(row.amount.minorUnits), row.amount.currency, { hideZeroDecimals: true })}
      negative={row.amount.minorUnits < 0} tone={moneyTone(row.amount.minorUnits)} />
    {reversed ? <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <IconTile icon="arrow-undo-outline" tone="muted" size={36} /><Text variant="rowTitle" tone="muted">{t("review.statusReversed")}</Text>
    </View> : <StatusBadge tone="positive" icon="checkmark" label={entry.reversesEntryId ? t("review.statusReversal") : t("review.statusPosted")} />}
  </View>;
}

export function EntryFacts({ detail, categories, places = [], currentDate }: { detail: EntryDetail; categories: HistoryCategory[]; places?: EntryPlaces; currentDate: string }) {
  const theme = useTheme();
  const { t, language } = useT();
  const { row, entry } = detail;
  const placeEmoji = (id: string | undefined) => {
    const place = places.find((place) => place.id === id);
    return place ? accountEmoji(place) : "💰";
  };
  return <Group title={t("review.aboutEntry")} pairGap={12}>
    <FactRow label={t("review.when")} value={historyDate(row.date, currentDate, language)} icon="calendar-outline" />
    {row.transfer && <>
      <FactRow label={t("review.transferFrom")} value={entryPlaceName(row.transfer.from.id, row.transfer.from.name, places, t)} emoji={placeEmoji(row.transfer.from.id)} />
      <FactRow label={t("review.transferTo")} value={entryPlaceName(row.transfer.to.id, row.transfer.to.name, places, t)} emoji={placeEmoji(row.transfer.to.id)} />
    </>}
    {row.userCategories.map((category) => {
      const stored = categories.find((stored) => stored.id === category.id);
      return <FactRow key={category.id} label={t("review.category")} value={category.name}
        leading={<EmojiTile emoji={stored?.style.emoji ?? "🧾"} color={theme[stored?.style.tone ?? "mutedForeground"]} />} />;
    })}
    {!row.transfer && row.userCategories.length === 0 && <FactRow label={t("review.category")} value={t("review.noCategory")} icon="pricetag-outline" />}
    {!row.transfer && <FactRow label={t("review.place")} value={entry.financialAccountProfileName ? entryPlaceName(entry.financialAccountProfileId, entry.financialAccountProfileName, places, t) : t("review.noPlace")} emoji={placeEmoji(entry.financialAccountProfileId)} />}
  </Group>;
}
