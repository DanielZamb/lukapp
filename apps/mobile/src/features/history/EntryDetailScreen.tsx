import { ActivityIndicator, Text, View } from "react-native";
import { Header, ListGroup, ListRow, Screen, useUi } from "../../ui/core";
import { EntryReversal } from "./EntryReversal";
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
  const ui = useUi();
  const entry = detail?.entry;
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
      <EntryReversal detail={detail} reversal={reversal} onEntry={onEntry}
        onReverse={onReverse} onCancel={onCancel} onConfirm={onConfirm} />
    </>}
  </Screen>;
}
