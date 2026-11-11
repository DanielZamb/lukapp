import type { Theme } from "../ui/tokens";
import { useReadableLayout } from "../ui/themeContext";
import type { ReadableLayout } from "../ui/layout";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { ConfirmationScreen, Header, ListGroup, ListRow, PrimaryButton, Screen, SecondaryButton, useTheme, useUi } from "../ui/core";
import { ConfirmSheet } from "../ui/ConfirmSheet";
import { formatDateTime, formatShortDate, useT, type MessageKey, type Translator } from "../i18n";
import { candidateErrorText } from "./posting/rejection";
import type { DiscardOutcome } from "./discardOutcome";
import { font, fontSize, radius, spacing, touchTarget } from "../ui/tokens";
import { formatMoney } from "./money";
import type { DraftListItem, LocalEntryDraftId } from "./localEntryDrafts";
import type { IntakeCandidate, IntakeCandidateId } from "./intake/candidates";
import { currencyMismatchReason, isReadyCandidate } from "./intake/ready";
import { MonthCloseWarning, ReconciliationWarning, WarningIconButton } from "./intake/InboxDetails";
import type { DiscardNotice } from "./localDiscardNotices";
import { unavailablePlaceReason, type PlaceStatus } from "./placeEnding/model";

type InboxPlace = { id: string; name: string; status?: PlaceStatus };

export type InboxSegment = "now" | "wait";
type InboxScreen = "inbox" | "warning" | "month-close" | "discard";
type DiscardTarget =
  | { kind: "candidate"; id: IntakeCandidateId; revision: number; title: string; value: string }
  | { kind: "draft"; id: LocalEntryDraftId; title: string };

const discardReasons: Record<DiscardNotice["reason"], MessageKey> = {
  "Missing amount or direction": "inbox.reasonMissing",
  "Security alert": "inbox.reasonSecurity",
  "Multiple amounts": "inbox.reasonMultiple",
  "Ambiguous amount": "inbox.reasonAmbiguous",
  "Queue full": "inbox.reasonQueueFull",
  "Conflicting capture": "inbox.reasonConflict",
};

function candidateDetail(
  t: Translator["t"],
  candidate: IntakeCandidate,
  workspaceCurrency: string,
  places: InboxPlace[],
) {
  const mismatch = currencyMismatchReason(t, candidate.currency, workspaceCurrency);
  if (mismatch) return mismatch;
  const place = places.find((item) => item.id === candidate.suggestion.financialAccountProfileId);
  const unavailable = place?.status ? unavailablePlaceReason({ name: place.name, status: place.status }, t) : null;
  if (unavailable) return unavailable;
  if (candidate.error) return candidateErrorText(t, candidate.error);
  if (candidate.reviewAmount?.reenter) return t("amount.noticeReenter", { previous: candidate.reviewAmount.text });
  if (candidate.reviewAmount?.review) return t("amount.reviewRequired");
  if (!isReadyCandidate(candidate, workspaceCurrency)) return t("inbox.needsReview");
  return places.find((place) => place.id === candidate.suggestion.financialAccountProfileId)?.name ?? t("inbox.savedPlace");
}

