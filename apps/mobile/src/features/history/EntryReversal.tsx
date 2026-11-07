import { ActivityIndicator, View } from "react-native";
import { useEffect, useState } from "react";
import { ActionBar, Group, IconTile, InlineNotice, ListRow, NoteCard, Presentation, PrimaryButton, SecondaryButton, SheetHeader, Text, moneyTone, useUi } from "../../ui/core";
import { PickerSheet } from "../../ui/PickerSheet";
import { historyAmount } from "./listModel";
import type { EntryDetail } from "./types";
import type { ReversalState } from "./useReversal";

export type EntryReversalProps = {
  detail: EntryDetail;
  reversal: ReversalState;
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

export function EntryReversal({ detail, reversal, onEntry, onReverse, onCancel, onConfirm, onChildSheetChange, presentation }: EntryReversalProps) {
  const ui = useUi();
  const { entry } = detail;
  const canReverse = !entry.reversesEntryId && !entry.reversedByEntryId;
  const originalId = entry.reversesEntryId;
  const reversalId = entry.reversedByEntryId;
  const legacy = <>
    {originalId && <SecondaryButton label="View original entry" onPress={() => onEntry(originalId)} />}
    {reversalId && <SecondaryButton label="View reversal" onPress={() => onEntry(reversalId)} />}
    {reversal.kind === "posted" ? <View style={ui.section}>
      <Text preset="body" accessibilityRole="alert" style={ui.body}>Reversal posted · {reversal.receipt.accountingDate}</Text>
      <Text preset="body" style={ui.muted}>The original entry is preserved.</Text>
      {!entry.reversedByEntryId && <SecondaryButton label="View reversal" onPress={() => onEntry(reversal.receipt.id)} />}
    </View> : reversal.kind === "submitting" ? <View style={ui.section}>
      <ActivityIndicator accessibilityLabel="Posting reversal" />
      <Text preset="body" style={ui.muted}>Posting reversal…</Text>
    </View> : reversal.kind === "failed" ? <View style={ui.section}>
      <Text preset="body" accessibilityRole="alert" style={ui.error}>{reversal.message}</Text>
      {canReverse && <PrimaryButton label="Retry reversal" onPress={onConfirm} />}
    </View> : canReverse && (reversal.kind === "confirming" ? <View style={ui.section}>
      <Text variant="section" style={ui.title}>Reverse this entry?</Text>
      <Text preset="body" style={ui.body}>This posts an opposite entry and keeps the original. It uses the original date, or the earliest open date if that month is locked.</Text>
      <PrimaryButton label="Confirm reversal" onPress={onConfirm} />
      <SecondaryButton label="Keep entry" onPress={onCancel} />
    </View> : <SecondaryButton label="Reverse entry" onPress={onReverse} />)}
  </>;
  const confirming = reversal.kind === "confirming" || reversal.kind === "submitting" || reversal.kind === "failed";
  const childOpen = confirming && presentation.dismissedPhase !== reversal.kind;
  useEffect(() => { onChildSheetChange?.(childOpen); return () => onChildSheetChange?.(false); }, [childOpen, onChildSheetChange]);
  function closeConfirmation() { presentation.dismiss(); onCancel(); }
  return <Presentation legacy={legacy}>
    {childOpen && <PickerSheet onDismiss={closeConfirmation} busy={reversal.kind === "submitting"} stickyHeader={false}
      footer={<ActionBar secondary={[
        { label: reversal.kind === "failed" ? "Retry reversal" : "Reverse entry", onPress: onConfirm, tone: "danger", icon: "arrow-undo-outline",
          disabled: !canReverse, pending: reversal.kind === "submitting" },
        { label: "Keep entry", onPress: closeConfirmation, disabled: reversal.kind === "submitting" },
      ]} />}>
      <SheetHeader title={`Reverse ${detail.row.title}?`} eyebrow="ENTRY DETAILS" onClose={closeConfirmation} disabled={reversal.kind === "submitting"} />
      <NoteCard tone="danger" icon="arrow-undo-outline" title="Lukapp adds an opposite entry." body="Nothing is deleted." />
      <Group>
        <ListRow title={`${detail.row.title} stays`} value={historyAmount(detail.row.amount, true)} meta={`${detail.row.date} · posted`}
          tone={moneyTone(detail.row.amount.minorUnits)} leading={<IconTile icon="receipt-outline" tone="neutral" size={36} />} />
        <ListRow title="A reversal is added" value={historyAmount({ ...detail.row.amount, minorUnits: -detail.row.amount.minorUnits }, true)}
          meta={`${detail.row.date}, or the first open day`} tone={moneyTone(-detail.row.amount.minorUnits)}
          leading={<IconTile icon="arrow-undo-outline" tone={moneyTone(-detail.row.amount.minorUnits)} size={36} />} />
      </Group>
      <View style={{ gap: 8 }}><Text variant="label" tone="muted">Net effect</Text><Text variant="screen">{historyAmount({ ...detail.row.amount, minorUnits: 0 })}</Text></View>
      {reversal.kind === "failed" && <InlineNotice tone="danger" title="Couldn't confirm the reversal" detail={reversal.message} />}
    </PickerSheet>}
    {reversal.kind === "posted" && <Text variant="meta" tone="muted" accessibilityRole="alert">Reversal posted · {reversal.receipt.accountingDate}</Text>}
  </Presentation>;
}

export function EntryDetailActions({ detail, reversal, onEntry, onReverse, onConfirm, onClose }: Pick<EntryReversalProps, "detail" | "reversal" | "onEntry" | "onReverse" | "onConfirm"> & { onClose: () => void }) {
  const originalId = detail.entry.reversesEntryId;
  const reversalId = detail.entry.reversedByEntryId ?? (reversal.kind === "posted" ? reversal.receipt.id : undefined);
  const action = originalId ? { label: "View original entry", onPress: () => onEntry(originalId), icon: "arrow-forward" as const } :
    reversalId ? { label: "View reversal", onPress: () => onEntry(reversalId), icon: "arrow-forward" as const } :
      { label: reversal.kind === "failed" ? "Retry reversal" : "Reverse entry", onPress: reversal.kind === "failed" ? onConfirm : onReverse, tone: "danger" as const, icon: "arrow-undo-outline" as const };
  return <ActionBar secondary={[action, { label: "Close details", onPress: onClose, icon: "close" }]} />;
}
