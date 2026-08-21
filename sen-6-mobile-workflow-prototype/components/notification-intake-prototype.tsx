// PROTOTYPE: four Notification Intake review models on native Expo Router
// routes at `/notification-intake/A`, `B`, `C`, and `D`.

import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
  themes,
  touchTarget,
} from "../theme/tokens";

export type IntakeVariant = "A" | "B" | "C" | "D";

type Candidate = {
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

type Screen = "inbox" | "edit" | "sources" | "confirmed" | "month-close" | "warning" | "discard";

const variantNames: Record<IntakeVariant, string> = {
  A: "Review queue",
  B: "Urgency lanes",
  C: "Batch preview",
  D: "Priority, simplified",
};

const initialCandidates: Candidate[] = [
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

export function normalizeIntakeVariant(value?: string): IntakeVariant {
  return value === "B" || value === "C" || value === "D" ? value : "A";
}

function lightTap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

function money(amount: number) {
  return `COP ${amount.toLocaleString("es-CO")}`;
}

export function NotificationIntakePrototype({
  variant,
}: {
  variant: IntakeVariant;
}) {
  const router = useRouter();
  const theme = themes.light;
  const styles = useMemo(() => createStyles(), []);
  const [screen, setScreen] = useState<Screen>("inbox");
  const [candidates, setCandidates] = useState(initialCandidates);
  const [selectedCandidateId, setSelectedCandidateId] = useState(initialCandidates[0].id);
  const [selectedBatchIds, setSelectedBatchIds] = useState(
    new Set(initialCandidates.filter((item) => item.status === "ready").map((item) => item.id)),
  );
  const [showDiscardNotice, setShowDiscardNotice] = useState(true);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [setupStep, setSetupStep] = useState<"disclosure" | "sources">("disclosure");
  const [selectedSources, setSelectedSources] = useState(new Set<string>());
  const [warningViewed, setWarningViewed] = useState(false);

  const selectedCandidate = candidates.find((item) => item.id === selectedCandidateId);
  const ready = candidates.filter((item) => item.status === "ready");
  const needsReview = candidates.filter((item) => item.status === "needs-review");
  const expiring = candidates.filter((item) => item.expiresInDays <= 3);
  const selectedReady = ready.filter((item) => selectedBatchIds.has(item.id));
  const selectedTotal = selectedReady.reduce((sum, item) => sum + item.amount, 0);

  function openWarning() {
    setWarningViewed(true);
    setScreen("warning");
  }

  function moveVariant(direction: number) {
    const variants: IntakeVariant[] = ["A", "B", "C", "D"];
    const currentIndex = variants.indexOf(variant);
    const next = variants[(currentIndex + direction + variants.length) % variants.length];
    router.replace({
      pathname: "/notification-intake/[variant]",
      params: { variant: next },
    });
    setScreen("inbox");
  }

  useEffect(() => {
    if (Platform.OS !== "web") return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || target?.isContentEditable) return;
      if (event.key === "ArrowLeft") moveVariant(-1);
      if (event.key === "ArrowRight") moveVariant(1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function openCandidate(candidate: Candidate) {
    setSelectedCandidateId(candidate.id);
    setScreen("edit");
  }

  function confirmCandidate(candidate: Candidate) {
    setCandidates((current) => current.filter((item) => item.id !== candidate.id));
    setConfirmedCount(1);
    setScreen("confirmed");
  }

  function confirmBatch() {
    const ids = new Set(selectedReady.map((item) => item.id));
    setCandidates((current) => current.filter((item) => !ids.has(item.id)));
    setConfirmedCount(ids.size);
    setSelectedBatchIds(new Set());
    setScreen("confirmed");
  }

  function toggleBatch(id: string) {
    setSelectedBatchIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const shell = (content: React.ReactNode) => (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        {content}
      </ScrollView>
      <IntakeSwitcher current={variant} onMove={moveVariant} styles={styles} />
    </SafeAreaView>
  );

  if (screen === "sources") {
    return shell(
      <>
        <PageHeader title="Notification Intake" eyebrow="PRIVATE DEVICE SETUP" onBack={() => setScreen("inbox")} styles={styles} />
        {setupStep === "disclosure" && (
          <View style={styles.setupFlow}>
            <View style={styles.disclosureHero}>
              <View style={styles.disclosureIcon}>
                <Ionicons name="shield-checkmark-outline" size={30} color={theme.primary} />
              </View>
              <Text style={styles.disclosureTitle}>Your notifications stay on this device</Text>
              <Text style={styles.disclosureCopy}>Lukapp reads only sources you select. Candidates expire after 15 days. Raw notification text is never uploaded. Capture may still miss activity.</Text>
            </View>
            <PrimaryButton label="Open Android settings" onPress={() => { Alert.alert("Prototype", "Android notification settings would open here."); setSetupStep("sources"); }} styles={styles} />
          </View>
        )}
        {setupStep === "sources" && (
          <>
            <ServiceHealth selectedCount={selectedSources.size} styles={styles} />
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Choose allowed sources</Text>
              <Text style={styles.bodyCopy}>Selecting a source starts intake for that source. Removing it stops future capture.</Text>
            </View>
            <View style={styles.listGroup}>
              {["Bancolombia", "Davivienda", "Nequi"].map((source) => {
                const selected = selectedSources.has(source);
                return (
                  <Pressable key={source} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={() => { lightTap(); setSelectedSources((current) => { const next = new Set(current); if (next.has(source)) next.delete(source); else next.add(source); return next; }); }} style={styles.listRow}>
                    <Text style={styles.rowTitle}>{source}</Text>
                    <Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={24} color={selected ? theme.primary : theme.mutedForeground} />
                  </Pressable>
                );
              })}
            </View>
            <PrimaryButton label="Review Candidates" disabled={selectedSources.size === 0} onPress={() => setScreen("inbox")} styles={styles} />
          </>
        )}
      </>,
    );
  }

  if (screen === "edit" && selectedCandidate) {
    return shell(
      <CandidateForm candidate={selectedCandidate} warningViewed={warningViewed} onWarning={openWarning} onBack={() => setScreen("inbox")} onConfirm={() => confirmCandidate(selectedCandidate)} styles={styles} />,
    );
  }

  if (screen === "confirmed") {
    return shell(
      <View style={styles.completion}>
        <View style={styles.completionIcon}><Ionicons name="checkmark" size={30} color={theme.primaryForeground} /></View>
        <Text style={styles.completionTitle}>{confirmedCount === 1 ? "Record added" : `${confirmedCount} records added`}</Text>
        <Text style={styles.completionCopy}>The server validated and posted each record. Local notification content was deleted after acknowledgement.</Text>
        <PrimaryButton label="Back to Candidates" onPress={() => setScreen("inbox")} styles={styles} />
      </View>,
    );
  }

  if (screen === "warning") {
    return shell(
      <>
        <PageHeader title="Reconciliation warning" eyebrow="READ BEFORE USING INTAKE" onBack={() => { setWarningViewed(true); setScreen("inbox"); }} styles={styles} />
        <View style={styles.warningDetail}>
          <Ionicons name="alert-circle-outline" size={36} color={theme.foreground} />
          <Text style={styles.warningDetailTitle}>Notifications are a shortcut, not a statement</Text>
          <Text style={styles.warningDetailCopy}>Notification Intake may miss, delay, or duplicate activity. Reconcile against your financial accounts.</Text>
        </View>
        <View style={styles.warningFacts}>
          <Text style={styles.warningFact}>A missing notification can leave activity out.</Text>
          <Text style={styles.warningFact}>A delayed or repeated notification can create the wrong review queue.</Text>
          <Text style={styles.warningFact}>Only your account history can settle the difference.</Text>
        </View>
        <PrimaryButton label="I understand" onPress={() => { setWarningViewed(true); setScreen("inbox"); }} styles={styles} />
      </>,
    );
  }

  if (screen === "discard") {
    return shell(
      <>
        <PageHeader title="Discarded notifications" eyebrow="NOT SAVED AS CANDIDATES" onBack={() => setScreen("inbox")} styles={styles} />
        <Text style={styles.bodyCopy}>These notices contain no notification text. They disappear after 15 days.</Text>
        <View style={styles.discardList}>
          <DiscardDetail source="Daviplata" time="Today, 9:42 AM" reason="Missing amount or direction" styles={styles} />
          <DiscardDetail source="Nequi" time="Yesterday, 6:18 PM" reason="Security alert" styles={styles} />
        </View>
        <PrimaryButton label="OK" onPress={() => { setShowDiscardNotice(false); setScreen("inbox"); }} styles={styles} />
      </>,
    );
  }

  if (screen === "month-close") {
    return shell(
      <>
        <PageHeader title="Complete August" eyebrow="BEFORE YOU CONTINUE" onBack={() => setScreen("inbox")} styles={styles} />
        <View style={styles.monthCloseMessage}>
          <Text style={styles.monthCloseCount}>{candidates.length}</Text>
          <Text style={styles.monthCloseTitle}>local Candidates still need a decision</Text>
          <Text style={styles.monthCloseCopy}>Review any August activity now. Notification Intake is incomplete evidence, so this does not block Month Close.</Text>
        </View>
        <View style={styles.monthCloseActions}>
          <PrimaryButton label="Review Candidates" onPress={() => setScreen("inbox")} styles={styles} />
          <SecondaryButton label="Continue Month Close anyway" onPress={() => Alert.alert("Prototype", "Month Close would continue with the warning acknowledged.")} styles={styles} />
        </View>
      </>,
    );
  }

  return shell(
    <>
      {variant === "A" && (
        <QueueVariant candidates={candidates} ready={ready} expiring={expiring} showDiscardNotice={showDiscardNotice} warningViewed={warningViewed} onWarning={openWarning} onDiscard={() => setScreen("discard")} onOpen={openCandidate} onConfirmAll={confirmBatch} onManage={() => setScreen("sources")} onMonthClose={() => setScreen("month-close")} styles={styles} />
      )}
      {variant === "B" && (
        <UrgencyVariant candidates={candidates} ready={ready} needsReview={needsReview} expiring={expiring} showDiscardNotice={showDiscardNotice} warningViewed={warningViewed} onWarning={openWarning} onDiscard={() => setScreen("discard")} onOpen={openCandidate} onConfirmAll={confirmBatch} onManage={() => setScreen("sources")} onMonthClose={() => setScreen("month-close")} styles={styles} />
      )}
      {variant === "C" && (
        <BatchVariant ready={ready} needsReview={needsReview} selectedIds={selectedBatchIds} total={selectedTotal} showDiscardNotice={showDiscardNotice} warningViewed={warningViewed} onWarning={openWarning} onDiscard={() => setScreen("discard")} onToggle={toggleBatch} onOpen={openCandidate} onConfirm={confirmBatch} onManage={() => setScreen("sources")} onMonthClose={() => setScreen("month-close")} styles={styles} />
      )}
      {variant === "D" && (
        <RefinedPriorityVariant candidates={candidates} ready={ready} needsReview={needsReview} expiring={expiring} showDiscardNotice={showDiscardNotice} warningViewed={warningViewed} onWarning={openWarning} onDiscard={() => setScreen("discard")} onOpen={openCandidate} onConfirmAll={confirmBatch} onManage={() => setScreen("sources")} onMonthClose={() => setScreen("month-close")} styles={styles} />
      )}
    </>,
  );
}

function QueueVariant({ candidates, ready, expiring, showDiscardNotice, warningViewed, onWarning, onDiscard, onOpen, onConfirmAll, onManage, onMonthClose, styles }: InboxProps & { expiring: Candidate[] }) {
  const expiringIds = new Set(expiring.map((item) => item.id));
  const remaining = candidates.filter((item) => !expiringIds.has(item.id));
  return (
    <>
      <PageHeader title="Candidates" eyebrow={`${candidates.length} LOCAL ONLY`} action="Manage" onAction={onManage} styles={styles} />
      {!warningViewed && <WarningIconButton onPress={onWarning} styles={styles} />}
      <SummaryStrip items={[["Ready", ready.length], ["Needs review", candidates.length - ready.length], ["Expiring", expiring.length]]} styles={styles} />
      {expiring.length > 0 && <Section title="Expiring soon" detail="Final 3 days" styles={styles}><CandidateRow candidate={expiring[0]} onPress={() => onOpen(expiring[0])} urgent styles={styles} /></Section>}
      <Section title="Review queue" detail={`${remaining.length} remaining`} styles={styles}>{remaining.map((candidate) => <CandidateRow key={candidate.id} candidate={candidate} onPress={() => onOpen(candidate)} styles={styles} />)}</Section>
      {showDiscardNotice && <DiscardNotice onOpen={onDiscard} styles={styles} />}
      <PrimaryButton label={`Confirm ${ready.length} Ready`} disabled={ready.length === 0} onPress={onConfirmAll} styles={styles} />
      <FooterLinks onMonthClose={onMonthClose} styles={styles} />
    </>
  );
}

function UrgencyVariant({ candidates, ready, needsReview, expiring, showDiscardNotice, warningViewed, onWarning, onDiscard, onOpen, onConfirmAll, onManage, onMonthClose, styles }: InboxProps & { needsReview: Candidate[]; expiring: Candidate[] }) {
  const urgentIds = new Set([...expiring, ...needsReview].map((item) => item.id));
  const later = candidates.filter((item) => !urgentIds.has(item.id));
  return (
    <>
      <PageHeader title="Review first" eyebrow="NOTIFICATION INTAKE" action="Sources" onAction={onManage} styles={styles} />
      {!warningViewed && <WarningIconButton onPress={onWarning} styles={styles} />}
      <View style={styles.heroCard}><Text style={styles.heroKicker}>{ready.length} READY</Text><Text style={styles.heroAmount}>{money(ready.reduce((sum, item) => sum + item.amount, 0))}</Text><Text style={styles.heroBody}>Review urgent items below, or add every Ready Candidate now.</Text><PrimaryButton label="Confirm all Ready" disabled={ready.length === 0} onPress={onConfirmAll} styles={styles} /></View>
      <Section title="Needs you now" detail={`${urgentIds.size} items`} styles={styles}>{candidates.filter((item) => urgentIds.has(item.id)).map((candidate) => <CandidateRow key={candidate.id} candidate={candidate} onPress={() => onOpen(candidate)} urgent styles={styles} />)}</Section>
      <Section title="Can wait" detail={`${later.length} items`} styles={styles}>{later.map((candidate) => <CandidateRow key={candidate.id} candidate={candidate} onPress={() => onOpen(candidate)} styles={styles} />)}</Section>
      {showDiscardNotice && <DiscardNotice onOpen={onDiscard} styles={styles} />}
      <FooterLinks onMonthClose={onMonthClose} styles={styles} />
    </>
  );
}

function BatchVariant({ ready, needsReview, selectedIds, total, showDiscardNotice, warningViewed, onWarning, onDiscard, onToggle, onOpen, onConfirm, onManage, onMonthClose, styles }: Omit<InboxProps, "candidates" | "onConfirmAll"> & { needsReview: Candidate[]; selectedIds: Set<string>; total: number; onToggle: (id: string) => void; onConfirm: () => void }) {
  return (
    <>
      <PageHeader title="Confirm Candidates" eyebrow="BATCH REVIEW" action="Sources" onAction={onManage} styles={styles} />
      {!warningViewed && <WarningIconButton onPress={onWarning} styles={styles} />}
      <View style={styles.batchSummary}><View><Text style={styles.heroKicker}>{selectedIds.size} SELECTED</Text><Text style={styles.batchAmount}>{money(total)}</Text></View><Ionicons name="documents-outline" size={30} color="#6d28d9" /></View>
      <Section title="Ready to add" detail="Tap to include" styles={styles}>{ready.map((candidate) => <BatchRow key={candidate.id} candidate={candidate} selected={selectedIds.has(candidate.id)} onToggle={() => onToggle(candidate.id)} onOpen={() => onOpen(candidate)} styles={styles} />)}</Section>
      <Section title="Not included" detail="Needs review" styles={styles}>{needsReview.map((candidate) => <CandidateRow key={candidate.id} candidate={candidate} onPress={() => onOpen(candidate)} urgent styles={styles} />)}</Section>
      {showDiscardNotice && <DiscardNotice onOpen={onDiscard} styles={styles} />}
      <PrimaryButton label={`Confirm ${selectedIds.size} Candidates`} disabled={selectedIds.size === 0} onPress={onConfirm} styles={styles} />
      <FooterLinks onMonthClose={onMonthClose} styles={styles} />
    </>
  );
}

function RefinedPriorityVariant({ candidates, ready, needsReview, expiring, showDiscardNotice, warningViewed, onWarning, onDiscard, onOpen, onConfirmAll, onManage, onMonthClose, styles }: InboxProps & { needsReview: Candidate[]; expiring: Candidate[] }) {
  const priorityIds = new Set([...expiring, ...needsReview].map((item) => item.id));
  const priority = candidates.filter((item) => priorityIds.has(item.id));
  const later = candidates.filter((item) => !priorityIds.has(item.id));
  const readyTotal = ready.reduce((sum, item) => sum + item.amount, 0);

  return (
    <>
      <PageHeader title="Candidates" eyebrow="NOTIFICATION INTAKE" action="Sources" onAction={onManage} styles={styles} />
      {!warningViewed && <WarningIconButton onPress={onWarning} styles={styles} />}
      <View style={styles.refinedHero}>
        <Text style={styles.refinedKicker}>{ready.length} ready to add</Text>
        <Text style={styles.refinedAmount}>{money(readyTotal)}</Text>
        <Text style={styles.refinedBody}>Review the priority group first, or confirm every Ready Candidate.</Text>
      </View>
      <PrimaryButton label="Confirm all Ready" disabled={ready.length === 0} onPress={onConfirmAll} styles={styles} />
      <MinimalSection title="Needs you now" detail={`${priority.length} items`} styles={styles}>
        {priority.map((candidate) => (
          <MinimalCandidateRow key={candidate.id} candidate={candidate} onPress={() => onOpen(candidate)} styles={styles} />
        ))}
      </MinimalSection>
      <MinimalSection title="Can wait" detail={`${later.length} items`} styles={styles}>
        {later.map((candidate) => (
          <MinimalCandidateRow key={candidate.id} candidate={candidate} onPress={() => onOpen(candidate)} styles={styles} />
        ))}
      </MinimalSection>
      {showDiscardNotice && <DiscardNotice onOpen={onDiscard} styles={styles} />}
      <FooterLinks onMonthClose={onMonthClose} styles={styles} />
    </>
  );
}

type InboxProps = {
  candidates: Candidate[];
  ready: Candidate[];
  showDiscardNotice: boolean;
  warningViewed: boolean;
  onWarning: () => void;
  onDiscard: () => void;
  onOpen: (candidate: Candidate) => void;
  onConfirmAll: () => void;
  onManage: () => void;
  onMonthClose: () => void;
  styles: Styles;
};

function CandidateForm({ candidate, warningViewed, onWarning, onBack, onConfirm, styles }: { candidate: Candidate; warningViewed: boolean; onWarning: () => void; onBack: () => void; onConfirm: () => void; styles: Styles }) {
  const [description, setDescription] = useState(candidate.description);
  const [amount, setAmount] = useState(String(candidate.amount));
  const [category, setCategory] = useState(candidate.category);
  const [account, setAccount] = useState(candidate.account);
  const ready = Boolean(description.trim() && amount.trim() && category && account !== "Choose account");
  return (
    <>
      <PageHeader title="Add transaction" eyebrow="FROM LOCAL CANDIDATE" onBack={onBack} styles={styles} />
      <View style={styles.contextCard}><View style={styles.contextIcon}><Ionicons name="phone-portrait-outline" size={20} color="#6d28d9" /></View><View style={styles.flexCopy}><Text style={styles.rowTitle}>{candidate.source} · expires in {candidate.expiresInDays} days</Text><Text style={styles.muted}>Suggestions stay on this device until you confirm.</Text></View></View>
      {!warningViewed && <WarningIconButton onPress={onWarning} styles={styles} />}
      <View style={styles.fieldSection}><Text style={styles.fieldLabel}>Amount</Text><TextInput value={amount} onChangeText={setAmount} keyboardType="number-pad" style={styles.input} /><Text style={styles.fieldHint}>COP · Money out</Text></View>
      <View style={styles.fieldSection}><Text style={styles.fieldLabel}>Description</Text><TextInput value={description} onChangeText={setDescription} style={styles.input} /><Text style={styles.fieldLabel}>Date</Text><TextInput value={candidate.date} editable={false} style={[styles.input, styles.readonly]} /></View>
      <View style={styles.fieldSection}><Text style={styles.fieldLabel}>Account</Text><View style={styles.chipRow}>{["Daily account", "Digital wallet"].map((value) => <ChoiceChip key={value} label={value} selected={account === value} onPress={() => setAccount(value)} styles={styles} />)}</View><Text style={styles.fieldLabel}>Category</Text><View style={styles.chipRow}>{["Food", "Dining", "Health", "Transfer"].map((value) => <ChoiceChip key={value} label={value} selected={category === value} onPress={() => setCategory(value)} styles={styles} />)}</View></View>
      <PrimaryButton label="Confirm and add transaction" disabled={!ready} onPress={onConfirm} styles={styles} />
    </>
  );
}

function ServiceHealth({ selectedCount, styles }: { selectedCount: number; styles: Styles }) {
  const adapter = Platform.OS === "ios" ? "IOS AUTOMATION" : "ANDROID LISTENER";
  const listening = selectedCount > 0;
  return (
    <View style={styles.serviceHealth} accessibilityLiveRegion="polite">
      <Text style={styles.healthLabel}>{adapter}</Text>
      <Text style={styles.healthState}>{listening ? "Listening" : "Waiting for a source"}</Text>
      <Text style={styles.healthCheck}>Last health check · just now</Text>
    </View>
  );
}

function WarningIconButton({ onPress, styles }: { onPress: () => void; styles: Styles }) {
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
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
  };

  return (
    <View style={styles.warningIconSlot}>
      <Animated.View style={[styles.warningPulseRing, ringStyle]} />
      <Pressable accessibilityRole="button" accessibilityLabel="Open reconciliation warning" accessibilityHint="Explains why notification activity must be reconciled" onPress={onPress} style={({ pressed }) => [styles.warningIconButton, pressed && styles.pressed]}>
        <Ionicons name="warning" size={25} color="#9a3412" />
      </Pressable>
    </View>
  );
}

function DiscardNotice({ onOpen, styles }: { onOpen: () => void; styles: Styles }) {
  return <SecondaryButton label="Notifications discarded" onPress={onOpen} styles={styles} />;
}

function DiscardDetail({ source, time, reason, styles }: { source: string; time: string; reason: string; styles: Styles }) {
  return (
    <View style={styles.discardDetail}>
      <Text style={styles.rowTitle}>{source}</Text>
      <Text style={styles.muted}>{time}</Text>
      <Text style={styles.discardReason}>{reason}</Text>
    </View>
  );
}

function CandidateRow({ candidate, onPress, urgent = false, styles }: { candidate: Candidate; onPress: () => void; urgent?: boolean; styles: Styles }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Review ${candidate.description}`} onPress={onPress} style={({ pressed }) => [styles.candidateRow, urgent && styles.candidateRowUrgent, pressed && styles.pressed]}><View style={styles.flexCopy}><View style={styles.rowTopline}><Text style={styles.rowTitle}>{candidate.description}</Text>{candidate.status === "ready" ? <Text style={styles.readyPill}>READY</Text> : <Text style={styles.reviewPill}>REVIEW</Text>}</View><Text style={styles.muted}>{candidate.source} · {candidate.account}</Text><Text style={candidate.expiresInDays <= 3 ? styles.expiryUrgent : styles.expiry}>Expires in {candidate.expiresInDays} days{candidate.issue ? ` · ${candidate.issue}` : ""}</Text></View><Text style={styles.rowAmount}>{money(candidate.amount)}</Text><Ionicons name="chevron-forward" size={18} color="#737373" /></Pressable>;
}

function BatchRow({ candidate, selected, onToggle, onOpen, styles }: { candidate: Candidate; selected: boolean; onToggle: () => void; onOpen: () => void; styles: Styles }) {
  return <View style={styles.candidateRow}><Pressable accessibilityRole="checkbox" accessibilityLabel={`Include ${candidate.description}`} accessibilityState={{ checked: selected }} onPress={onToggle} hitSlop={8}><Ionicons name={selected ? "checkbox" : "square-outline"} size={26} color={selected ? "#6d28d9" : "#737373"} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Review ${candidate.description}`} onPress={onOpen} style={styles.flexCopy}><Text style={styles.rowTitle}>{candidate.description}</Text><Text style={styles.muted}>{candidate.account} · {candidate.category}</Text></Pressable><Text style={styles.rowAmount}>{money(candidate.amount)}</Text></View>;
}

function MinimalCandidateRow({ candidate, onPress, styles }: { candidate: Candidate; onPress: () => void; styles: Styles }) {
  const supporting = candidate.issue ?? candidate.account;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Review ${candidate.description}`} onPress={onPress} style={({ pressed }) => [styles.minimalRow, pressed && styles.pressed]}>
      <View style={styles.flexCopy}>
        <Text style={styles.rowTitle}>{candidate.description}</Text>
        <Text style={styles.muted}>{supporting}</Text>
      </View>
      <Text style={styles.rowAmount}>{money(candidate.amount)}</Text>
      <Ionicons name="chevron-forward" size={18} color="#737373" />
    </Pressable>
  );
}

function Section({ title, detail, children, styles }: { title: string; detail: string; children: React.ReactNode; styles: Styles }) {
  return <View style={styles.section}><View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionDetail}>{detail}</Text></View><View style={styles.listGroup}>{children}</View></View>;
}

function MinimalSection({ title, detail, children, styles }: { title: string; detail: string; children: React.ReactNode; styles: Styles }) {
  return <View style={styles.minimalSection}><View style={styles.minimalSectionHeader}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionDetail}>{detail}</Text></View><View style={styles.minimalList}>{children}</View></View>;
}

function SummaryStrip({ items, styles }: { items: [string, number][]; styles: Styles }) {
  return <View style={styles.summaryStrip}>{items.map(([label, value]) => <View key={label} style={styles.summaryItem}><Text style={styles.summaryValue}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></View>)}</View>;
}

function PageHeader({ title, eyebrow, onBack, action, onAction, styles }: { title: string; eyebrow: string; onBack?: () => void; action?: string; onAction?: () => void; styles: Styles }) {
  return <View style={styles.pageHeader}>{onBack && <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} style={styles.iconButton}><Ionicons name="chevron-back" size={24} color="#0a0a0a" /></Pressable>}<View style={styles.flexCopy}><Text style={styles.eyebrow}>{eyebrow}</Text><Text style={styles.pageTitle}>{title}</Text></View>{action && onAction && <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onAction} style={styles.headerAction}><Text style={styles.headerActionText}>{action}</Text></Pressable>}</View>;
}

function PrimaryButton({ label, onPress, disabled = false, styles }: { label: string; onPress: () => void; disabled?: boolean; styles: Styles }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPressIn={lightTap} onPress={onPress} style={({ pressed }) => [styles.primaryButton, disabled && styles.disabled, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>{label}</Text><Ionicons name="arrow-forward" size={20} color="#f5f3ff" /></Pressable>;
}

function SecondaryButton({ label, onPress, styles }: { label: string; onPress: () => void; styles: Styles }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryButtonText}>{label}</Text></Pressable>;
}

function ChoiceChip({ label, selected, onPress, styles }: { label: string; selected: boolean; onPress: () => void; styles: Styles }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={styles.chipText}>{label}</Text></Pressable>;
}

function FooterLinks({ onMonthClose, styles }: { onMonthClose: () => void; styles: Styles }) {
  return <Pressable accessibilityRole="button" onPress={onMonthClose} style={styles.footerLink}><Text style={styles.footerLinkText}>Preview Month Close warning</Text><Ionicons name="arrow-forward" size={16} color="#6d28d9" /></Pressable>;
}

function IntakeSwitcher({ current, onMove, styles }: { current: IntakeVariant; onMove: (direction: number) => void; styles: Styles }) {
  return <View style={styles.switcher}><Pressable accessibilityRole="button" onPress={() => onMove(-1)} accessibilityLabel="Previous intake variant" style={styles.switcherButton}><Ionicons name="chevron-back" size={24} color="#ffffff" /></Pressable><Text style={styles.switcherText}>{current} · {variantNames[current]}</Text><Pressable accessibilityRole="button" onPress={() => onMove(1)} accessibilityLabel="Next intake variant" style={styles.switcherButton}><Ionicons name="chevron-forward" size={24} color="#ffffff" /></Pressable></View>;
}

type Styles = ReturnType<typeof createStyles>;

function createStyles() {
  const theme = themes.light;
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: theme.background },
    page: { flexGrow: 1, gap: spacing.xl, paddingHorizontal: spacing.xxl, paddingTop: spacing.md, paddingBottom: 132, backgroundColor: theme.background },
    pageHeader: { minHeight: touchTarget, flexDirection: "row", alignItems: "center", gap: spacing.md },
    eyebrow: { color: theme.mutedForeground, fontSize: fontSize.label, fontFamily: font.bold, letterSpacing: 1 },
    pageTitle: { color: theme.foreground, fontSize: 32, lineHeight: 37, fontFamily: font.extrabold, letterSpacing: -0.7 },
    iconButton: { width: touchTarget, height: touchTarget, alignItems: "center", justifyContent: "center", borderRadius: radius.full, backgroundColor: theme.secondary },
    headerAction: { minHeight: touchTarget, justifyContent: "center", paddingHorizontal: spacing.sm },
    headerActionText: { color: theme.primary, fontSize: 15, fontFamily: font.bold },
    setupFlow: { gap: spacing.section, paddingTop: spacing.md },
    disclosureHero: { gap: spacing.lg, paddingVertical: spacing.xl },
    disclosureIcon: { width: 60, height: 60, alignItems: "center", justifyContent: "center", borderRadius: radius.full, backgroundColor: "#ede9fe" },
    disclosureTitle: { color: theme.foreground, fontSize: 24, lineHeight: 29, fontFamily: font.extrabold },
    disclosureCopy: { color: "#3f3f46", fontSize: fontSize.body, lineHeight: 24, fontFamily: font.regular },
    serviceHealth: { gap: spacing.xs, paddingVertical: spacing.xl, borderBottomWidth: 1, borderBottomColor: theme.border },
    healthLabel: { color: theme.mutedForeground, fontSize: fontSize.label, fontFamily: font.bold, letterSpacing: 1 },
    healthState: { color: theme.foreground, fontSize: 28, lineHeight: 33, fontFamily: font.extrabold },
    healthCheck: { color: theme.mutedForeground, fontSize: 14, lineHeight: 20, fontFamily: font.regular },
    warningIconSlot: { alignSelf: "center", width: 60, height: 60, alignItems: "center", justifyContent: "center" },
    warningPulseRing: { position: "absolute", width: 52, height: 52, borderRadius: radius.full, backgroundColor: "#fdba74", pointerEvents: "none" },
    warningIconButton: { width: 52, height: 52, alignItems: "center", justifyContent: "center", borderRadius: radius.full, borderWidth: 1, borderColor: "#fdba74", backgroundColor: "#ffedd5", shadowColor: "#9a3412", shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
    warningDetail: { gap: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.section },
    warningDetailTitle: { maxWidth: 330, color: theme.foreground, fontSize: 30, lineHeight: 36, fontFamily: font.extrabold },
    warningDetailCopy: { color: theme.foreground, fontSize: 18, lineHeight: 27, fontFamily: font.regular },
    warningFacts: { gap: spacing.lg, paddingVertical: spacing.xl, borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.border },
    warningFact: { color: theme.mutedForeground, fontSize: fontSize.body, lineHeight: 24, fontFamily: font.regular },
    summaryStrip: { flexDirection: "row", padding: spacing.sm, borderRadius: radius.lg, backgroundColor: theme.secondary },
    summaryItem: { flex: 1, alignItems: "center", gap: 2, paddingVertical: spacing.md, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: theme.ring },
    summaryValue: { color: theme.foreground, fontSize: 22, fontFamily: font.extrabold },
    summaryLabel: { color: theme.mutedForeground, fontSize: 12, fontFamily: font.medium },
    section: { gap: spacing.sm },
    sectionHeader: { minHeight: 32, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    sectionTitle: { color: theme.foreground, fontSize: fontSize.title, fontFamily: font.bold },
    sectionDetail: { color: theme.mutedForeground, fontSize: 13, fontFamily: font.medium },
    sectionCopy: { gap: spacing.sm },
    bodyCopy: { color: theme.mutedForeground, fontSize: fontSize.body, lineHeight: 24, fontFamily: font.regular },
    listGroup: { borderRadius: radius.lg, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border, overflow: "hidden" },
    listRow: { minHeight: 68, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
    candidateRow: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border, backgroundColor: theme.secondary },
    candidateRowUrgent: { backgroundColor: "#fff7ed" },
    rowTopline: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    rowTitle: { color: theme.foreground, fontSize: fontSize.body, fontFamily: font.semibold },
    rowAmount: { maxWidth: "34%", color: theme.foreground, fontSize: 14, fontFamily: font.bold, textAlign: "right" },
    readyPill: { color: theme.positive, fontSize: 10, fontFamily: font.bold, letterSpacing: 0.5 },
    reviewPill: { color: theme.warning, fontSize: 10, fontFamily: font.bold, letterSpacing: 0.5 },
    expiry: { color: theme.mutedForeground, fontSize: 12, fontFamily: font.medium },
    expiryUrgent: { color: theme.danger, fontSize: 12, fontFamily: font.bold },
    muted: { color: theme.mutedForeground, fontSize: 14, lineHeight: 20, fontFamily: font.regular },
    discardList: { gap: spacing.xxl, paddingVertical: spacing.lg },
    discardDetail: { gap: spacing.xs, paddingBottom: spacing.xl, borderBottomWidth: 1, borderBottomColor: theme.border },
    discardReason: { color: theme.foreground, fontSize: 15, lineHeight: 21, fontFamily: font.medium },
    heroCard: { gap: spacing.md, padding: spacing.xl, borderRadius: radius.xl, backgroundColor: "#18181b" },
    heroKicker: { color: "#a78bfa", fontSize: 12, fontFamily: font.bold, letterSpacing: 1 },
    heroAmount: { color: "#ffffff", fontSize: 34, fontFamily: font.extrabold },
    heroBody: { color: "#d4d4d8", fontSize: 14, lineHeight: 20, fontFamily: font.regular },
    refinedHero: { gap: spacing.sm, paddingTop: spacing.lg, paddingBottom: spacing.xl },
    refinedKicker: { color: theme.primary, fontSize: 14, fontFamily: font.bold },
    refinedAmount: { color: theme.foreground, fontSize: 38, lineHeight: 43, fontFamily: font.extrabold, letterSpacing: -0.8 },
    refinedBody: { maxWidth: 330, color: theme.mutedForeground, fontSize: 15, lineHeight: 22, fontFamily: font.regular },
    batchSummary: { minHeight: 104, flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.xl, borderRadius: radius.xl, backgroundColor: "#ede9fe" },
    batchAmount: { color: theme.foreground, fontSize: 30, fontFamily: font.extrabold },
    primaryButton: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingHorizontal: spacing.xl, borderRadius: radius.md, backgroundColor: theme.primary },
    primaryButtonText: { color: theme.primaryForeground, fontSize: fontSize.action, fontFamily: font.bold },
    secondaryButton: { minHeight: touchTarget, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: theme.border },
    secondaryButtonText: { color: theme.foreground, fontSize: fontSize.body, fontFamily: font.semibold },
    disabled: { opacity: 0.4 },
    pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
    footerLink: { minHeight: touchTarget, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
    footerLinkText: { color: theme.primary, fontSize: 14, fontFamily: font.semibold },
    contextCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, backgroundColor: "#ede9fe" },
    contextIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.full, backgroundColor: "#ffffff" },
    fieldSection: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: theme.secondary },
    fieldLabel: { color: theme.foreground, fontSize: 14, fontFamily: font.semibold },
    fieldHint: { color: theme.mutedForeground, fontSize: 13, fontFamily: font.medium },
    input: { minHeight: 52, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: theme.ring, color: theme.foreground, backgroundColor: theme.background, fontSize: fontSize.body, fontFamily: font.regular },
    readonly: { color: theme.mutedForeground },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: { minHeight: touchTarget, justifyContent: "center", paddingHorizontal: spacing.lg, borderRadius: radius.full, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.background },
    chipSelected: { borderColor: theme.primary, borderWidth: 2 },
    chipText: { color: theme.foreground, fontSize: 14, fontFamily: font.semibold },
    minimalSection: { gap: 0, borderRadius: radius.lg, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.secondary, overflow: "hidden" },
    minimalList: { borderTopWidth: 1, borderTopColor: theme.border },
    minimalRow: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
    minimalSectionHeader: { minHeight: 60, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg },
    monthCloseMessage: { gap: spacing.md, paddingTop: spacing.xl, paddingBottom: spacing.section },
    monthCloseCount: { color: theme.primary, fontSize: 64, lineHeight: 68, fontFamily: font.extrabold, letterSpacing: -2 },
    monthCloseTitle: { maxWidth: 330, color: theme.foreground, fontSize: 28, lineHeight: 34, fontFamily: font.extrabold },
    monthCloseCopy: { maxWidth: 340, color: theme.mutedForeground, fontSize: fontSize.body, lineHeight: 25, fontFamily: font.regular },
    monthCloseActions: { gap: spacing.lg, paddingTop: spacing.xl },
    flexCopy: { flex: 1, gap: spacing.xs },
    completion: { flex: 1, minHeight: 560, justifyContent: "center", alignItems: "center", gap: spacing.xl },
    completionIcon: { width: 68, height: 68, alignItems: "center", justifyContent: "center", borderRadius: radius.full, backgroundColor: theme.primary },
    completionTitle: { color: theme.foreground, fontSize: 30, lineHeight: 36, fontFamily: font.extrabold, textAlign: "center" },
    completionCopy: { maxWidth: 340, color: theme.mutedForeground, fontSize: fontSize.body, lineHeight: 24, fontFamily: font.regular, textAlign: "center" },
    switcher: { position: "absolute", left: 24, right: 24, bottom: Platform.OS === "web" ? 16 : 44, minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.sm, borderRadius: radius.full, backgroundColor: "#18181b", shadowColor: "#000000", shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
    switcherButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.full, backgroundColor: "#3f3f46" },
    switcherText: { flex: 1, color: "#ffffff", fontSize: 13, fontFamily: font.semibold, textAlign: "center" },
  });
}
