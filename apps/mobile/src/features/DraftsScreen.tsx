import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { ConfirmationScreen, Header, ListGroup, ListRow, PrimaryButton, Screen, theme, ui } from "../ui/core";
import { font, radius, spacing, touchTarget } from "../ui/tokens";
import { formatMoney } from "./money";
import type { DraftListItem, LocalEntryDraftId } from "./localEntryDrafts";
import type { IntakeCandidate, IntakeCandidateId } from "./intake/candidates";
import { currencyMismatchReason, isReadyCandidate } from "./intake/ready";
import { IntakeSources, MonthCloseWarning, ReconciliationWarning, WarningIconButton } from "./intake/InboxDetails";

export type InboxSegment = "now" | "wait";
type InboxScreen = "inbox" | "warning" | "sources" | "month-close";

function candidateDetail(
  candidate: IntakeCandidate,
  workspaceCurrency: "COP" | "USD",
  places: { id: string; name: string }[],
) {
  const mismatch = currencyMismatchReason(candidate.currency, workspaceCurrency);
  if (mismatch) return mismatch;
  if (candidate.error) return candidate.error;
  if (!isReadyCandidate(candidate, workspaceCurrency)) return "Needs review";
  return places.find((place) => place.id === candidate.suggestion.financialAccountProfileId)?.name ?? "Saved place";
}

