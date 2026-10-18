import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { ConfirmationScreen, Header, ListGroup, ListRow, PrimaryButton, Screen, SecondaryButton, theme, ui } from "../ui/core";
import { font, fontSize, radius, spacing, touchTarget } from "../ui/tokens";
import { formatMoney } from "./money";
import type { DraftListItem, LocalEntryDraftId } from "./localEntryDrafts";
import type { IntakeCandidate, IntakeCandidateId } from "./intake/candidates";
import { currencyMismatchReason, isReadyCandidate } from "./intake/ready";
import { IntakeSources, MonthCloseWarning, ReconciliationWarning, WarningIconButton } from "./intake/InboxDetails";
import type { DiscardNotice } from "./localDiscardNotices";

export type InboxSegment = "now" | "wait";
type InboxScreen = "inbox" | "warning" | "sources" | "month-close" | "discard";

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

function CandidateRow({ title, detail, value, onPress, isLast }: {
  title: string;
  detail: string;
  value: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Review ${title}`}
      onPress={onPress}
      style={[styles.candidateRow, isLast && styles.lastCandidateRow]}
    >
      <View style={styles.candidateCopy}>
        <Text style={styles.candidateTitle}>{title}</Text>
        <Text style={styles.candidateDetail}>{detail}</Text>
      </View>
      <Text style={styles.candidateValue}>{value}</Text>
      <Ionicons name="chevron-forward" size={20} color={theme.mutedForeground} />
    </Pressable>
  );
}

export function DraftsScreen({
  drafts, now, wait, ready, readyTotal, currency, segment, readyToShow, error,
  confirming, month, places, confirmedCount, onContinueAfterConfirmation,
  onSegment, onBack, onResumeDraft, onOpenCandidate, onConfirmReady, onCompleteMonth,
  discardNotices = [], onDismissDiscardNotices,
}: {
  discardNotices?: DiscardNotice[];
  onDismissDiscardNotices?: () => Promise<void>;
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
  const [dismissing, setDismissing] = useState(false);
  const [discardError, setDiscardError] = useState("");
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
  if (screen === "discard") {
    return (
      <Screen>
        <Header title="Discarded notifications" eyebrow="NOT SAVED AS CANDIDATES" onBack={backToInbox} />
        <Text style={styles.body}>These notices contain no notification text. They disappear after 15 days.</Text>
        <ListGroup>
          {discardNotices.map((notice, index) => (
            <ListRow
              key={`${notice.time}-${index}`}
              title={notice.reason}
              detail={new Date(notice.time).toLocaleString()}
              isLast={index === discardNotices.length - 1}
            />
          ))}
        </ListGroup>
        {discardError ? <Text accessibilityRole="alert" style={ui.error}>{discardError}</Text> : null}
        <PrimaryButton label="OK" disabled={dismissing} pending={dismissing} onPress={() => {
          void (async () => {
            if (dismissing) return;
            setDismissing(true);
            setDiscardError("");
            try {
              await onDismissDiscardNotices?.();
              backToInbox();
            } catch {
              setDiscardError("Could not remove discarded notification notices. Try again.");
            } finally {
              setDismissing(false);
            }
          })();
        }} />
      </Screen>
    );
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
      {readyToShow && !empty && (
        <>
          <View style={styles.track} accessibilityRole="radiogroup">
            {([
              { id: "now", label: "Needs you now", count: now.length + postingDrafts.length },
              { id: "wait", label: "Can wait", count: wait.length + otherDrafts.length },
            ] satisfies { id: InboxSegment; label: string; count: number }[]).map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: segment === item.id, checked: segment === item.id }}
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
              <CandidateRow
                key={candidate.id}
                title={candidate.suggestion.description.trim() || "Needs review"}
                detail={candidateDetail(candidate, currency, places)}
                value={formatMoney({
                  currency: candidate.currency,
                  minorUnits: Math.abs(candidate.suggestion.amountMinorUnits),
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
      {readyToShow && !empty ? (
        <>
          {discardNotices.length > 0 && (
            <SecondaryButton label="Notifications discarded" onPress={() => setScreen("discard")} />
          )}
          <Pressable accessibilityRole="button" accessibilityLabel="Preview Month Close warning" onPress={() => setScreen("month-close")} style={styles.footer}>
            <Text style={styles.linkText}>Preview Month Close warning</Text>
            <Ionicons name="arrow-forward" size={16} color={theme.primary} />
          </Pressable>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  candidateRow: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  lastCandidateRow: { borderBottomWidth: 0 },
  candidateCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  candidateTitle: { fontFamily: font.semibold, fontSize: fontSize.body, lineHeight: 22, color: theme.foreground },
  candidateDetail: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: theme.mutedForeground },
  candidateValue: { maxWidth: "42%", fontFamily: font.semibold, fontSize: 14, lineHeight: 20, color: theme.foreground, textAlign: "right" },
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
