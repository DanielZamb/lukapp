import type { Theme } from "../ui/tokens";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import {
  ActionBar, CenteredMoment, ConfirmationScreen, Group, Header, InlineNotice, ListGroup, ListRow, MoneyHero, Presentation,
  PrimaryButton, ReflowRow, Screen, SecondaryButton, Segmented, Text, ValueRow, moneyTone, useReflowStyles, useTheme, useTier,
} from "../ui/core";
import { ConfirmSheet } from "../ui/ConfirmSheet";
import { formatDateTime, formatShortDate, useT, type Language, type MessageKey, type Translator } from "../i18n";
import { candidateErrorText } from "./posting/rejection";
import type { DiscardOutcome } from "./discardOutcome";
import { radius, spacing, touchTarget } from "../ui/tokens";
import { formatAmount, formatMoney } from "./money";
import type { DraftListItem, LocalEntryDraftId } from "./localEntryDrafts";
import type { IntakeCandidate, IntakeCandidateId } from "./intake/candidates";
import { currencyMismatchReason, isReadyCandidate } from "./intake/ready";
import { MonthCloseWarning, ReconciliationWarning, WarningIconButton } from "./intake/InboxDetails";
import { AppTile, IconTile, StatusLine, TextButton, type Tone } from "./intake/IntakeParts";
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
/** One status fact for the Sources row, such as "Connected · reading 2 apps". */
export type SourcesStatus = { state?: { label: string; tone: Tone; icon: ComponentProps<typeof Ionicons>["name"] }; text?: string };

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
const candidateTitle = (t: Translator["t"], candidate: IntakeCandidate) =>
  candidate.suggestion.description.trim() || candidate.notification?.text.trim() || t("inbox.needsReview");
