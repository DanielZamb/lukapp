// PROTOTYPE: Variant D inbox, now the Drafts destination on the Essential-first home.

import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  Alert,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  font,
  fontSize,
  radius,
  spacing,
  touchTarget,
  type Theme,
  type ThemeMode,
} from "../theme/tokens";
import { SegmentToggle } from "./segment-toggle";

export type Candidate = {
  id: string;
  description: string;
  amount: number;
  account: string;
  category: string;
  date: string;
  source: string;
  expiresInDays: number;
  status: "ready" | "needs-review";
  issue?: string;
};

type InboxScreen =
  | "inbox"
  | "edit"
  | "sources"
  | "confirmed"
  | "month-close"
  | "warning"
  | "discard";

export const initialCandidates: Candidate[] = [
  {
    id: "candidate-groceries",
    description: "Groceries",
    amount: 126400,
    account: "Daily account",
    category: "Food",
    date: "August 20",
    source: "Bancolombia",
    expiresInDays: 2,
    status: "ready",
  },
  {
    id: "candidate-coffee",
    description: "Coffee",
    amount: 14800,
    account: "Digital wallet",
    category: "Dining",
    date: "August 20",
    source: "Nequi",
    expiresInDays: 8,
    status: "ready",
  },
  {
    id: "candidate-pharmacy",
    description: "Pharmacy",
    amount: 71300,
    account: "Daily account",
    category: "Health",
    date: "August 19",
    source: "Bancolombia",
    expiresInDays: 11,
    status: "ready",
  },
  {
    id: "candidate-transfer",
    description: "Transfer received",
    amount: 500000,
    account: "Choose account",
    category: "Transfer",
    date: "August 19",
    source: "Davivienda",
    expiresInDays: 4,
    status: "needs-review",
    issue: "Choose the destination account",
  },
];

function lightTap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