export function DraftsScreen({
  drafts, now, wait, ready, readyTotal, currency, segment, readyToShow, error,
  confirming, month, places, confirmedCount, onContinueAfterConfirmation,
  onSegment, onBack, onResumeDraft, onOpenCandidate, onConfirmReady, onCompleteMonth,
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
  month: string;
  places: { id: string; name: string }[];
  confirmedCount: number | null;
  onContinueAfterConfirmation: () => void;
  onSegment: (segment: InboxSegment) => void;
  onBack: () => void;
  onResumeDraft: (id: LocalEntryDraftId) => void;
  onOpenCandidate: (id: IntakeCandidateId) => void;
  onConfirmReady: () => void;
  onCompleteMonth: () => void;
}) {
  const [screen, setScreen] = useState<InboxScreen>("inbox");
  const [warningViewed, setWarningViewed] = useState(false);
  const empty = drafts.length === 0 && now.length === 0 && wait.length === 0;
  const candidateRows = segment === "now" ? now : wait;
  const postingDrafts = drafts.filter((item) => item.status === "posting");
  const otherDrafts = drafts.filter((item) => item.status !== "posting");
  const draftRows = segment === "now" ? postingDrafts : otherDrafts;
  const backToInbox = () => setScreen("inbox");

  if (confirmedCount !== null) {
    return (
      <ConfirmationScreen
        title={confirmedCount === 1 ? "Record added" : `${confirmedCount} records added`}
        detail="The server validated and posted each record. Local notification content was deleted after acknowledgement."
        buttonLabel={empty ? "Continue to Month Close" : "Back to Candidates"}
        onContinue={empty ? onCompleteMonth : onContinueAfterConfirmation}
      />
    );
  }
  if (screen === "warning") {
    return <ReconciliationWarning onBack={() => { setWarningViewed(true); backToInbox(); }} />;
  }
  if (screen === "sources") return <IntakeSources onBack={backToInbox} />;
  if (screen === "month-close") {
    return <MonthCloseWarning month={month} count={now.length + wait.length} onBack={backToInbox} onContinue={onCompleteMonth} />;
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Header title="Candidates" eyebrow="NOTIFICATION INTAKE" onBack={onBack} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Sources" onPress={() => setScreen("sources")} style={styles.sources}>
          <Text style={styles.linkText}>Sources</Text>
        </Pressable>
      </View>
      {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}
      {!readyToShow ? (
        <ActivityIndicator accessibilityLabel="Loading drafts" />
      ) : empty && !error ? (
        <>
          <View style={styles.hero}>
            <Text style={styles.kicker}>Review complete</Text>
            <Text style={styles.amount}>Nothing waiting</Text>
            <Text style={styles.body}>
              {month} is ready to close. Remaining local Candidates never block Month Close.
            </Text>
          </View>
          <PrimaryButton label="Continue to Month Close" onPress={() => setScreen("month-close")} />
        </>
      ) : (
        <>
          <View style={styles.hero}>
            <View style={styles.kickerRow}>
              <Text style={styles.kicker}>{ready.length} ready to add</Text>
              {!warningViewed && <WarningIconButton onPress={() => setScreen("warning")} />}
            </View>
            <Text style={styles.amount}>{formatMoney({ currency, minorUnits: readyTotal })}</Text>
            <Text style={styles.body}>Review what needs you now, or confirm every Ready Candidate.</Text>
          </View>
          <PrimaryButton label="Confirm all Ready" disabled={ready.length === 0 || confirming} pending={confirming} onPress={onConfirmReady} />
        </>
      )}
      {readyToShow && (
        <>
          <View style={styles.track} accessibilityRole="tablist">
            {([
              { id: "now", label: "Needs you now", count: now.length + postingDrafts.length },
              { id: "wait", label: "Can wait", count: wait.length + otherDrafts.length },
            ] satisfies { id: InboxSegment; label: string; count: number }[]).map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: segment === item.id }}
                accessibilityLabel={`${item.label}, ${item.count}`}
                onPress={() => onSegment(item.id)}
                style={[styles.segment, segment === item.id && styles.selectedSegment]}
              >
                <Text numberOfLines={1} style={[styles.segmentLabel, segment === item.id && styles.selectedLabel]}>{item.label}</Text>
                {item.count > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{item.count}</Text></View>}
              </Pressable>
            ))}
          </View>
          <ListGroup>
            {candidateRows.map((candidate) => (
              <ListRow
                key={candidate.id}
                title={candidate.suggestion.description.trim() || "Needs review"}
                detail={candidateDetail(candidate, currency, places)}
                value={formatMoney({
                  currency: candidate.currency,
                  minorUnits: candidate.suggestion.direction === "out"
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
                detail={item.status === "posting" ? "Retry posting" : "Draft on this device"}
                onPress={() => onResumeDraft(item.id)}
              />
            ))}
            {candidateRows.length === 0 && draftRows.length === 0 && (
              <View style={styles.emptyList}>
                <Text style={styles.body}>{segment === "now" ? "Nothing needs you now." : "Nothing waiting later."}</Text>
              </View>
            )}
          </ListGroup>
        </>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel="Preview Month Close warning" onPress={() => setScreen("month-close")} style={styles.footer}>
        <Text style={styles.linkText}>Preview Month Close warning</Text>
        <Ionicons name="arrow-forward" size={16} color={theme.primary} />
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headerCopy: { flex: 1 },
  sources: { minHeight: touchTarget, justifyContent: "center", paddingHorizontal: spacing.xs },
  hero: { gap: spacing.sm, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  kickerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  kicker: { color: theme.primary, fontSize: 14, fontFamily: font.bold },
  amount: { color: theme.foreground, fontSize: 38, lineHeight: 43, fontFamily: font.extrabold, letterSpacing: -0.8 },
  body: { maxWidth: 330, color: theme.mutedForeground, fontSize: 15, lineHeight: 22, fontFamily: font.regular },
  track: { flexDirection: "row", padding: 3, borderRadius: radius.full, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border },
  segment: { flex: 1, minHeight: touchTarget, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: radius.full, paddingHorizontal: spacing.sm },
  selectedSegment: { backgroundColor: theme.background, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  segmentLabel: { color: theme.mutedForeground, fontSize: 13, fontFamily: font.medium, flexShrink: 1 },
  selectedLabel: { color: theme.foreground, fontFamily: font.bold },
  badge: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: radius.full, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center" },
  badgeText: { color: theme.primaryForeground, fontSize: 11, fontFamily: font.bold },
  emptyList: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
  footer: { minHeight: touchTarget, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  linkText: { color: theme.primary, fontSize: 14, fontFamily: font.semibold },
});