const statusText = (status: SourcesStatus) => [status.state?.label, status.text].filter(Boolean).join(" · ");
/** A kept notification's first line names its sender; the rest is the message. */
function noticeLines(language: Language, candidate: IntakeCandidate) {
  const lines = candidate.notification?.text.split("\n") ?? [];
  return { multi: lines.length > 1, head: lines.length > 1 ? lines[0] ?? "" : "", body: (lines.length > 1 ? lines.slice(1) : lines).join(" "),
    date: formatShortDate(language, candidate.notification?.at ?? candidate.createdAt) };
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
  const flow = useReflowStyles();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <View style={[styles.inboxRow, isLast && styles.lastCandidateRow]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={[styles.candidateRow, onDiscard && styles.discardableRow]}
      >
        <ReflowRow align="center" reflowAlign="stretch" gap={spacing.sm} style={styles.candidateContent}>
          <View style={styles.candidateCopy}>
            <Text preset="rowTitle" tone="default">{title}</Text>
            <Text preset="rowSubtitle" tone="muted">{detail}</Text>
          </View>
          {value ? <Text preset="money" tone="default" style={{ maxWidth: flow.trail("42%", "100%").maxWidth, textAlign: flow.text.textAlign }}>{value}</Text> : null}
        </ReflowRow>
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

/** XXXL candidate row (D4): label line with tile, money on its own line, one status fact. */
function LargeCandidateRow({ candidate, currency, places, onPress, isLast }: {
  candidate: IntakeCandidate; currency: string; places: InboxPlace[]; onPress: () => void; isLast?: boolean;
}) {
  const { t } = useT();
  const ready = isReadyCandidate(candidate, currency);
  const amount = candidate.suggestion.amountMinorUnits;
  const incoming = candidate.suggestion.direction === "in";
  const signed = amount === null ? null : incoming ? Math.abs(amount) : -Math.abs(amount);
  const title = candidateTitle(t, candidate);
  const value = signed === null ? t("inbox.amountNeeded") : formatMoney({ currency: candidate.currency, minorUnits: signed }, { hideZeroDecimals: true });
  const detail = candidateDetail(t, candidate, currency, places);
  const state = ready ? { label: t("inbox.ready"), tone: "positive", icon: "checkmark" } as const : { label: t("inbox.needsReview"), tone: "warning", icon: "alert-circle" } as const;
  const text = detail === t("inbox.needsReview") ? undefined : detail;
  return <ValueRow title={title} value={value} tone={signed === null ? "warning" : moneyTone(signed)} isLast={isLast} onPress={onPress}
    leading={<IconTile icon={!ready ? "alert-circle" : incoming ? "arrow-down" : "arrow-up"} tone={!ready ? "warning" : incoming ? "positive" : "neutral"} />}
    accessibilityLabel={`${t("inbox.reviewA11y", { title })}, ${value}, ${statusText({ state, text })}`}>
    <StatusLine state={state} text={text} />
  </ValueRow>;
}

function LargeDraftRow({ item, onPress, isLast }: { item: DraftListItem; onPress: () => void; isLast?: boolean }) {
  const { t } = useT();
  const posting = item.status === "posting";
  const title = item.description.trim() || t("drafts.incompleteDraft");
  const line = posting ? t("inbox.draftRetry") : t("inbox.draftOnDevice");
  return <ValueRow title={title} isLast={isLast} onPress={onPress} accessibilityLabel={`${title}, ${line}`}
    leading={<IconTile icon={posting ? "refresh-outline" : "document-text-outline"} tone={posting ? "warning" : "neutral"} />}>
    <StatusLine text={line} />
  </ValueRow>;
}

function LargeNoticeRow({ candidate, onPress, isLast }: { candidate: IntakeCandidate; onPress: () => void; isLast?: boolean }) {
  const { t, language } = useT();
  const { head, body, date } = noticeLines(language, candidate);
  const title = head || body || t("inbox.otherFallbackTitle");
  const meta = head ? body : undefined;
  return <ValueRow title={title} meta={meta} isLast={isLast} onPress={onPress} accessibilityLabel={[title, meta, date].filter(Boolean).join(", ")}
    leading={candidate.notification ? <AppTile packageName={candidate.notification.packageName} label={head || candidate.notification.packageName} />
      : <IconTile icon="notifications-outline" tone="neutral" />}>
    <StatusLine text={date} />
  </ValueRow>;
}

export function DraftsScreen({
  drafts, now, wait, ready, readyTotal, currency, segment, readyToShow, error,
  confirming, month, places, confirmedCount, onContinueAfterConfirmation,
  onSegment, onBack, onResumeDraft, onOpenCandidate, onConfirmReady, onCompleteMonth,
  discardNotices = [], onDismissDiscardNotices, onSources, intakeWarning, otherNotifications = [], sourcesStatus,
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
  /** The intake state shown on the Sources row at XXXL. */
  sourcesStatus?: SourcesStatus;
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
  const styles = useMemo(() => createStyles(theme), [theme]);
  const stacked = useTier() !== "default";
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
  const counts = { now: now.length + postingDrafts.length, wait: wait.length + otherDrafts.length };
  const dismissDiscarded = () => {
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
  };

  if (confirmedCount !== null) {
    const title = tn("inbox.confirmed", confirmedCount);
    const label = empty ? t("inbox.continueMonthClose") : t("inbox.backToCandidates");
    const onContinue = empty ? onCompleteMonth : onContinueAfterConfirmation;
    return (
      <Presentation legacy={<ConfirmationScreen
        title={title}
        detail={t("inbox.confirmedDetail")}
        buttonLabel={label}
        onContinue={onContinue}
      />}>
        <Screen footer={<ActionBar primary={{ label, icon: "arrow-forward", onPress: onContinue }} />}>
          <CenteredMoment icon="checkmark" tone="positive" title={title} body={t("inbox.confirmedDetail")} />
        </Screen>
      </Presentation>
    );
  }
  if (screen === "warning") {
    return <ReconciliationWarning onBack={() => { setWarningViewed(true); backToInbox(); }} />;
  }
  if (screen === "month-close") {
    return <MonthCloseWarning month={month} count={now.length + wait.length} onBack={backToInbox} onContinue={onCompleteMonth} />;
  }
  if (screen === "discard") {
    const when = (time: number) => formatDateTime(language, time);
    return (
      <Presentation legacy={<Screen>
        <Header title={t("inbox.discardedTitle")} eyebrow={t("inbox.discardedEyebrow")} onBack={backToInbox} />
        <Text preset="draftBody" tone="muted" style={styles.body}>{t("inbox.discardedBody")}</Text>
        <ListGroup>
          {discardNotices.map((notice, index) => (
            <ListRow
              key={`${notice.time}-${index}`}
              title={t(discardReasons[notice.reason])}
              detail={when(notice.time)}
              isLast={index === discardNotices.length - 1}
            />
          ))}
        </ListGroup>
        {discardError ? <Text accessibilityRole="alert" preset="caption" tone="danger">{discardError}</Text> : null}
        <PrimaryButton label={t("inbox.discardedOk")} disabled={dismissing} pending={dismissing} onPress={dismissDiscarded} />
      </Screen>}>
        <Screen footer={<ActionBar primary={{ label: t("inbox.discardedClear"), icon: "checkmark", disabled: dismissing, pending: dismissing, onPress: dismissDiscarded }} />}>
          <Header title={t("inbox.discardedTitle")} eyebrow={t("inbox.discardedEyebrow")} onBack={backToInbox} />
          <Text variant="body" tone="muted">{t("inbox.discardedBody")}</Text>
          <Group>
            {discardNotices.map((notice, index) => <ValueRow key={`${notice.time}-${index}`} title={t(discardReasons[notice.reason])}
              accessibilityLabel={`${t(discardReasons[notice.reason])}, ${when(notice.time)}`} leading={<IconTile icon="eye-off-outline" tone="neutral" />}>
              <StatusLine text={when(notice.time)} />
            </ValueRow>)}
          </Group>
          {discardError ? <InlineNotice tone="danger" title={discardError} /> : null}
        </Screen>
      </Presentation>
    );
  }

  const discardSheet = discardTarget ? (
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
  ) : null;

  const legacy = (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Header title={t("inbox.title")} eyebrow={t("inbox.eyebrow")} onBack={onBack} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t("inbox.sources")} onPress={onSources} style={styles.sources}>
          <Text preset="fieldLabel" style={styles.link}>{t("inbox.sources")}</Text>
        </Pressable>
      </View>
      {error ? <Text accessibilityRole="alert" preset="caption" tone="danger">{error}</Text> : null}
      {discardNotice ? <Text accessibilityRole="alert" preset="caption" tone="danger">{discardNotice}</Text> : null}
      {intakeWarning ? <Text accessibilityRole="alert" preset="caption" tone="danger">{t("inbox.warningWithSources", { warning: intakeWarning })}</Text> : null}
      {!readyToShow ? (
        <ActivityIndicator accessibilityLabel={t("inbox.loadingA11y")} />
      ) : empty && !error ? (
        <>
          <View style={styles.hero}>
            <Text preset="filterSort" style={styles.kicker}>{t("inbox.emptyKicker")}</Text>
            <Text preset="draftAmount" tone="default">{t("inbox.emptyTitle")}</Text>
            <Text preset="draftBody" tone="muted" style={styles.body}>{t("inbox.emptyBody")}</Text>
          </View>
          <PrimaryButton label={t("inbox.continueMonthClose")} onPress={() => setScreen("month-close")} />
        </>
      ) : (
        <>
          <View style={styles.hero}>
            <View style={styles.kickerRow}>
              <Text preset="filterSort" style={styles.kicker}>{tn("inbox.readyCount", ready.length)}</Text>
              {!warningViewed && <WarningIconButton onPress={() => setScreen("warning")} />}
            </View>
            <Text preset="draftAmount" tone="default">{formatMoney({ currency, minorUnits: readyTotal })}</Text>
            <Text preset="draftBody" tone="muted" style={styles.body}>{t("inbox.heroBody")}</Text>
          </View>
          <PrimaryButton label={t("inbox.confirmAllReady")} disabled={ready.length === 0 || confirming} pending={confirming} onPress={onConfirmReady} />
        </>
      )}
      {readyToShow && !empty && (
        <>
          <View style={[styles.track, stacked && styles.trackStacked]} accessibilityRole="radiogroup">
            {([
              { id: "now", label: t("inbox.segmentNow"), count: counts.now },
              { id: "wait", label: t("inbox.segmentWait"), count: counts.wait },
            ] satisfies { id: InboxSegment; label: string; count: number }[]).map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: segment === item.id, checked: segment === item.id }}
                accessibilityLabel={t("inbox.segmentA11y", { label: item.label, count: item.count })}
                onPress={() => onSegment(item.id)}
                style={[styles.segment, segment === item.id && styles.selectedSegment]}
              >
                <Text preset={segment === item.id ? "composeSelected" : "composeLabel"}
                  tone={segment === item.id ? "default" : "muted"} style={styles.segmentLabel}>{item.label}</Text>
                {item.count > 0 && <View style={styles.badge}><Text preset="badge" style={styles.badgeText}>{item.count}</Text></View>}
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
                <Text preset="draftBody" tone="muted" style={styles.body}>{segment === "now" ? t("inbox.emptyNow") : t("inbox.emptyWait")}</Text>
              </View>
            )}
          </ListGroup>
        </>
      )}
      {readyToShow && otherNotifications.length > 0 ? (
        <View style={styles.section}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("inbox.otherA11y", { count: otherNotifications.length })} accessibilityState={{ expanded: showOtherNotifications }}
            accessibilityHint={t("inbox.otherHint")} onPress={() => setShowOtherNotifications((value) => !value)} style={styles.fold}>
            <View style={styles.candidateCopy}>
              <Text preset="rowTitle" tone="default">{t("inbox.otherTitle", { count: otherNotifications.length })}</Text>
              <Text preset="rowSubtitle" tone="muted">{t("inbox.otherDetail")}</Text>
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
            <Text preset="fieldLabel" style={styles.link}>{t("inbox.previewMonthClose")}</Text>
            <Ionicons name="arrow-forward" size={16} color={theme.primary} />
          </Pressable>
        </>
      ) : null}
      {discardTarget ? discardSheet : null}
    </Screen>
  );

  // XXXL (D4 Candidates): hero total, a quiet warning link, Now and Later tabs,
  // paired rows, the Sources row, and Confirm pinned in the footer.
  const sourcesLine = sourcesStatus ?? { text: t("inbox.sourcesFallback") };
  const footer: ReactNode = !readyToShow || (empty && error) ? null
    : empty ? <ActionBar primary={{ label: t("inbox.continueMonthClose"), icon: "arrow-forward", onPress: () => setScreen("month-close") }} />
    : <ActionBar primary={{ label: ready.length ? t("inbox.confirmReadyCount", { count: ready.length }) : t("inbox.nothingReady"), icon: "checkmark",
      disabled: ready.length === 0 || confirming, pending: confirming, onPress: onConfirmReady }} />;
  const large = (
    <Screen footer={footer}>
      <Header title={t("inbox.title")} eyebrow={t("inbox.eyebrow")} onBack={onBack} />
      {error ? <InlineNotice tone="danger" title={error} /> : null}
      {discardNotice ? <InlineNotice tone="danger" title={discardNotice} /> : null}
      {intakeWarning ? <InlineNotice tone="warning" title={intakeWarning} detail={t("inbox.warningOpenIntake")} /> : null}
      {!readyToShow ? <ActivityIndicator accessibilityLabel={t("inbox.loadingA11y")} />
        : empty && !error ? <View style={styles.largeHero}>
          <View style={styles.state}>
            <Ionicons name="checkmark-circle" size={24} color={theme.positive} />
            <Text variant="rowTitle" tone="positive">{t("inbox.reviewComplete")}</Text>
          </View>
          <Text variant="screen">{t("inbox.emptyTitle")}</Text>
          <Text variant="body" tone="muted">{t("inbox.readyToClose", { month })}</Text>
        </View>
        : empty ? null
        : <>
          <View style={styles.largeHero}>
            <Text variant="label" tone="muted">{tn("inbox.readyCount", ready.length)}</Text>
            <MoneyHero currency={currency} amount={formatAmount(Math.abs(readyTotal), currency, { hideZeroDecimals: true })} />
            <Text variant="status" tone="muted">{t("inbox.fromNotifications")}</Text>
          </View>
          {!warningViewed ? <Pressable accessibilityRole="button" accessibilityLabel={t("inbox.shortcutA11y")}
            onPress={() => setScreen("warning")} style={styles.warnLink}>
            <Ionicons name="warning-outline" size={24} color={theme.warning} />
            <Text variant="rowTitle" style={{ flex: 1 }}>{t("inbox.shortcutTitle")}</Text>
            <Ionicons name="chevron-forward" size={20} color={theme.mutedForeground} />
          </Pressable> : null}
          <Segmented value={segment} onChange={onSegment} options={[
            { value: "now", label: t("inbox.tabNow"), badge: counts.now || undefined },
            { value: "wait", label: t("inbox.tabLater"), badge: counts.wait || undefined },
          ]} />
          <View style={styles.section}>
            <Text variant="section" accessibilityRole="header">{segment === "now" ? t("inbox.segmentNow") : t("inbox.segmentWait")}</Text>
            {candidateRows.length || draftRows.length ? <Group>
              {candidateRows.map((candidate) => <LargeCandidateRow key={candidate.id} candidate={candidate} currency={currency} places={places}
                onPress={() => onOpenCandidate(candidate.id)} />)}
              {draftRows.map((item) => <LargeDraftRow key={item.id} item={item} onPress={() => onResumeDraft(item.id)} />)}
            </Group> : <Text variant="body" tone="muted">{segment === "now" ? t("inbox.emptyNow") : t("inbox.emptyWait")}</Text>}
          </View>
        </>}
      {readyToShow && otherNotifications.length > 0 ? <View style={styles.section}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("inbox.otherA11y", { count: otherNotifications.length })} accessibilityState={{ expanded: showOtherNotifications }}
          accessibilityHint={t("inbox.otherHint")} onPress={() => setShowOtherNotifications((value) => !value)} style={styles.largeFold}>
          <View style={styles.candidateCopy}>
            <Text variant="section">{t("inbox.otherTitle", { count: otherNotifications.length })}</Text>
            <Text variant="meta" tone="muted">{t("inbox.otherDetail")}</Text>
          </View>
          <Ionicons name={showOtherNotifications ? "chevron-up" : "chevron-down"} size={24} color={theme.mutedForeground} />
        </Pressable>
        {showOtherNotifications ? <Group>
          {otherNotifications.map((candidate) => <LargeNoticeRow key={candidate.id} candidate={candidate} onPress={() => onOpenCandidate(candidate.id)} />)}
        </Group> : null}
      </View> : null}
      {readyToShow ? <Group>
        <ValueRow title={t("inbox.intakeRow")} onPress={onSources} accessibilityLabel={`${t("inbox.intakeRow")}, ${statusText(sourcesLine)}`}
          leading={<IconTile icon="pulse-outline" tone="neutral" />}>
          <StatusLine state={sourcesLine.state} text={sourcesLine.text} />
        </ValueRow>
        {discardNotices.length ? <ValueRow title={t("inbox.discardedRow")} onPress={() => setScreen("discard")}
          accessibilityLabel={`${t("inbox.discardedRow")}, ${tn("inbox.discardedRowCount", discardNotices.length)}`}
          leading={<IconTile icon="eye-off-outline" tone="neutral" />}>
          <StatusLine text={tn("inbox.discardedRowCount", discardNotices.length)} />
        </ValueRow> : null}
      </Group> : null}
      {discardTarget ? discardSheet : null}
      {readyToShow && !empty ? <TextButton label={t("inbox.previewMonthCloseShort")} onPress={() => setScreen("month-close")} /> : null}
    </Screen>
  );
  return <Presentation legacy={legacy}>{large}</Presentation>;
}

