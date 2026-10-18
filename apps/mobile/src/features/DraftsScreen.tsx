import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Header, ListGroup, ListRow, PrimaryButton, Screen, SecondaryButton, ui } from "../ui/core";
import { spacing } from "../ui/tokens";
import { formatMoney } from "./money";
import type { DraftListItem, LocalEntryDraftId } from "./localEntryDrafts";
import type { IntakeCandidate, IntakeCandidateId } from "./intake/candidates";
import { currencyMismatchReason, isReadyCandidate } from "./intake/ready";

export type InboxSegment = "now" | "wait";

function candidateDetail(
  candidate: IntakeCandidate,
  workspaceCurrency: "COP" | "USD",
) {
  const expiry = `Expires ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(candidate.expiresAt))}`;
  const mismatch = currencyMismatchReason(candidate.currency, workspaceCurrency);
  if (mismatch) return `${mismatch} · ${expiry}`;
  if (candidate.error) return `${candidate.error} · ${expiry}`;
  if (!isReadyCandidate(candidate, workspaceCurrency))
    return `Needs review · ${expiry}`;
  return expiry;
}

function draftDetail(item: DraftListItem) {
  const expiry = `Expires ${new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(item.expiresAt))}`;
  return item.status === "posting" ? `Retry posting · ${expiry}` : expiry;
}

export function DraftsScreen({
  drafts,
  now,
  wait,
  ready,
  readyTotal,
  currency,
  segment,
  readyToShow,
  error,
  confirming,
  completeLabel,
  onSegment,
  onBack,
  onResumeDraft,
  onOpenCandidate,
  onConfirmReady,
  onCompleteMonth,
}: {
  drafts: DraftListItem[];
  now: IntakeCandidate[];
  wait: IntakeCandidate[];
  ready: IntakeCandidate[];
  readyTotal: number;
  currency: "COP" | "USD";
  segment: InboxSegment;
  readyToShow: boolean;
  error: string;
  confirming: boolean;
  completeLabel: string;
  onSegment: (segment: InboxSegment) => void;
  onBack: () => void;
  onResumeDraft: (id: LocalEntryDraftId) => void;
  onOpenCandidate: (id: IntakeCandidateId) => void;
  onConfirmReady: () => void;
  onCompleteMonth: () => void;
}) {
  const empty = drafts.length === 0 && now.length === 0 && wait.length === 0;
  const candidateRows = segment === "now" ? now : wait;
  const draftRows =
    segment === "now"
      ? drafts.filter((item) => item.status === "posting")
      : drafts.filter((item) => item.status !== "posting");
  return (
    <Screen>
      <Header title="Drafts" eyebrow="ON THIS DEVICE" onBack={onBack} />
      {error ? (
        <Text accessibilityRole="alert" style={ui.error}>
          {error}
        </Text>
      ) : null}
      <Text style={ui.muted}>
        Notification Intake can miss, delay, or duplicate activity. Reconcile
        before you rely on it.
      </Text>
      <Text style={ui.label}>{ready.length} ready to add</Text>
      <Text style={ui.hero}>
        {formatMoney({ currency, minorUnits: readyTotal })}
      </Text>
      <PrimaryButton
        label="Confirm all Ready"
        disabled={ready.length === 0 || confirming}
        onPress={onConfirmReady}
      />
      <View style={{ flexDirection: "row", gap: spacing.md }}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: segment === "now" }}
          accessibilityLabel={`Needs you now, ${now.length + drafts.filter((item) => item.status === "posting").length}`}
          onPress={() => onSegment("now")}
          style={{ minHeight: 48, justifyContent: "center" }}
        >
          <Text style={segment === "now" ? ui.title : ui.muted}>
            Needs you now · {now.length + drafts.filter((item) => item.status === "posting").length}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: segment === "wait" }}
          accessibilityLabel={`Can wait, ${wait.length + drafts.filter((item) => item.status !== "posting").length}`}
          onPress={() => onSegment("wait")}
          style={{ minHeight: 48, justifyContent: "center" }}
        >
          <Text style={segment === "wait" ? ui.title : ui.muted}>
            Can wait · {wait.length + drafts.filter((item) => item.status !== "posting").length}
          </Text>
        </Pressable>
      </View>
      {!readyToShow ? (
        <ActivityIndicator accessibilityLabel="Loading drafts" />
      ) : empty ? (
        <>
          <Text style={ui.title}>No Drafts to review</Text>
          <Text style={ui.muted}>The Drafts destination remains available.</Text>
        </>
      ) : (
        <ListGroup>
          {candidateRows.map((candidate) => (
            <ListRow
              key={candidate.id}
              title={candidate.suggestion.description.trim() || "Needs review"}
              detail={candidateDetail(candidate, currency)}
              value={formatMoney({
                currency: candidate.currency,
                minorUnits:
                  candidate.suggestion.direction === "out"
                    ? -Math.abs(candidate.suggestion.amountMinorUnits)
                    : Math.abs(candidate.suggestion.amountMinorUnits),
              })}
              onPress={() => onOpenCandidate(candidate.id)}
            />
          ))}
          {draftRows.map((item) => (
            <ListRow
              key={item.id}
              title={item.description.trim() || "Incomplete draft"}
              detail={draftDetail(item)}
              onPress={() => onResumeDraft(item.id)}
            />
          ))}
        </ListGroup>
      )}
      <SecondaryButton label={completeLabel} onPress={onCompleteMonth} />
    </Screen>
  );
}
