import { ActivityIndicator, Text, View } from "react-native";
import { PrimaryButton, SecondaryButton, ui } from "../../ui/core";
import type { EntryDetail } from "./types";
import type { ReversalState } from "./useReversal";

export type EntryReversalProps = {
  detail: EntryDetail;
  reversal: ReversalState;
  onEntry: (id: string) => void;
  onReverse: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function EntryReversal({ detail, reversal, onEntry, onReverse, onCancel, onConfirm }: EntryReversalProps) {
  const { entry } = detail;
  const canReverse = !entry.reversesEntryId && !entry.reversedByEntryId;
  const originalId = entry.reversesEntryId;
  const reversalId = entry.reversedByEntryId;
  return <>
    {originalId && <SecondaryButton label="View original entry" onPress={() => onEntry(originalId)} />}
    {reversalId && <SecondaryButton label="View reversal" onPress={() => onEntry(reversalId)} />}
    {reversal.kind === "posted" ? <View style={ui.section}>
      <Text accessibilityRole="alert" style={ui.body}>Reversal posted · {reversal.receipt.accountingDate}</Text>
      <Text style={ui.muted}>The original entry is preserved.</Text>
      {!entry.reversedByEntryId && <SecondaryButton label="View reversal" onPress={() => onEntry(reversal.receipt.id)} />}
    </View> : reversal.kind === "submitting" ? <View style={ui.section}>
      <ActivityIndicator accessibilityLabel="Posting reversal" />
      <Text style={ui.muted}>Posting reversal…</Text>
    </View> : reversal.kind === "failed" ? <View style={ui.section}>
      <Text accessibilityRole="alert" style={ui.error}>{reversal.message}</Text>
      {canReverse && <PrimaryButton label="Retry reversal" onPress={onConfirm} />}
    </View> : canReverse && (reversal.kind === "confirming" ? <View style={ui.section}>
      <Text style={ui.title}>Reverse this entry?</Text>
      <Text style={ui.body}>This posts an opposite entry and keeps the original. It uses the original date, or the earliest open date if that month is locked.</Text>
      <PrimaryButton label="Confirm reversal" onPress={onConfirm} />
      <SecondaryButton label="Keep entry" onPress={onCancel} />
    </View> : <SecondaryButton label="Reverse entry" onPress={onReverse} />)}
  </>;
}