function money(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString("es-CO")}`;
}

export function DraftsInbox({
  candidates,
  onChangeCandidates,
  onPosted,
  onReview,
  onBack,
  onMonthClose,
  accountNames,
  currency,
  theme,
  themeMode,
}: {
  candidates: Candidate[];
  onChangeCandidates: Dispatch<SetStateAction<Candidate[]>>;
  onPosted: (posted: Candidate[]) => void;
  onReview?: (candidate: Candidate) => void;
  onBack: () => void;
  onMonthClose: () => void;
  accountNames: string[];
  currency: string;
  theme: Theme;
  themeMode: ThemeMode;
}) {
  const styles = useMemo(
    () => createStyles(theme, themeMode),
    [theme, themeMode],
  );
  const [screen, setScreen] = useState<InboxScreen>("inbox");
  const [selectedCandidateId, setSelectedCandidateId] = useState(
    candidates[0]?.id ?? "",
  );
  const [showDiscardNotice, setShowDiscardNotice] = useState(true);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [setupStep, setSetupStep] = useState<"disclosure" | "sources">(
    "disclosure",
  );
  const [selectedSources, setSelectedSources] = useState(new Set<string>());
  const [warningViewed, setWarningViewed] = useState(false);

  const selectedCandidate = candidates.find(
    (item) => item.id === selectedCandidateId,
  );
  const ready = candidates.filter((item) => item.status === "ready");
  const needsReview = candidates.filter((item) => item.status === "needs-review");
  const expiring = candidates.filter((item) => item.expiresInDays <= 3);

  function openWarning() {
    setWarningViewed(true);
    setScreen("warning");
  }

  function openCandidate(candidate: Candidate) {
    if (onReview) {
      onReview(candidate);
      return;
    }
    setSelectedCandidateId(candidate.id);
    setScreen("edit");
  }

  function confirmCandidates(posted: Candidate[]) {
    const ids = new Set(posted.map((item) => item.id));
    onChangeCandidates((current) =>
      current.filter((item) => !ids.has(item.id)),
    );
    onPosted(posted);
    setConfirmedCount(posted.length);
    setScreen("confirmed");
  }

  const shell = (content: ReactNode) => (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
        {content}
      </ScrollView>
    </SafeAreaView>
  );

  if (screen === "sources") {
    return shell(
      <>
        <PageHeader
          title="Notification Intake"
          eyebrow="PRIVATE DEVICE SETUP"
          onBack={() => setScreen("inbox")}
          styles={styles}
          theme={theme}
        />
        {setupStep === "disclosure" && (
          <View style={styles.setupFlow}>
            <View style={styles.disclosureHero}>
              <View style={styles.disclosureIcon}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={30}
                  color={theme.primary}
                />
              </View>
              <Text style={styles.disclosureTitle}>
                Your notifications stay on this device
              </Text>
              <Text style={styles.disclosureCopy}>
                Lukapp reads only sources you select. Candidates expire after 15
                days. Raw notification text is never uploaded. Capture may still
                miss activity.
              </Text>
            </View>
            <PrimaryButton
              label="Open Android settings"
              onPress={() => {
                Alert.alert(
                  "Prototype",
                  "Android notification settings would open here.",
                );
                setSetupStep("sources");
              }}
              styles={styles}
              theme={theme}
            />
          </View>
        )}
        {setupStep === "sources" && (
          <>
            <ServiceHealth
              selectedCount={selectedSources.size}
              styles={styles}
            />
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Choose allowed sources</Text>
              <Text style={styles.bodyCopy}>
                Selecting a source starts intake for that source. Removing it
                stops future capture.
              </Text>
            </View>
            <View style={styles.listGroup}>
              {["Bancolombia", "Davivienda", "Nequi"].map((source) => {
                const selected = selectedSources.has(source);
                return (
                  <Pressable
                    key={source}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    onPress={() => {
                      lightTap();
                      setSelectedSources((current) => {
                        const next = new Set(current);
                        if (next.has(source)) next.delete(source);
                        else next.add(source);
                        return next;
                      });
                    }}
                    style={styles.listRow}
                  >
                    <Text style={styles.rowTitle}>{source}</Text>
                    <Ionicons
                      name={selected ? "checkmark-circle" : "ellipse-outline"}
                      size={24}
                      color={selected ? theme.primary : theme.mutedForeground}
                    />
                  </Pressable>
                );
              })}
            </View>
            <PrimaryButton
              label="Review Candidates"
              disabled={selectedSources.size === 0}
              onPress={() => setScreen("inbox")}
              styles={styles}
              theme={theme}
            />
          </>
        )}
      </>,
    );
  }

  if (screen === "edit" && selectedCandidate) {
    return shell(
      <CandidateForm
        candidate={selectedCandidate}
        accountNames={accountNames}
        currency={currency}
        warningViewed={warningViewed}
        onWarning={openWarning}
        onBack={() => setScreen("inbox")}
        onConfirm={() => confirmCandidates([selectedCandidate])}
        styles={styles}
        theme={theme}
      />,
    );
  }

  if (screen === "confirmed") {
    return shell(
      <View style={styles.completion}>
        <View style={styles.completionIcon}>
          <Ionicons name="checkmark" size={30} color={theme.primaryForeground} />
        </View>
        <Text style={styles.completionTitle}>
          {confirmedCount === 1
            ? "Record added"
            : `${confirmedCount} records added`}
        </Text>
        <Text style={styles.completionCopy}>
          The server validated and posted each record. Local notification
          content was deleted after acknowledgement.
        </Text>
        <PrimaryButton
          label={
            candidates.length > 0
              ? "Back to Candidates"
              : "Continue to Month Close"
          }
          onPress={() =>
            candidates.length > 0 ? setScreen("inbox") : onMonthClose()
          }
          styles={styles}
          theme={theme}
        />
      </View>,
    );
  }

  if (screen === "warning") {
    return shell(
      <>
        <PageHeader
          title="Reconciliation warning"
          eyebrow="READ BEFORE USING INTAKE"
          onBack={() => {
            setWarningViewed(true);
            setScreen("inbox");
          }}
          styles={styles}
          theme={theme}
        />
        <View style={styles.warningDetail}>
          <Ionicons name="alert-circle-outline" size={36} color={theme.foreground} />
          <Text style={styles.warningDetailTitle}>
            Notifications are a shortcut, not a statement
          </Text>
          <Text style={styles.warningDetailCopy}>
            Notification Intake may miss, delay, or duplicate activity.
            Reconcile against your financial accounts.
          </Text>
        </View>
        <View style={styles.warningFacts}>
          <Text style={styles.warningFact}>
            A missing notification can leave activity out.
          </Text>
          <Text style={styles.warningFact}>
            A delayed or repeated notification can create the wrong review
            queue.
          </Text>
          <Text style={styles.warningFact}>
            Only your account history can settle the difference.
          </Text>
        </View>
        <PrimaryButton
          label="I understand"
          onPress={() => {
            setWarningViewed(true);
            setScreen("inbox");
          }}
          styles={styles}
          theme={theme}
        />
      </>,
    );
  }

  if (screen === "discard") {
    return shell(
      <>
        <PageHeader
          title="Discarded notifications"
          eyebrow="NOT SAVED AS CANDIDATES"
          onBack={() => setScreen("inbox")}
          styles={styles}
          theme={theme}
        />
        <Text style={styles.bodyCopy}>
          These notices contain no notification text. They disappear after 15
          days.
        </Text>
        <View style={styles.discardList}>
          <DiscardDetail
            source="Daviplata"
            time="Today, 9:42 AM"
            reason="Missing amount or direction"
            styles={styles}
          />
          <DiscardDetail
            source="Nequi"
            time="Yesterday, 6:18 PM"
            reason="Security alert"
            styles={styles}
          />
        </View>
        <PrimaryButton
          label="OK"
          onPress={() => {
            setShowDiscardNotice(false);
            setScreen("inbox");
          }}
          styles={styles}
          theme={theme}
        />
      </>,
    );
  }

  if (screen === "month-close") {
    return shell(
      <>
        <PageHeader
          title="Complete August"
          eyebrow="BEFORE YOU CONTINUE"
          onBack={() => setScreen("inbox")}
          styles={styles}
          theme={theme}
        />
        <View style={styles.monthCloseMessage}>
          <Text style={styles.monthCloseCount}>{candidates.length}</Text>
          <Text style={styles.monthCloseTitle}>
            local Candidates still need a decision
          </Text>
          <Text style={styles.monthCloseCopy}>
            Review any August activity now. Notification Intake is incomplete
            evidence, so this does not block Month Close.
          </Text>
        </View>
        <View style={styles.monthCloseActions}>
          <PrimaryButton
            label="Review Candidates"
            onPress={() => setScreen("inbox")}
            styles={styles}
            theme={theme}
          />
          <SecondaryButton
            label="Continue Month Close anyway"
            onPress={onMonthClose}
            styles={styles}
          />
        </View>
      </>,
    );
  }

  return shell(
    <PriorityInbox
      candidates={candidates}
      ready={ready}
      needsReview={needsReview}
      expiring={expiring}
      showDiscardNotice={showDiscardNotice}
      warningViewed={warningViewed}
      currency={currency}
      onWarning={openWarning}
      onDiscard={() => setScreen("discard")}
      onOpen={openCandidate}
      onConfirmAll={() => confirmCandidates(ready)}
      onManage={() => setScreen("sources")}
      onMonthClose={() => setScreen("month-close")}
      onLeave={onBack}
      styles={styles}
      theme={theme}
    />,
  );
}

function PriorityInbox({
  candidates,
  ready,
  needsReview,
  expiring,
  showDiscardNotice,
  warningViewed,
  currency,
  onWarning,
  onDiscard,
  onOpen,
  onConfirmAll,
  onManage,
  onMonthClose,
  onLeave,
  styles,
  theme,
}: {
  candidates: Candidate[];
  ready: Candidate[];
  needsReview: Candidate[];
  expiring: Candidate[];
  showDiscardNotice: boolean;
  warningViewed: boolean;
  currency: string;
  onWarning: () => void;
  onDiscard: () => void;
  onOpen: (candidate: Candidate) => void;
  onConfirmAll: () => void;
  onManage: () => void;
  onMonthClose: () => void;
  onLeave: () => void;
  styles: Styles;
  theme: Theme;
}) {
  const priorityIds = new Set(
    [...expiring, ...needsReview].map((item) => item.id),
  );
  const priority = candidates.filter((item) => priorityIds.has(item.id));
  const later = candidates.filter((item) => !priorityIds.has(item.id));
  const readyTotal = ready.reduce((sum, item) => sum + item.amount, 0);
  const [list, setList] = useState<"now" | "wait">(
    priority.length > 0 ? "now" : "wait",
  );
  const shown = list === "now" ? priority : later;

  if (candidates.length === 0) {
    return (
      <>
        <PageHeader
          title="Candidates"
          eyebrow="NOTIFICATION INTAKE"
          onBack={onLeave}
          action="Sources"
          onAction={onManage}
          styles={styles}
          theme={theme}
        />
        <View style={styles.refinedHero}>
          <Text style={styles.refinedKicker}>Review complete</Text>
          <Text style={styles.refinedAmount}>Nothing waiting</Text>
          <Text style={styles.refinedBody}>
            August is ready to close. Remaining local Candidates never block
            Month Close.
          </Text>
        </View>
        <PrimaryButton
          label="Continue to Month Close"
          onPress={onMonthClose}
          styles={styles}
          theme={theme}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Candidates"
        eyebrow="NOTIFICATION INTAKE"
        onBack={onLeave}
        action="Sources"
        onAction={onManage}
        styles={styles}
        theme={theme}
      />
      <View style={styles.refinedHero}>
        {/* Anchored to the count it qualifies: these totals come from
            notifications, and notifications can miss or duplicate. */}
        <View style={styles.kickerRow}>
          <Text style={styles.refinedKicker}>
            {ready.length} ready to add
          </Text>
          {!warningViewed && (
            <WarningIconButton
              onPress={onWarning}
              styles={styles}
              theme={theme}
            />
          )}
        </View>
        <Text style={styles.refinedAmount}>{money(readyTotal, currency)}</Text>
        <Text style={styles.refinedBody}>
          Review what needs you now, or confirm every Ready Candidate.
        </Text>
      </View>
      <PrimaryButton
        label="Confirm all Ready"
        disabled={ready.length === 0}
        onPress={onConfirmAll}
        styles={styles}
        theme={theme}
      />
      <SegmentToggle
        value={list}
        theme={theme}
        onChange={setList}
        segments={[
          { id: "now", label: "Needs you now", badge: priority.length },
          { id: "wait", label: "Can wait", badge: later.length },
        ]}
      />
      <View style={styles.minimalSection}>
        {shown.length === 0 ? (
          <View style={styles.emptyList}>
            <Text style={styles.emptyListText}>
              {list === "now"
                ? "Nothing needs you now."
                : "Nothing waiting later."}
            </Text>
          </View>
        ) : (
          shown.map((candidate) => (
            <MinimalCandidateRow
              key={candidate.id}
              candidate={candidate}
              currency={currency}
              onPress={() => onOpen(candidate)}
              styles={styles}
              theme={theme}
            />
          ))
        )}
      </View>
      {showDiscardNotice && (
        <DiscardNotice onOpen={onDiscard} styles={styles} />
      )}
      <FooterLinks onMonthClose={onMonthClose} styles={styles} theme={theme} />
    </>
  );
}

function CandidateForm({
  candidate,
  accountNames,
  currency,
  warningViewed,
  onWarning,
  onBack,
  onConfirm,
  styles,
  theme,
}: {
  candidate: Candidate;
  accountNames: string[];
  currency: string;
  warningViewed: boolean;
  onWarning: () => void;
  onBack: () => void;
  onConfirm: () => void;
  styles: Styles;
  theme: Theme;
}) {
  const [description, setDescription] = useState(candidate.description);
  const [amount, setAmount] = useState(String(candidate.amount));
  const [category, setCategory] = useState(candidate.category);
  const [account, setAccount] = useState(
    accountNames.includes(candidate.account)
      ? candidate.account
      : "Choose account",
  );
  const accounts = ["Choose account", ...accountNames.filter((name) => name !== "Choose account")];
  const ready = Boolean(
    description.trim() &&
      amount.trim() &&
      category &&
      account !== "Choose account",
  );

  return (
    <>
      <PageHeader
        title="Add transaction"
        eyebrow="FROM LOCAL CANDIDATE"
        onBack={onBack}
        styles={styles}
        theme={theme}
      />
      <View style={styles.contextCard}>
        <View style={styles.contextIcon}>
          <Ionicons
            name="phone-portrait-outline"
            size={20}
            color={theme.primary}
          />
        </View>
        <View style={styles.flexCopy}>
          <Text style={styles.rowTitle}>
            {candidate.source} · expires in {candidate.expiresInDays} days
          </Text>
          <Text style={styles.muted}>
            Suggestions stay on this device until you confirm.
          </Text>
        </View>
        {!warningViewed && (
          <WarningIconButton
            onPress={onWarning}
            styles={styles}
            theme={theme}
          />
        )}
      </View>
      <View style={styles.fieldSection}>
        <Text style={styles.fieldLabel}>Amount</Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          keyboardType="number-pad"
          style={styles.input}
        />
        <Text style={styles.fieldHint}>{currency} · Money out</Text>
      </View>
      <View style={styles.fieldSection}>
        <Text style={styles.fieldLabel}>Description</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          style={styles.input}
        />
        <Text style={styles.fieldLabel}>Date</Text>
        <TextInput
          value={candidate.date}
          editable={false}
          style={[styles.input, styles.readonly]}
        />
      </View>
      <View style={styles.fieldSection}>
        <Text style={styles.fieldLabel}>Account</Text>
        <View style={styles.chipRow}>
          {accounts
            .filter((value) => value !== "Choose account")
            .map((value) => (
              <ChoiceChip
                key={value}
                label={value}
                selected={account === value}
                onPress={() => setAccount(value)}
                styles={styles}
              />
            ))}
        </View>
        <Text style={styles.fieldLabel}>Category</Text>
        <View style={styles.chipRow}>
          {["Food", "Dining", "Health", "Transfer"].map((value) => (
            <ChoiceChip
              key={value}
              label={value}
              selected={category === value}
              onPress={() => setCategory(value)}
              styles={styles}
            />
          ))}
        </View>
      </View>
      <PrimaryButton
        label="Confirm and add transaction"
        disabled={!ready}
        onPress={onConfirm}
        styles={styles}
        theme={theme}
      />
    </>
  );
}

function ServiceHealth({
  selectedCount,
  styles,
}: {
  selectedCount: number;
  styles: Styles;
}) {
  const adapter =
    Platform.OS === "ios" ? "IOS AUTOMATION" : "ANDROID LISTENER";
  const listening = selectedCount > 0;
  return (
    <View style={styles.serviceHealth} accessibilityLiveRegion="polite">
      <Text style={styles.healthLabel}>{adapter}</Text>
      <Text style={styles.healthState}>
        {listening ? "Listening" : "Waiting for a source"}
      </Text>
      <Text style={styles.healthCheck}>Last health check · just now</Text>
    </View>
  );
}

function WarningIconButton({
  onPress,
  styles,
  theme,
}: {
  onPress: () => void;
  styles: Styles;
  theme: Theme;
}) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 850,
          easing: Easing.out(Easing.quad),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 850,
          easing: Easing.in(Easing.quad),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const ringStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
    transform: [
      {
        scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }),
      },
    ],
  };

  return (
    <View style={styles.warningIconSlot}>
      <Animated.View style={[styles.warningPulseRing, ringStyle]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open reconciliation warning"
        accessibilityHint="Explains why notification activity must be reconciled"
        hitSlop={11}
        onPress={onPress}
        style={({ pressed }) => [
          styles.warningIconButton,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name="warning" size={15} color={theme.warning} />
      </Pressable>
    </View>
  );
}

function DiscardNotice({
  onOpen,
  styles,
}: {
  onOpen: () => void;
  styles: Styles;
}) {
  return (
    <SecondaryButton
      label="Notifications discarded"
      onPress={onOpen}
      styles={styles}
    />
  );
}

function DiscardDetail({
  source,
  time,
  reason,
  styles,
}: {
  source: string;
  time: string;
  reason: string;
  styles: Styles;
}) {
  return (
    <View style={styles.discardDetail}>
      <Text style={styles.rowTitle}>{source}</Text>
      <Text style={styles.muted}>{time}</Text>
      <Text style={styles.discardReason}>{reason}</Text>
    </View>
  );
}

function MinimalCandidateRow({
  candidate,
  currency,
  onPress,
  styles,
  theme,
}: {
  candidate: Candidate;
  currency: string;
  onPress: () => void;
  styles: Styles;
  theme: Theme;
}) {
  const supporting = candidate.issue ?? candidate.account;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Review ${candidate.description}`}
      onPress={onPress}
      style={({ pressed }) => [styles.minimalRow, pressed && styles.pressed]}
    >
      <View style={styles.flexCopy}>
        <Text style={styles.rowTitle}>{candidate.description}</Text>
        <Text style={styles.muted}>{supporting}</Text>
      </View>
      <Text style={styles.rowAmount}>{money(candidate.amount, currency)}</Text>
      <Ionicons name="chevron-forward" size={18} color={theme.mutedForeground} />
    </Pressable>
  );
}

