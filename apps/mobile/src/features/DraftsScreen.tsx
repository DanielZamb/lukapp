import type { Theme } from "../ui/tokens";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import {
  ActionBar, CenteredMoment, ConfirmationScreen, Group, Header, InlineNotice, ListGroup, ListRow, MoneyHero, Presentation,
  PrimaryButton, ReflowRow, Screen, SecondaryButton, Segmented, Text, ValueRow, moneyTone, useReflowStyles, useTheme,
} from "../ui/core";
import { radius, spacing, touchTarget } from "../ui/tokens";
import { formatAmount, formatMoney } from "./money";
import type { DraftListItem, LocalEntryDraftId } from "./localEntryDrafts";
import type { IntakeCandidate, IntakeCandidateId } from "./intake/candidates";
import { currencyMismatchReason, isReadyCandidate } from "./intake/ready";
import { MonthCloseWarning, ReconciliationWarning, WarningIconButton } from "./intake/InboxDetails";
import { AppTile, IconTile, StatusLine, TextButton, type Tone } from "./intake/IntakeParts";
import type { DiscardNotice } from "./localDiscardNotices";

export type InboxSegment = "now" | "wait";
type InboxScreen = "inbox" | "warning" | "month-close" | "discard";
/** One status fact for the Sources row, such as "Connected · reading 2 apps". */
export type SourcesStatus = { state?: { label: string; tone: Tone; icon: ComponentProps<typeof Ionicons>["name"] }; text?: string };

function candidateDetail(
  candidate: IntakeCandidate,
  workspaceCurrency: string,
  places: { id: string; name: string }[],
) {
  const mismatch = currencyMismatchReason(candidate.currency, workspaceCurrency);
  if (mismatch) return mismatch;
  if (candidate.error) return candidate.error;
  if (!isReadyCandidate(candidate, workspaceCurrency)) return "Needs review";
  return places.find((place) => place.id === candidate.suggestion.financialAccountProfileId)?.name ?? "Saved place";
}
const candidateTitle = (candidate: IntakeCandidate) =>
  candidate.suggestion.description.trim() || candidate.notification?.text.trim() || "Needs review";
const statusText = (status: SourcesStatus) => [status.state?.label, status.text].filter(Boolean).join(" · ");
/** A kept notification's first line names its sender; the rest is the message. */
function noticeLines(candidate: IntakeCandidate) {
  const lines = candidate.notification?.text.split("\n") ?? [];
  return { multi: lines.length > 1, head: lines.length > 1 ? lines[0] ?? "" : "", body: (lines.length > 1 ? lines.slice(1) : lines).join(" "),
    date: new Date(candidate.notification?.at ?? candidate.createdAt).toLocaleDateString() };
}

