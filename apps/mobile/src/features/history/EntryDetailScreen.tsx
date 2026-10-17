import { ActivityIndicator, Text, View } from "react-native";
import { Header, ListGroup, ListRow, PrimaryButton, Screen, SecondaryButton, ui } from "../../ui/core";
import { formatActivityAmount } from "./format";
import type { EntryDetail } from "./types";
import type { ReversalState } from "./useReversal";

export function EntryDetailScreen({ detail, reversal, onBack, onEntry, onReverse, onCancel, onConfirm }: {
  detail: EntryDetail | undefined;
  reversal: ReversalState;
  onBack: () => void;
  onEntry: (id: string) => void;
  onReverse: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const entry = detail?.entry;
  const canReverse = !!entry && !entry.reversesEntryId && !entry.reversedByEntryId;
  const originalId = entry?.reversesEntryId;
  const reversalId = entry?.reversedByEntryId;
  const primary = detail?.row.userCategories.find((category) => category.id === detail.row.primaryUserCategoryId);
  return <Screen>
    <Header title="Posted entry" onBack={onBack} />
    {!detail ? <ActivityIndicator accessibilityLabel="Loading entry" /> : <>
      <View style={ui.section}>
        <Text style={ui.title}>{detail.row.title}</Text>
        <Text adjustsFontSizeToFit numberOfLines={1} style={ui.hero}>{formatActivityAmount(detail.row.amount)}</Text>
        <Text style={ui.muted}>{detail.row.reversed ? "Reversed" : entry?.reversesEntryId ? "Reversal" : "Posted"}</Text>
      </View>
      <ListGroup>
        <ListRow title="Date" value={detail.row.date} />
        {entry?.financialAccountProfileName && <ListRow title="Account" value={entry.financialAccountProfileName} />}
        <ListRow title="Category" detail={detail.row.userCategories.map((category) => category.name).join(" · ") || "No category"} />
        {primary && <ListRow title="Primary category" value={primary.name} />}
      </ListGroup>
      {originalId && <SecondaryButton label="View original entry" onPress={() => onEntry(originalId)} />}
      {reversalId && <SecondaryButton label="View reversal" onPress={() => onEntry(reversalId)} />}
      {reversal.kind === "posted" ? <View style={ui.section}>
        <Text accessibilityRole="alert" style={ui.body}>Reversal posted · {reversal.receipt.accountingDate}</Text>
        <Text style={ui.muted}>The original entry is preserved.</Text>
        {!entry?.reversedByEntryId && <SecondaryButton label="View reversal" onPress={() => onEntry(reversal.receipt.id)} />}
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
    </>}
  </Screen>;
}