function MinimalSection({
  title,
  detail,
  children,
  styles,
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
  styles: Styles;
}) {
  return (
    <View style={styles.minimalSection}>
      <View style={styles.minimalSectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionDetail}>{detail}</Text>
      </View>
      <View style={styles.minimalList}>{children}</View>
    </View>
  );
}

function PageHeader({
  title,
  eyebrow,
  onBack,
  action,
  onAction,
  styles,
  theme,
}: {
  title: string;
  eyebrow: string;
  onBack?: () => void;
  action?: string;
  onAction?: () => void;
  styles: Styles;
  theme: Theme;
}) {
  return (
    <View style={styles.pageHeader}>
      {onBack && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={onBack}
          style={styles.iconButton}
        >
          <Ionicons name="chevron-back" size={24} color={theme.foreground} />
        </Pressable>
      )}
      <View style={styles.flexCopy}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.pageTitle}>{title}</Text>
      </View>
      {action && onAction && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action}
          onPress={onAction}
          style={styles.headerAction}
        >
          <Text style={styles.headerActionText}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled = false,
  styles,
  theme,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  styles: Styles;
  theme: Theme;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPressIn={lightTap}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
      <Ionicons name="arrow-forward" size={20} color={theme.primaryForeground} />
    </Pressable>
  );
}

