import { ActivityIndicator, View } from "react-native";
import { useEffect, useState } from "react";
import { formatLongDate, useT } from "../../i18n";
import { ActionBar, Group, IconTile, InlineNotice, ListRow, NoteCard, Presentation, PrimaryButton, SecondaryButton, SheetHeader, Text, moneyTone, useUi } from "../../ui/core";
import { PickerSheet } from "../../ui/PickerSheet";
import { entryReversalBlock, type PlaceProfile } from "../placeEnding/model";
import { historyAmount } from "./listModel";
import type { EntryDetail } from "./types";
import type { ReversalState } from "./useReversal";

export type EntryReversalProps = {
  detail: EntryDetail;
  reversal: ReversalState;
  /** Every Place with its status, so an entry touching an ended Place offers no reversal. */
  places?: readonly Pick<PlaceProfile, "id" | "name" | "status">[];
  onEntry: (id: string) => void;
  onReverse: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  onChildSheetChange?: (open: boolean) => void;
  presentation: ReturnType<typeof useEntryReversalPresentation>;
};

export function useEntryReversalPresentation(reversal: ReversalState) {
  const [dismissedPhase, setDismissedPhase] = useState<ReversalState["kind"] | null>(null);
  useEffect(() => { if (reversal.kind === "idle" || reversal.kind === "submitting") setDismissedPhase(null); }, [reversal.kind]);
  return { dismissedPhase, dismiss: () => setDismissedPhase(reversal.kind) };
}