function InboxRow({ title, detail, value, accessibilityLabel, onPress, discardLabel, onDiscard, isLast }: {
  title: string;
  detail: string;
  value?: string;
  accessibilityLabel?: string;
  onPress: () => void;
  discardLabel?: string;
  onDiscard?: () => void;
  isLast?: boolean;
}) {
  const theme = useTheme();
  const layout = useReadableLayout();
  const styles = useMemo(() => createStyles(theme, layout), [theme, layout]);
  return (
    <View style={[styles.inboxRow, isLast && styles.lastCandidateRow]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={[styles.candidateRow, onDiscard && styles.discardableRow]}
      >
        <View style={styles.candidateContent}>
          <View style={styles.candidateCopy}>
            <Text style={styles.candidateTitle}>{title}</Text>
            <Text style={styles.candidateDetail}>{detail}</Text>
          </View>
          {value ? <Text style={styles.candidateValue}>{value}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.mutedForeground} />
      </Pressable>
      {onDiscard ? (
        <Pressable accessibilityRole="button" accessibilityLabel={discardLabel} onPress={onDiscard} style={styles.discard}>
          <Ionicons name="trash-outline" size={20} color={theme.mutedForeground} />
        </Pressable>
      ) : null}
    </View>
  );
}

function candidateValue(t: Translator["t"], candidate: IntakeCandidate) {
  return candidate.suggestion.amountMinorUnits === null ? t("inbox.amountNeeded") : formatMoney({
    currency: candidate.currency,
    minorUnits: Math.abs(candidate.suggestion.amountMinorUnits),
  });
}

export function DraftsScreen({
  drafts, now, wait, ready, readyTotal, currency, segment, readyToShow, error,
  confirming, month, places, confirmedCount, onContinueAfterConfirmation,
  onSegment, onBack, onResumeDraft, onOpenCandidate, onConfirmReady, onCompleteMonth,
  discardNotices = [], onDismissDiscardNotices, onSources, intakeWarning, otherNotifications = [],
  onDiscardCandidate, onDiscardDraft,
}: {
  /** Discards one open Candidate at the revision shown in its row. */
  onDiscardCandidate?: (id: IntakeCandidateId, revision: number) => Promise<DiscardOutcome>;
  /** Discards one open Draft. */
  onDiscardDraft?: (id: LocalEntryDraftId) => Promise<DiscardOutcome>;
  /** Recognized app notices and promotions; unknown notifications stay in review. */
  otherNotifications?: IntakeCandidate[];
  onSources: () => void;
  intakeWarning?: string;
  discardNotices?: DiscardNotice[];
  onDismissDiscardNotices?: () => Promise<void>;
  drafts: DraftListItem[];
  now: IntakeCandidate[];
  wait: IntakeCandidate[];
  ready: IntakeCandidate[];
  readyTotal: number;
  currency: string;
  segment: InboxSegment;
  readyToShow: boolean;
  error: string;
  confirming: boolean;
  month: string;
  places: InboxPlace[];
  confirmedCount: number | null;
  onContinueAfterConfirmation: () => void;
  onSegment: (segment: InboxSegment) => void;
  onBack: () => void;
  onResumeDraft: (id: LocalEntryDraftId) => void;
  onOpenCandidate: (id: IntakeCandidateId) => void;
  onConfirmReady: () => void;
  onCompleteMonth: () => void;
}) {
  const theme = useTheme();
  const ui = useUi();
  const layout = useReadableLayout();
  const styles = useMemo(() => createStyles(theme, layout), [theme, layout]);
  const [screen, setScreen] = useState<InboxScreen>("inbox");
  const [warningViewed, setWarningViewed] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [discardError, setDiscardError] = useState("");
  const [showOtherNotifications, setShowOtherNotifications] = useState(false);
  const { t, tn, language } = useT();
  const [discardTarget, setDiscardTarget] = useState<DiscardTarget | null>(null);
  const [discardBusy, setDiscardBusy] = useState(false);
  const [discardFailure, setDiscardFailure] = useState("");
  const [discardNotice, setDiscardNotice] = useState("");
  function askDiscard(target: DiscardTarget) {
    setDiscardNotice("");
    setDiscardFailure("");
    setDiscardTarget(target);
  }
  function closeDiscard() {
    if (discardBusy) return;
    setDiscardTarget(null);
    setDiscardFailure("");
  }
  async function confirmDiscard() {
    const target = discardTarget;
    if (!target || discardBusy) return;
    setDiscardBusy(true);
    setDiscardFailure("");
    try {
      const outcome = target.kind === "candidate"
        ? await onDiscardCandidate?.(target.id, target.revision)
        : await onDiscardDraft?.(target.id);
      setDiscardTarget(null);
      setDiscardNotice(outcome === "changed" ? t("drafts.candidateChanged")
        : outcome === "frozen" ? t(target.kind === "candidate" ? "drafts.candidateFrozen" : "drafts.draftFrozen") : "");
    } catch {
      setDiscardFailure(t("drafts.discardFailed"));
    } finally {
      setDiscardBusy(false);
    }
  }
  function discardCandidate(candidate: IntakeCandidate, title: string) {
    const status = candidate.status;
    if (!onDiscardCandidate || status?.kind !== "review") return undefined;
    return () => askDiscard({ kind: "candidate", id: candidate.id, revision: status.revision, title, value: candidateValue(t, candidate) });
  }
  const empty = drafts.length === 0 && now.length === 0 && wait.length === 0;
  const candidateRows = segment === "now" ? now : wait;
  const postingDrafts = drafts.filter((item) => item.status === "posting");
  const otherDrafts = drafts.filter((item) => item.status !== "posting");
  const draftRows = segment === "now" ? postingDrafts : otherDrafts;
  const backToInbox = () => setScreen("inbox");

  if (confirmedCount !== null) {
    return (
      <ConfirmationScreen
        title={tn("inbox.confirmed", confirmedCount)}
        detail={t("inbox.confirmedDetail")}
        buttonLabel={empty ? t("inbox.continueMonthClose") : t("inbox.backToCandidates")}
        onContinue={empty ? onCompleteMonth : onContinueAfterConfirmation}
      />
    );
  }
  if (screen === "warning") {
    return <ReconciliationWarning onBack={() => { setWarningViewed(true); backToInbox(); }} />;
  }
  if (screen === "month-close") {
    return <MonthCloseWarning month={month} count={now.length + wait.length} onBack={backToInbox} onContinue={onCompleteMonth} />;
  }
  if (screen === "discard") {
    return (
      <Screen>
        <Header title={t("inbox.discardedTitle")} eyebrow={t("inbox.discardedEyebrow")} onBack={backToInbox} />
        <Text style={styles.body}>{t("inbox.discardedBody")}</Text>
        <ListGroup>
          {discardNotices.map((notice, index) => (
            <ListRow
              key={`${notice.time}-${index}`}
              title={t(discardReasons[notice.reason])}
              detail={formatDateTime(language, notice.time)}
              isLast={index === discardNotices.length - 1}
            />
          ))}
        </ListGroup>
        {discardError ? <Text accessibilityRole="alert" style={ui.error}>{discardError}</Text> : null}
        <PrimaryButton label={t("inbox.discardedOk")} disabled={dismissing} pending={dismissing} onPress={() => {
          void (async () => {
            if (dismissing) return;
            setDismissing(true);
            setDiscardError("");
            try {
              await onDismissDiscardNotices?.();
              backToInbox();
            } catch {
              setDiscardError(t("inbox.discardedClearFailed"));
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
          <Header title={t("inbox.title")} eyebrow={t("inbox.eyebrow")} onBack={onBack} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t("inbox.sources")} onPress={onSources} style={styles.sources}>
          <Text style={styles.linkText}>{t("inbox.sources")}</Text>
        </Pressable>
      </View>
      {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}
      {discardNotice ? <Text accessibilityRole="alert" style={ui.error}>{discardNotice}</Text> : null}
      {intakeWarning ? <Text accessibilityRole="alert" style={ui.error}>{t("inbox.warningWithSources", { warning: intakeWarning })}</Text> : null}
      {!readyToShow ? (
        <ActivityIndicator accessibilityLabel={t("inbox.loadingA11y")} />
      ) : empty && !error ? (
        <>
          <View style={styles.hero}>
            <Text style={styles.kicker}>{t("inbox.emptyKicker")}</Text>
            <Text style={styles.amount}>{t("inbox.emptyTitle")}</Text>
            <Text style={styles.body}>{t("inbox.emptyBody")}</Text>
          </View>
          <PrimaryButton label={t("inbox.continueMonthClose")} onPress={() => setScreen("month-close")} />
        </>
      ) : (
        <>
          <View style={styles.hero}>
            <View style={styles.kickerRow}>
              <Text style={styles.kicker}>{tn("inbox.readyCount", ready.length)}</Text>
              {!warningViewed && <WarningIconButton onPress={() => setScreen("warning")} />}
            </View>
            <Text style={styles.amount}>{formatMoney({ currency, minorUnits: readyTotal })}</Text>
            <Text style={styles.body}>{t("inbox.heroBody")}</Text>
          </View>
          <PrimaryButton label={t("inbox.confirmAllReady")} disabled={ready.length === 0 || confirming} pending={confirming} onPress={onConfirmReady} />
        </>
      )}
      {readyToShow && !empty && (
        <>
          <View style={styles.track} accessibilityRole="radiogroup">
            {([
              { id: "now", label: t("inbox.segmentNow"), count: now.length + postingDrafts.length },
              { id: "wait", label: t("inbox.segmentWait"), count: wait.length + otherDrafts.length },
            ] satisfies { id: InboxSegment; label: string; count: number }[]).map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: segment === item.id, checked: segment === item.id }}
                accessibilityLabel={t("inbox.segmentA11y", { label: item.label, count: item.count })}
                onPress={() => onSegment(item.id)}
                style={[styles.segment, segment === item.id && styles.selectedSegment]}
              >
                <Text style={[styles.segmentLabel, segment === item.id && styles.selectedLabel]}>{item.label}</Text>
                {item.count > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{item.count}</Text></View>}
              </Pressable>
            ))}
          </View>
          <ListGroup>
            {candidateRows.map((candidate) => {
              const title = candidate.suggestion.description.trim() || candidate.notification?.text.trim() || t("inbox.needsReview");
              return (
                <InboxRow
                  key={candidate.id}
                  title={title}
                  accessibilityLabel={t("inbox.reviewA11y", { title })}
                  detail={candidateDetail(t, candidate, currency, places)}
                  value={candidateValue(t, candidate)}
                  onPress={() => onOpenCandidate(candidate.id)}
                  discardLabel={t("drafts.discardCandidateA11y", { title })}
                  onDiscard={discardCandidate(candidate, title)}
                />
              );
            })}
            {draftRows.map((item) => {
              const title = item.description.trim() || t("drafts.incompleteDraft");
              return (
                <InboxRow
                  key={item.id}
                  title={title}
                  detail={item.status === "posting" ? t("inbox.draftRetry") : t("inbox.draftOnDevice")}
                  onPress={() => onResumeDraft(item.id)}
                  discardLabel={t("drafts.discardDraftA11y", { title })}
                  onDiscard={item.status === "open" && onDiscardDraft
                    ? () => askDiscard({ kind: "draft", id: item.id, title }) : undefined}
                />
              );
            })}
            {candidateRows.length === 0 && draftRows.length === 0 && (
              <View style={styles.emptyList}>
                <Text style={styles.body}>{segment === "now" ? t("inbox.emptyNow") : t("inbox.emptyWait")}</Text>
              </View>
            )}
          </ListGroup>
        </>
      )}
      {readyToShow && otherNotifications.length > 0 ? (
        <View style={ui.section}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("inbox.otherA11y", { count: otherNotifications.length })} accessibilityState={{ expanded: showOtherNotifications }}
            accessibilityHint={t("inbox.otherHint")} onPress={() => setShowOtherNotifications((value) => !value)} style={styles.fold}>
            <View style={styles.candidateCopy}>
              <Text style={styles.candidateTitle}>{t("inbox.otherTitle", { count: otherNotifications.length })}</Text>
              <Text style={styles.candidateDetail}>{t("inbox.otherDetail")}</Text>
            </View>
            <Ionicons name={showOtherNotifications ? "chevron-up" : "chevron-down"} size={20} color={theme.mutedForeground} />
          </Pressable>
          {showOtherNotifications ? (
            <ListGroup>
              {otherNotifications.map((candidate) => {
                const lines = candidate.notification?.text.split("\n") ?? [];
                const body = (lines.length > 1 ? lines.slice(1) : lines).join(" ");
                const title = body || t("inbox.otherFallbackTitle");
                const date = formatShortDate(language, candidate.notification?.at ?? candidate.createdAt);
                return <InboxRow key={candidate.id} title={title} accessibilityLabel={t("inbox.reviewA11y", { title })}
                  detail={lines.length > 1 ? t("inbox.otherRowDetail", { title: lines[0]!, date }) : date}
                  onPress={() => onOpenCandidate(candidate.id)}
                  discardLabel={t("drafts.discardCandidateA11y", { title })} onDiscard={discardCandidate(candidate, title)} />;
              })}
            </ListGroup>
          ) : null}
        </View>
      ) : null}
      {readyToShow && discardNotices.length > 0 ? <SecondaryButton label={t("inbox.discardedButton")} onPress={() => setScreen("discard")} /> : null}
      {readyToShow && !empty ? (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel={t("inbox.previewMonthClose")} onPress={() => setScreen("month-close")} style={styles.footer}>
            <Text style={styles.linkText}>{t("inbox.previewMonthClose")}</Text>
            <Ionicons name="arrow-forward" size={16} color={theme.primary} />
          </Pressable>
        </>
      ) : null}
      {discardTarget ? (
        <ConfirmSheet
          label={t(discardTarget.kind === "candidate" ? "drafts.discardCandidateTitle" : "drafts.discardDraftTitle")}
          title={t(discardTarget.kind === "candidate" ? "drafts.discardCandidateTitle" : "drafts.discardDraftTitle")}
          detail={discardTarget.kind === "candidate" && discardTarget.value ? `${discardTarget.title} · ${discardTarget.value}` : discardTarget.title}
          body={t(discardTarget.kind === "candidate" ? "drafts.discardCandidateBody" : "drafts.discardDraftBody")}
          busy={discardBusy}
          error={discardFailure}
          actions={[
            { label: t("common.discard"), tone: "danger", onPress: () => void confirmDiscard() },
            { label: t("common.cancel"), onPress: closeDiscard },
          ]}
          onDismiss={closeDiscard}
        />
      ) : null}
    </Screen>
  );
}

function createStyles(theme: Theme, layout: ReadableLayout) {
  return StyleSheet.create({
  inboxRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  candidateRow: {
    flex: 1,
    minWidth: 0,
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  discardableRow: { paddingRight: spacing.xs },
  discard: { minWidth: touchTarget, minHeight: touchTarget, marginRight: spacing.sm, alignItems: "center", justifyContent: "center" },
  lastCandidateRow: { borderBottomWidth: 0 },
  fold: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  candidateContent: { flex: 1, minWidth: 0, flexDirection: layout.reflow ? "column" : "row", alignItems: layout.reflow ? "stretch" : "center", gap: spacing.sm },
  candidateCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  candidateTitle: { fontFamily: font.semibold, fontSize: fontSize.body, lineHeight: 22, color: theme.foreground },
  candidateDetail: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: theme.mutedForeground },
  candidateValue: { maxWidth: layout.reflow ? "100%" : "42%", fontFamily: font.semibold, fontSize: 14, lineHeight: 20, color: theme.foreground, textAlign: layout.reflow ? "left" : "right" },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headerCopy: { flex: 1, minWidth: 0 },
  sources: { minHeight: touchTarget, justifyContent: "center", paddingHorizontal: spacing.xs },
  hero: { gap: spacing.sm, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  kickerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  kicker: { color: theme.primary, fontSize: 14, fontFamily: font.bold },
  amount: { color: theme.foreground, fontSize: 38, lineHeight: 43, fontFamily: font.extrabold, letterSpacing: -0.8 },
  body: { maxWidth: 330, color: theme.mutedForeground, fontSize: 15, lineHeight: 22, fontFamily: font.regular },
  track: { flexDirection: layout.reflow ? "column" : "row", padding: 3, borderRadius: layout.reflow ? radius.lg : radius.full, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border },
  segment: { flex: 1, minHeight: touchTarget, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: radius.full, paddingHorizontal: spacing.sm },
  selectedSegment: { backgroundColor: theme.background, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  segmentLabel: { color: theme.mutedForeground, fontSize: 13, fontFamily: font.medium, flexShrink: 1, textAlign: "center" },
  selectedLabel: { color: theme.foreground, fontFamily: font.bold },
  badge: { minWidth: 20, minHeight: 20, paddingHorizontal: 5, borderRadius: radius.full, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center" },
  badgeText: { color: theme.primaryForeground, fontSize: 11, fontFamily: font.bold },
  emptyList: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
  footer: { minHeight: touchTarget, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  linkText: { color: theme.primary, fontSize: 14, fontFamily: font.semibold },
  });
}