function SecondaryButton({
  label,
  onPress,
  styles,
}: {
  label: string;
  onPress: () => void;
  styles: Styles;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function ChoiceChip({
  label,
  selected,
  onPress,
  styles,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  styles: Styles;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

function FooterLinks({
  onMonthClose,
  styles,
  theme,
}: {
  onMonthClose: () => void;
  styles: Styles;
  theme: Theme;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onMonthClose}
      style={styles.footerLink}
    >
      <Text style={styles.footerLinkText}>Preview Month Close warning</Text>
      <Ionicons name="arrow-forward" size={16} color={theme.primary} />
    </Pressable>
  );
}

type Styles = ReturnType<typeof createStyles>;

function createStyles(theme: Theme, mode: ThemeMode) {
  // Warning surfaces are tinted from theme.warning so they read on either
  // ground instead of the fixed peach the light-only version used.
  const warnTint = `${theme.warning}${mode === "dark" ? "24" : "1f"}`;
  const warnLine = `${theme.warning}${mode === "dark" ? "66" : "4d"}`;
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: theme.background },
    page: {
      flexGrow: 1,
      gap: spacing.xl,
      paddingHorizontal: spacing.xxl,
      paddingTop: spacing.md,
      paddingBottom: 132,
      backgroundColor: theme.background,
    },
    pageHeader: {
      minHeight: touchTarget,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    eyebrow: {
      color: theme.mutedForeground,
      fontSize: fontSize.label,
      fontFamily: font.bold,
      letterSpacing: 1,
    },
    pageTitle: {
      color: theme.foreground,
      fontSize: 32,
      lineHeight: 37,
      fontFamily: font.extrabold,
      letterSpacing: -0.7,
    },
    iconButton: {
      width: touchTarget,
      height: touchTarget,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.full,
      backgroundColor: theme.secondary,
    },
    headerAction: {
      minHeight: touchTarget,
      justifyContent: "center",
      paddingHorizontal: spacing.sm,
    },
    headerActionText: {
      color: theme.primary,
      fontSize: 15,
      fontFamily: font.bold,
    },
    setupFlow: { gap: spacing.section, paddingTop: spacing.md },
    disclosureHero: { gap: spacing.lg, paddingVertical: spacing.xl },
    disclosureIcon: {
      width: 60,
      height: 60,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.full,
      backgroundColor: `${theme.primary}1f`,
    },
    disclosureTitle: {
      color: theme.foreground,
      fontSize: 24,
      lineHeight: 29,
      fontFamily: font.extrabold,
    },
    disclosureCopy: {
      color: theme.secondaryForeground,
      fontSize: fontSize.body,
      lineHeight: 24,
      fontFamily: font.regular,
    },
    serviceHealth: {
      gap: spacing.xs,
      paddingVertical: spacing.xl,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    healthLabel: {
      color: theme.mutedForeground,
      fontSize: fontSize.label,
      fontFamily: font.bold,
      letterSpacing: 1,
    },
    healthState: {
      color: theme.foreground,
      fontSize: 28,
      lineHeight: 33,
      fontFamily: font.extrabold,
    },
    healthCheck: {
      color: theme.mutedForeground,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: font.regular,
    },
    kickerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    warningIconSlot: {
      width: 26,
      height: 26,
      alignItems: "center",
      justifyContent: "center",
    },
    warningPulseRing: {
      position: "absolute",
      width: 26,
      height: 26,
      borderRadius: radius.full,
      backgroundColor: theme.warning,
      pointerEvents: "none",
    },
    warningIconButton: {
      width: 26,
      height: 26,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: warnLine,
      backgroundColor: warnTint,
    },
    warningDetail: {
      gap: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: spacing.section,
    },
    warningDetailTitle: {
      maxWidth: 330,
      color: theme.foreground,
      fontSize: 30,
      lineHeight: 36,
      fontFamily: font.extrabold,
    },
    warningDetailCopy: {
      color: theme.foreground,
      fontSize: 18,
      lineHeight: 27,
      fontFamily: font.regular,
    },
    warningFacts: {
      gap: spacing.lg,
      paddingVertical: spacing.xl,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: theme.border,
    },
    warningFact: {
      color: theme.mutedForeground,
      fontSize: fontSize.body,
      lineHeight: 24,
      fontFamily: font.regular,
    },
    sectionTitle: {
      color: theme.foreground,
      fontSize: fontSize.title,
      fontFamily: font.bold,
    },
    sectionDetail: {
      color: theme.mutedForeground,
      fontSize: 13,
      fontFamily: font.medium,
    },
    sectionCopy: { gap: spacing.sm },
    bodyCopy: {
      color: theme.mutedForeground,
      fontSize: fontSize.body,
      lineHeight: 24,
      fontFamily: font.regular,
    },
    listGroup: {
      borderRadius: radius.lg,
      backgroundColor: theme.secondary,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: "hidden",
    },
    listRow: {
      minHeight: 68,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    rowTitle: {
      color: theme.foreground,
      fontSize: fontSize.body,
      fontFamily: font.semibold,
    },
    rowAmount: {
      maxWidth: "34%",
      color: theme.foreground,
      fontSize: 14,
      fontFamily: font.bold,
      textAlign: "right",
    },
    muted: {
      color: theme.mutedForeground,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: font.regular,
    },
    discardList: { gap: spacing.xxl, paddingVertical: spacing.lg },
    discardDetail: {
      gap: spacing.xs,
      paddingBottom: spacing.xl,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    discardReason: {
      color: theme.foreground,
      fontSize: 15,
      lineHeight: 21,
      fontFamily: font.medium,
    },
    refinedHero: {
      gap: spacing.sm,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xl,
    },
    refinedKicker: {
      color: theme.primary,
      fontSize: 14,
      fontFamily: font.bold,
    },
    refinedAmount: {
      color: theme.foreground,
      fontSize: 38,
      lineHeight: 43,
      fontFamily: font.extrabold,
      letterSpacing: -0.8,
    },
    refinedBody: {
      maxWidth: 330,
      color: theme.mutedForeground,
      fontSize: 15,
      lineHeight: 22,
      fontFamily: font.regular,
    },
    primaryButton: {
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      paddingHorizontal: spacing.xl,
      borderRadius: radius.md,
      backgroundColor: theme.primary,
    },
    primaryButtonText: {
      color: theme.primaryForeground,
      fontSize: fontSize.action,
      fontFamily: font.bold,
    },
    secondaryButton: {
      minHeight: touchTarget,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.border,
    },
    secondaryButtonText: {
      color: theme.foreground,
      fontSize: fontSize.body,
      fontFamily: font.semibold,
    },
    disabled: { opacity: 0.4 },
    pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
    footerLink: {
      minHeight: touchTarget,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
    },
    footerLinkText: {
      color: theme.primary,
      fontSize: 14,
      fontFamily: font.semibold,
    },
    contextCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.lg,
      borderRadius: radius.md,
      backgroundColor: `${theme.primary}1f`,
    },
    contextIcon: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.full,
      backgroundColor: theme.background,
    },
    fieldSection: {
      gap: spacing.sm,
      padding: spacing.lg,
      borderRadius: radius.lg,
      backgroundColor: theme.secondary,
    },
    fieldLabel: {
      color: theme.foreground,
      fontSize: 14,
      fontFamily: font.semibold,
    },
    fieldHint: {
      color: theme.mutedForeground,
      fontSize: 13,
      fontFamily: font.medium,
    },
    input: {
      minHeight: 52,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.ring,
      color: theme.foreground,
      backgroundColor: theme.background,
      fontSize: fontSize.body,
      fontFamily: font.regular,
    },
    readonly: { color: theme.mutedForeground },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: {
      minHeight: touchTarget,
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.background,
    },
    chipSelected: { borderColor: theme.primary, borderWidth: 2 },
    chipText: {
      color: theme.foreground,
      fontSize: 14,
      fontFamily: font.semibold,
    },
    minimalSection: {
      gap: 0,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.secondary,
      overflow: "hidden",
    },
    minimalList: { borderTopWidth: 1, borderTopColor: theme.border },
    minimalRow: {
      minHeight: 76,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    emptyList: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xl,
    },
    emptyListText: {
      color: theme.mutedForeground,
      fontSize: 15,
      fontFamily: font.medium,
    },
    minimalSectionHeader: {
      minHeight: 60,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
    },
    monthCloseMessage: {
      gap: spacing.md,
      paddingTop: spacing.xl,
      paddingBottom: spacing.section,
    },
    monthCloseCount: {
      color: theme.primary,
      fontSize: 64,
      lineHeight: 68,
      fontFamily: font.extrabold,
      letterSpacing: -2,
    },
    monthCloseTitle: {
      maxWidth: 330,
      color: theme.foreground,
      fontSize: 28,
      lineHeight: 34,
      fontFamily: font.extrabold,
    },
    monthCloseCopy: {
      maxWidth: 340,
      color: theme.mutedForeground,
      fontSize: fontSize.body,
      lineHeight: 25,
      fontFamily: font.regular,
    },
    monthCloseActions: { gap: spacing.lg, paddingTop: spacing.xl },
    flexCopy: { flex: 1, gap: spacing.xs },
    completion: {
      flex: 1,
      minHeight: 560,
      justifyContent: "center",
      alignItems: "center",
      gap: spacing.xl,
    },
    completionIcon: {
      width: 68,
      height: 68,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.full,
      backgroundColor: theme.primary,
    },
    completionTitle: {
      color: theme.foreground,
      fontSize: 30,
      lineHeight: 36,
      fontFamily: font.extrabold,
      textAlign: "center",
    },
    completionCopy: {
      maxWidth: 340,
      color: theme.mutedForeground,
      fontSize: fontSize.body,
      lineHeight: 24,
      fontFamily: font.regular,
      textAlign: "center",
    },
  });
}