export function EntryReversal({ detail, reversal, places, onEntry, onReverse, onCancel, onConfirm, onChildSheetChange, presentation }: EntryReversalProps) {
  const ui = useUi();
  const { t, language } = useT();
  const { entry } = detail;
  const blocked = entryReversalBlock(detail, places, t);
  const canReverse = !entry.reversesEntryId && !entry.reversedByEntryId && !blocked;
  const originalId = entry.reversesEntryId;
  const reversalId = entry.reversedByEntryId;
  const postedLine = reversal.kind === "posted"
    ? t("review.reversalPosted", { date: formatLongDate(language, Date.parse(`${reversal.receipt.accountingDate}T00:00:00Z`), "UTC") }) : "";
  const legacy = <>
    {originalId && <SecondaryButton label={t("review.viewOriginal")} onPress={() => onEntry(originalId)} />}
    {reversalId && <SecondaryButton label={t("review.viewReversal")} onPress={() => onEntry(reversalId)} />}
    {blocked && !originalId && !reversalId && reversal.kind !== "posted" && <Text preset="body" style={ui.muted}>{blocked}</Text>}
    {reversal.kind === "posted" ? <View style={ui.section}>
      <Text preset="body" accessibilityRole="alert" style={ui.body}>{postedLine}</Text>
      <Text preset="body" style={ui.muted}>{t("review.originalPreserved")}</Text>
      {!entry.reversedByEntryId && <SecondaryButton label={t("review.viewReversal")} onPress={() => onEntry(reversal.receipt.id)} />}
    </View> : reversal.kind === "submitting" ? <View style={ui.section}>
      <ActivityIndicator accessibilityLabel={t("review.postingReversal")} />
      <Text preset="body" style={ui.muted}>{t("review.postingReversalProgress")}</Text>
    </View> : reversal.kind === "failed" ? <View style={ui.section}>
      <Text preset="body" accessibilityRole="alert" style={ui.error}>{reversal.message}</Text>
      {canReverse && <PrimaryButton label={t("review.retryReversal")} onPress={onConfirm} />}
    </View> : canReverse && (reversal.kind === "confirming" ? <View style={ui.section}>
      <Text variant="section" style={ui.title}>{t("review.reverseTitle")}</Text>
      <Text preset="body" style={ui.body}>{t("review.reverseBody")}</Text>
      <PrimaryButton label={t("review.confirmReversal")} onPress={onConfirm} />
      <SecondaryButton label={t("review.keepEntry")} onPress={onCancel} />
    </View> : <SecondaryButton label={t("review.reverseEntry")} onPress={onReverse} />)}
  </>;
  const confirming = reversal.kind === "confirming" || reversal.kind === "submitting" || reversal.kind === "failed";
  const childOpen = confirming && presentation.dismissedPhase !== reversal.kind;
  useEffect(() => { onChildSheetChange?.(childOpen); return () => onChildSheetChange?.(false); }, [childOpen, onChildSheetChange]);
  function closeConfirmation() { presentation.dismiss(); onCancel(); }
  return <Presentation legacy={legacy}>
    {childOpen && <PickerSheet onDismiss={closeConfirmation} busy={reversal.kind === "submitting"} stickyHeader={false}
      footer={<ActionBar secondary={[
        { label: reversal.kind === "failed" ? t("review.retryReversal") : t("review.reverseEntry"), onPress: onConfirm, tone: "danger", icon: "arrow-undo-outline",
          disabled: !canReverse, pending: reversal.kind === "submitting" },
        { label: t("review.keepEntry"), onPress: closeConfirmation, disabled: reversal.kind === "submitting" },
      ]} />}>
      <SheetHeader title={t("review.reverseNamed", { name: detail.row.title })} eyebrow={t("review.entryDetailsEyebrow")} onClose={closeConfirmation} disabled={reversal.kind === "submitting"} />
      <NoteCard tone="danger" icon="arrow-undo-outline" title={t("review.reverseAddsOpposite")} body={t("review.reverseNothingDeleted")} />
      <Group>
        <ListRow title={t("review.reverseStays", { name: detail.row.title })} value={historyAmount(detail.row.amount, true)} meta={t("review.reverseMetaPosted", { date: detail.row.date })}
          tone={moneyTone(detail.row.amount.minorUnits)} leading={<IconTile icon="receipt-outline" tone="neutral" size={36} />} />
        <ListRow title={t("review.reverseAdded")} value={historyAmount({ ...detail.row.amount, minorUnits: -detail.row.amount.minorUnits }, true)}
          meta={t("review.reverseMetaFirstOpen", { date: detail.row.date })} tone={moneyTone(-detail.row.amount.minorUnits)}
          leading={<IconTile icon="arrow-undo-outline" tone={moneyTone(-detail.row.amount.minorUnits)} size={36} />} />
      </Group>
      <View style={{ gap: 8 }}><Text variant="label" tone="muted">{t("review.netEffect")}</Text><Text variant="screen">{historyAmount({ ...detail.row.amount, minorUnits: 0 })}</Text></View>
      {reversal.kind === "failed" && <InlineNotice tone="danger" title={t("review.reversalFailedTitle")} detail={reversal.message} />}
    </PickerSheet>}
    {blocked && !originalId && !reversalId && reversal.kind !== "posted" && <InlineNotice tone="warning" title={blocked} />}
    {reversal.kind === "posted" && <Text variant="meta" tone="muted" accessibilityRole="alert">{postedLine}</Text>}
  </Presentation>;
}

export function EntryDetailActions({ detail, reversal, places, onEntry, onReverse, onConfirm, onClose }: Pick<EntryReversalProps, "detail" | "reversal" | "places" | "onEntry" | "onReverse" | "onConfirm"> & { onClose: () => void }) {
  const { t } = useT();
  const close = { label: t("home.sheetCloseDetails"), onPress: onClose, icon: "close" as const };
  const originalId = detail.entry.reversesEntryId;
  const reversalId = detail.entry.reversedByEntryId ?? (reversal.kind === "posted" ? reversal.receipt.id : undefined);
  const action = originalId ? { label: t("review.viewOriginal"), onPress: () => onEntry(originalId), icon: "arrow-forward" as const } :
    reversalId ? { label: t("review.viewReversal"), onPress: () => onEntry(reversalId), icon: "arrow-forward" as const } :
      entryReversalBlock(detail, places, t) ? null :
        { label: reversal.kind === "failed" ? t("review.retryReversal") : t("review.reverseEntry"), onPress: reversal.kind === "failed" ? onConfirm : onReverse, tone: "danger" as const, icon: "arrow-undo-outline" as const };
  return <ActionBar secondary={action ? [action, close] : [close]} />;
}
