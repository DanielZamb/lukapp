import { ActivityIndicator, Text, View } from "react-native";
import { formatLongDate, useT } from "../../i18n";
import { PrimaryButton, SecondaryButton, useUi } from "../../ui/core";
import { entryReversalBlock, type PlaceProfile } from "../placeEnding/model";
import type { EntryDetail } from "./types";
import type { ReversalState } from "./useReversal";

export type EntryReversalProps = {
  detail: EntryDetail;
  reversal: ReversalState;
  /** Every Place with its status, so an entry touching an ended Place offers no reversal. */
  places?: PlaceProfile[];
  onEntry: (id: string) => void;
  onReverse: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function EntryReversal({ detail, reversal, places, onEntry, onReverse, onCancel, onConfirm }: EntryReversalProps) {
  const ui = useUi();
  const { t, language } = useT();
  const { entry } = detail;
  const blocked = entryReversalBlock(detail, places, t);
  const canReverse = !entry.reversesEntryId && !entry.reversedByEntryId && !blocked;
  const originalId = entry.reversesEntryId;
  const reversalId = entry.reversedByEntryId;
  return <>
    {originalId && <SecondaryButton label={t("review.viewOriginal")} onPress={() => onEntry(originalId)} />}
    {reversalId && <SecondaryButton label={t("review.viewReversal")} onPress={() => onEntry(reversalId)} />}
    {blocked && !originalId && !reversalId && reversal.kind !== "posted" && <Text style={ui.muted}>{blocked}</Text>}
    {reversal.kind === "posted" ? <View style={ui.section}>
      <Text accessibilityRole="alert" style={ui.body}>{t("review.reversalPosted", { date: formatLongDate(language, Date.parse(`${reversal.receipt.accountingDate}T00:00:00Z`), "UTC") })}</Text>
      <Text style={ui.muted}>{t("review.originalPreserved")}</Text>
      {!entry.reversedByEntryId && <SecondaryButton label={t("review.viewReversal")} onPress={() => onEntry(reversal.receipt.id)} />}
    </View> : reversal.kind === "submitting" ? <View style={ui.section}>
      <ActivityIndicator accessibilityLabel={t("review.postingReversal")} />
      <Text style={ui.muted}>{t("review.postingReversalProgress")}</Text>
    </View> : reversal.kind === "failed" ? <View style={ui.section}>
      <Text accessibilityRole="alert" style={ui.error}>{reversal.message}</Text>
      {canReverse && <PrimaryButton label={t("review.retryReversal")} onPress={onConfirm} />}
    </View> : canReverse && (reversal.kind === "confirming" ? <View style={ui.section}>
      <Text style={ui.title}>{t("review.reverseTitle")}</Text>
      <Text style={ui.body}>{t("review.reverseBody")}</Text>
      <PrimaryButton label={t("review.confirmReversal")} onPress={onConfirm} />
      <SecondaryButton label={t("review.keepEntry")} onPress={onCancel} />
    </View> : <SecondaryButton label={t("review.reverseEntry")} onPress={onReverse} />)}
  </>;
}