function createStyles(theme: Theme) {
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
  candidateContent: { flex: 1, minWidth: 0 },
  candidateCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headerCopy: { flex: 1, minWidth: 0 },
  sources: { minHeight: touchTarget, justifyContent: "center", paddingHorizontal: spacing.xs },
  hero: { gap: spacing.sm, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  kickerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  kicker: { color: theme.primary },
  body: { maxWidth: 330 },
  section: { gap: spacing.md },
  track: { flexDirection: "row", padding: 3, borderRadius: radius.full, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border },
  trackStacked: { flexDirection: "column", borderRadius: radius.lg },
  segment: { flex: 1, minHeight: touchTarget, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: radius.full, paddingHorizontal: spacing.sm },
  selectedSegment: { backgroundColor: theme.background, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  segmentLabel: { flexShrink: 1, textAlign: "center" },
  badge: { minWidth: 20, minHeight: 20, paddingHorizontal: 5, borderRadius: radius.full, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center" },
  badgeText: { color: theme.primaryForeground },
  emptyList: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
  footer: { minHeight: touchTarget, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  link: { color: theme.primary },
  // XXXL (D4): hero block, amber warning link, fold row.
  largeHero: { gap: 8, paddingTop: 4 },
  state: { flexDirection: "row", alignItems: "center", gap: 8 },
  warnLink: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 10 },
  largeFold: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12 },
  });
}