function CandidateRow({ title, detail, value, onPress, isLast }: {
  title: string;
  detail: string;
  value: string;
  onPress: () => void;
  isLast?: boolean;
}) {
  const theme = useTheme();
  const flow = useReflowStyles();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Review ${title}`}
      onPress={onPress}
      style={[styles.candidateRow, isLast && styles.lastCandidateRow]}
    >
      <ReflowRow align="center" reflowAlign="stretch" gap={spacing.sm} style={styles.candidateContent}>
        <View style={styles.candidateCopy}>
          <Text preset="rowTitle" tone="default">{title}</Text>
          <Text preset="rowSubtitle" tone="muted">{detail}</Text>
        </View>
        <Text preset="money" tone="default" style={{ maxWidth: flow.trail("42%", "100%").maxWidth, textAlign: flow.text.textAlign }}>{value}</Text>
      </ReflowRow>
      <Ionicons name="chevron-forward" size={20} color={theme.mutedForeground} />
    </Pressable>
  );
}

/** XXXL candidate row (D4): label line with tile, money on its own line, one status fact. */
function LargeCandidateRow({ candidate, currency, places, onPress, isLast }: {
  candidate: IntakeCandidate; currency: string; places: { id: string; name: string }[]; onPress: () => void; isLast?: boolean;
}) {
  const ready = isReadyCandidate(candidate, currency);
  const amount = candidate.suggestion.amountMinorUnits;
  const incoming = candidate.suggestion.direction === "in";
  const signed = amount === null ? null : incoming ? Math.abs(amount) : -Math.abs(amount);
  const title = candidateTitle(candidate);
  const value = signed === null ? "Amount needed" : formatMoney({ currency: candidate.currency, minorUnits: signed }, { hideZeroDecimals: true });
  const detail = candidateDetail(candidate, currency, places);
  const state = ready ? { label: "Ready", tone: "positive", icon: "checkmark" } as const : { label: "Needs review", tone: "warning", icon: "alert-circle" } as const;
  const text = detail === "Needs review" ? undefined : detail;
  return <ValueRow title={title} value={value} tone={signed === null ? "warning" : moneyTone(signed)} isLast={isLast} onPress={onPress}
    leading={<IconTile icon={!ready ? "alert-circle" : incoming ? "arrow-down" : "arrow-up"} tone={!ready ? "warning" : incoming ? "positive" : "neutral"} />}
    accessibilityLabel={`Review ${title}, ${value}, ${statusText({ state, text })}`}>
    <StatusLine state={state} text={text} />
  </ValueRow>;
}

function LargeDraftRow({ item, onPress, isLast }: { item: DraftListItem; onPress: () => void; isLast?: boolean }) {
  const posting = item.status === "posting";
  const title = item.description.trim() || "Incomplete draft";
  const line = posting ? "Retry posting" : "Draft on this device";
  return <ValueRow title={title} isLast={isLast} onPress={onPress} accessibilityLabel={`${title}, ${line}`}
    leading={<IconTile icon={posting ? "refresh-outline" : "document-text-outline"} tone={posting ? "warning" : "neutral"} />}>
    <StatusLine text={line} />
  </ValueRow>;
}

function LargeNoticeRow({ candidate, onPress, isLast }: { candidate: IntakeCandidate; onPress: () => void; isLast?: boolean }) {
  const { head, body, date } = noticeLines(candidate);
  const title = head || body || "Notification";
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
}: {
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
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [screen, setScreen] = useState<InboxScreen>("inbox");
  const [warningViewed, setWarningViewed] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [discardError, setDiscardError] = useState("");
  const [showOtherNotifications, setShowOtherNotifications] = useState(false);
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
        setDiscardError("Could not remove discarded notification notices. Try again.");
      } finally {
        setDismissing(false);
      }
    })();
  };

  if (confirmedCount !== null) {
    const title = confirmedCount === 1 ? "Record added" : `${confirmedCount} records added`;
    const label = empty ? "Continue to Month Close" : "Back to Candidates";
    const onContinue = empty ? onCompleteMonth : onContinueAfterConfirmation;
    return (
      <Presentation legacy={<ConfirmationScreen
        title={title}
        detail="The server validated and posted each record. Local notification content was deleted after acknowledgement."
        buttonLabel={label}
        onContinue={onContinue}
      />}>
        <Screen footer={<ActionBar primary={{ label, icon: "arrow-forward", onPress: onContinue }} />}>
          <CenteredMoment icon="checkmark" tone="positive" title={title}
            body="Each one was checked and posted. The notification text was deleted from this phone." />
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
    const when = (time: number) => new Date(time).toLocaleString();
    return (
      <Presentation legacy={<Screen>
        <Header title="Discarded notifications" eyebrow="NOT SAVED AS CANDIDATES" onBack={backToInbox} />
        <Text preset="draftBody" tone="muted" style={styles.body}>These notices contain no notification text. They disappear after 15 days.</Text>
        <ListGroup>
          {discardNotices.map((notice, index) => (
            <ListRow
              key={`${notice.time}-${index}`}
              title={notice.reason}
              detail={when(notice.time)}
              isLast={index === discardNotices.length - 1}
            />
          ))}
        </ListGroup>
        {discardError ? <Text accessibilityRole="alert" preset="caption" tone="danger">{discardError}</Text> : null}
        <PrimaryButton label="OK" disabled={dismissing} pending={dismissing} onPress={dismissDiscarded} />
      </Screen>}>
        <Screen footer={<ActionBar primary={{ label: "OK, clear them", icon: "checkmark", disabled: dismissing, pending: dismissing, onPress: dismissDiscarded }} />}>
          <Header title="Discarded" eyebrow="NOT SAVED AS CANDIDATES" onBack={backToInbox} />
          <Text variant="body" tone="muted">No text is kept. These go away after 15 days.</Text>
          <Group>
            {discardNotices.map((notice, index) => <ValueRow key={`${notice.time}-${index}`} title={notice.reason}
              accessibilityLabel={`${notice.reason}, ${when(notice.time)}`} leading={<IconTile icon="eye-off-outline" tone="neutral" />}>
              <StatusLine text={when(notice.time)} />
            </ValueRow>)}
          </Group>
          {discardError ? <InlineNotice tone="danger" title={discardError} /> : null}
        </Screen>
      </Presentation>
    );
  }

  const legacy = (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Header title="Candidates" eyebrow="NOTIFICATION INTAKE" onBack={onBack} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Sources" onPress={onSources} style={styles.sources}>
          <Text preset="fieldLabel" style={styles.link}>Sources</Text>
        </Pressable>
      </View>
      {error ? <Text accessibilityRole="alert" preset="caption" tone="danger">{error}</Text> : null}
      {intakeWarning ? <Text accessibilityRole="alert" preset="caption" tone="danger">{intakeWarning} Open Sources for observed details and capture notices.</Text> : null}
      {!readyToShow ? (
        <ActivityIndicator accessibilityLabel="Loading Candidates and drafts" />
      ) : empty && !error ? (
        <>
          <View style={styles.hero}>
            <Text preset="filterSort" style={styles.kicker}>Candidate inbox</Text>
            <Text preset="draftAmount" tone="default">Nothing waiting</Text>
            <Text preset="draftBody" tone="muted" style={styles.body}>
              Notifications from enabled sources become Candidates here for review. No Candidates are waiting; this does not confirm capture. Remaining local Candidates never block Month Close.
            </Text>
          </View>
          <PrimaryButton label="Continue to Month Close" onPress={() => setScreen("month-close")} />
        </>
      ) : (
        <>
          <View style={styles.hero}>
            <View style={styles.kickerRow}>
              <Text preset="filterSort" style={styles.kicker}>{ready.length} ready to add</Text>
              {!warningViewed && <WarningIconButton onPress={() => setScreen("warning")} />}
            </View>
            <Text preset="draftAmount" tone="default">{formatMoney({ currency, minorUnits: readyTotal })}</Text>
            <Text preset="draftBody" tone="muted" style={styles.body}>Review what needs you now, or confirm every Ready Candidate.</Text>
          </View>
          <PrimaryButton label="Confirm all Ready" disabled={ready.length === 0 || confirming} pending={confirming} onPress={onConfirmReady} />
        </>
      )}
      {readyToShow && !empty && (
        <>
          <View style={styles.track} accessibilityRole="radiogroup">
            {([
              { id: "now", label: "Needs you now", count: counts.now },
              { id: "wait", label: "Can wait", count: counts.wait },
            ] satisfies { id: InboxSegment; label: string; count: number }[]).map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: segment === item.id, checked: segment === item.id }}
                accessibilityLabel={`${item.label}, ${item.count}`}
                onPress={() => onSegment(item.id)}
                style={[styles.segment, segment === item.id && styles.selectedSegment]}
              >
                <Text numberOfLines={1} preset={segment === item.id ? "composeSelected" : "composeLabel"}
                  tone={segment === item.id ? "default" : "muted"} style={styles.segmentLabel}>{item.label}</Text>
                {item.count > 0 && <View style={styles.badge}><Text preset="badge" style={styles.badgeText}>{item.count}</Text></View>}
              </Pressable>
            ))}
          </View>
          <ListGroup>
            {candidateRows.map((candidate) => (
              <CandidateRow
                key={candidate.id}
                title={candidateTitle(candidate)}
                detail={candidateDetail(candidate, currency, places)}
                value={candidate.suggestion.amountMinorUnits === null ? "Amount needed" : formatMoney({
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
                <Text preset="draftBody" tone="muted" style={styles.body}>{segment === "now" ? "Nothing needs you now." : "Nothing waiting later."}</Text>
              </View>
            )}
          </ListGroup>
        </>
      )}
      {readyToShow && otherNotifications.length > 0 ? (
        <View style={styles.section}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Other notifications, ${otherNotifications.length}`} accessibilityState={{ expanded: showOtherNotifications }}
            accessibilityHint="App notices and promotions. Open any notification to review it." onPress={() => setShowOtherNotifications((value) => !value)} style={styles.fold}>
            <View style={styles.candidateCopy}>
              <Text preset="rowTitle" tone="default">Other notifications · {otherNotifications.length}</Text>
              <Text preset="rowSubtitle" tone="muted">App notices and promotions. Open any item to review it.</Text>
            </View>
            <Ionicons name={showOtherNotifications ? "chevron-up" : "chevron-down"} size={20} color={theme.mutedForeground} />
          </Pressable>
          {showOtherNotifications ? (
            <ListGroup>
              {otherNotifications.map((candidate) => {
                const { multi, head, body, date } = noticeLines(candidate);
                return <CandidateRow key={candidate.id} title={body || "Notification"} value=""
                  detail={`${multi ? `${head} · ` : ""}${date}`}
                  onPress={() => onOpenCandidate(candidate.id)} />;
              })}
            </ListGroup>
          ) : null}
        </View>
      ) : null}
      {readyToShow && discardNotices.length > 0 ? <SecondaryButton label="Notifications discarded" onPress={() => setScreen("discard")} /> : null}
      {readyToShow && !empty ? (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel="Preview Month Close warning" onPress={() => setScreen("month-close")} style={styles.footer}>
            <Text preset="fieldLabel" style={styles.link}>Preview Month Close warning</Text>
            <Ionicons name="arrow-forward" size={16} color={theme.primary} />
          </Pressable>
        </>
      ) : null}
    </Screen>
  );

  // XXXL (D4 Candidates): hero total, a quiet warning link, Now and Later tabs,
  // paired rows, the Sources row, and Confirm pinned in the footer.
  const sourcesLine = sourcesStatus ?? { text: "Apps and access on this phone" };
  const footer: ReactNode = !readyToShow || (empty && error) ? null
    : empty ? <ActionBar primary={{ label: "Continue to Month Close", icon: "arrow-forward", onPress: () => setScreen("month-close") }} />
    : <ActionBar primary={{ label: ready.length ? `Confirm ${ready.length} ready` : "Nothing ready yet", icon: "checkmark",
      disabled: ready.length === 0 || confirming, pending: confirming, onPress: onConfirmReady }} />;
  const large = (
    <Screen footer={footer}>
      <Header title="Candidates" eyebrow="NOTIFICATION INTAKE" onBack={onBack} />
      {error ? <InlineNotice tone="danger" title={error} /> : null}
      {intakeWarning ? <InlineNotice tone="warning" title={intakeWarning} detail="Open Notification intake below for details and capture notices." /> : null}
      {!readyToShow ? <ActivityIndicator accessibilityLabel="Loading Candidates and drafts" />
        : empty && !error ? <View style={styles.largeHero}>
          <View style={styles.state}>
            <Ionicons name="checkmark-circle" size={24} color={theme.positive} />
            <Text variant="rowTitle" tone="positive">Review complete</Text>
          </View>
          <Text variant="screen">Nothing waiting</Text>
          <Text variant="body" tone="muted">{`${month} is ready to close. Candidates never block Month Close.`}</Text>
        </View>
        : empty ? null
        : <>
          <View style={styles.largeHero}>
            <Text variant="label" tone="muted">{`${ready.length} ready to add`}</Text>
            <MoneyHero currency={currency} amount={formatAmount(Math.abs(readyTotal), currency, { hideZeroDecimals: true })} />
            <Text variant="status" tone="muted">From notifications on this phone</Text>
          </View>
          {!warningViewed ? <Pressable accessibilityRole="button" accessibilityLabel="Read before using intake: a shortcut, not a statement"
            onPress={() => setScreen("warning")} style={styles.warnLink}>
            <Ionicons name="warning-outline" size={24} color={theme.warning} />
            <Text variant="rowTitle" style={{ flex: 1 }}>A shortcut, not a statement</Text>
            <Ionicons name="chevron-forward" size={20} color={theme.mutedForeground} />
          </Pressable> : null}
          <Segmented value={segment} onChange={onSegment} options={[
            { value: "now", label: "Now", badge: counts.now || undefined },
            { value: "wait", label: "Later", badge: counts.wait || undefined },
          ]} />
          <View style={styles.section}>
            <Text variant="section" accessibilityRole="header">{segment === "now" ? "Needs you now" : "Can wait"}</Text>
            {candidateRows.length || draftRows.length ? <Group>
              {candidateRows.map((candidate) => <LargeCandidateRow key={candidate.id} candidate={candidate} currency={currency} places={places}
                onPress={() => onOpenCandidate(candidate.id)} />)}
              {draftRows.map((item) => <LargeDraftRow key={item.id} item={item} onPress={() => onResumeDraft(item.id)} />)}
            </Group> : <Text variant="body" tone="muted">{segment === "now" ? "Nothing needs you now." : "Nothing waiting later."}</Text>}
          </View>
        </>}
      {readyToShow && otherNotifications.length > 0 ? <View style={styles.section}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Other notifications, ${otherNotifications.length}`} accessibilityState={{ expanded: showOtherNotifications }}
          accessibilityHint="App notices and promotions. Open any notification to review it." onPress={() => setShowOtherNotifications((value) => !value)} style={styles.largeFold}>
          <View style={styles.candidateCopy}>
            <Text variant="section">{`Other notifications · ${otherNotifications.length}`}</Text>
            <Text variant="meta" tone="muted">App notices and promotions. Open any item to review it.</Text>
          </View>
          <Ionicons name={showOtherNotifications ? "chevron-up" : "chevron-down"} size={24} color={theme.mutedForeground} />
        </Pressable>
        {showOtherNotifications ? <Group>
          {otherNotifications.map((candidate) => <LargeNoticeRow key={candidate.id} candidate={candidate} onPress={() => onOpenCandidate(candidate.id)} />)}
        </Group> : null}
      </View> : null}
      {readyToShow ? <Group>
        <ValueRow title="Notification intake" onPress={onSources} accessibilityLabel={`Notification intake, ${statusText(sourcesLine)}`}
          leading={<IconTile icon="pulse-outline" tone="neutral" />}>
          <StatusLine state={sourcesLine.state} text={sourcesLine.text} />
        </ValueRow>
        {discardNotices.length ? <ValueRow title="Discarded" onPress={() => setScreen("discard")}
          accessibilityLabel={`Discarded, ${discardNotices.length === 1 ? "1 notification" : `${discardNotices.length} notifications`}, no text kept`}
          leading={<IconTile icon="eye-off-outline" tone="neutral" />}>
          <StatusLine text={`${discardNotices.length === 1 ? "1 notification" : `${discardNotices.length} notifications`}, no text kept`} />
        </ValueRow> : null}
      </Group> : null}
      {readyToShow && !empty ? <TextButton label="Preview Month Close" onPress={() => setScreen("month-close")} /> : null}
    </Screen>
  );
  return <Presentation legacy={legacy}>{large}</Presentation>;
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
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
  segment: { flex: 1, minHeight: touchTarget, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, borderRadius: radius.full, paddingHorizontal: spacing.sm },
  selectedSegment: { backgroundColor: theme.background, shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  segmentLabel: { flexShrink: 1 },
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
