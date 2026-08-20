import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useMemo, useState } from "react";
import {
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
  type Theme,
  type ThemeMode,
} from "../theme/tokens";

type Screen =
  | "home"
  | "user"
  | "onboarding-kind"
  | "onboarding-currency"
  | "account-setup"
  | "onboarding-complete"
  | "drafts"
  | "draft-review"
  | "draft-posted"
  | "alerts"
  | "plans"
  | "recovery"
  | "recovery-contribution"
  | "recovery-contributed"
  | "recovery-candidates"
  | "recovery-plan-draft"
  | "recovery-plan-active"
  | "overview"
  | "account-detail"
  | "month-close"
  | "month-complete";

type SetupMode = "onboarding" | "add-account";
type WorkspaceKind = "Personal" | "Household";
type Currency = "COP" | "USD";

type Account = {
  id: string;
  name: string;
  kind: string;
  balance: number;
  currency: Currency;
};

type Draft = {
  id: string;
  description: string;
  amount: number;
  accountId: string;
  category: string;
  date: string;
};

type Activity = {
  id: string;
  description: string;
  amount: number;
  accountId: string;
  direction: "in" | "out";
  date: string;
};

const initialAccounts: Account[] = [
  {
    id: "daily",
    name: "Daily account",
    kind: "Checking",
    balance: 2450000,
    currency: "COP",
  },
  {
    id: "savings",
    name: "Savings",
    kind: "Savings",
    balance: 8920000,
    currency: "COP",
  },
  {
    id: "wallet",
    name: "Digital wallet",
    kind: "Wallet",
    balance: 340000,
    currency: "COP",
  },
];

const initialDrafts: Draft[] = [
  {
    id: "draft-groceries",
    description: "Groceries",
    amount: 126400,
    accountId: "daily",
    category: "Food",
    date: "August 19",
  },
  {
    id: "draft-electricity",
    description: "Electricity",
    amount: 184700,
    accountId: "daily",
    category: "Home",
    date: "August 18",
  },
  {
    id: "draft-transport",
    description: "Transport",
    amount: 38500,
    accountId: "wallet",
    category: "Transport",
    date: "August 18",
  },
];

const initialActivity: Activity[] = [
  {
    id: "activity-salary",
    description: "Salary deposit",
    amount: 4200000,
    accountId: "daily",
    direction: "in",
    date: "August 15",
  },
  {
    id: "activity-saving",
    description: "Transfer to savings",
    amount: 500000,
    accountId: "daily",
    direction: "out",
    date: "August 14",
  },
  {
    id: "activity-interest",
    description: "Interest earned",
    amount: 48500,
    accountId: "savings",
    direction: "in",
    date: "August 12",
  },
  {
    id: "activity-bus",
    description: "Bus fare",
    amount: 7200,
    accountId: "wallet",
    direction: "out",
    date: "August 11",
  },
];

const recoveryPrincipal = 3000000;
const recoveryDue = 300000;

function lightTap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

type Styles = ReturnType<typeof createStyles>;

function Header({
  title,
  styles,
  theme,
  onBack,
  eyebrow,
}: {
  title: string;
  styles: Styles;
  theme: Theme;
  onBack?: () => void;
  eyebrow?: string;
}) {
  return (
    <View style={styles.pageHeader}>
      {onBack && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          onPress={onBack}
          style={({ pressed }) => [
            styles.iconButton,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name="chevron-back" size={24} color={theme.foreground} />
        </Pressable>
      )}
      <View style={styles.headerCopy}>
        {eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
        <Text style={styles.pageTitle}>{title}</Text>
      </View>
    </View>
  );
}

function PrimaryButton({
  label,
  styles,
  onPress,
  disabled = false,
  icon = "arrow-forward",
}: {
  label: string;
  styles: Styles;
  onPress: () => void;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
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
      <Ionicons name={icon} size={20} color="#f5f3ff" />
    </Pressable>
  );
}

function SecondaryButton({
  label,
  styles,
  theme,
  onPress,
  icon,
}: {
  label: string;
  styles: Styles;
  theme: Theme;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPressIn={lightTap}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        pressed && styles.pressed,
      ]}
    >
      {icon && <Ionicons name={icon} size={20} color={theme.foreground} />}
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function Choice({
  label,
  detail,
  selected,
  styles,
  theme,
  onPress,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  styles: Styles;
  theme: Theme;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPressIn={lightTap}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        selected && styles.choiceSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{label}</Text>
        {detail && <Text style={styles.muted}>{detail}</Text>}
      </View>
      <Ionicons
        name={selected ? "checkmark-circle" : "ellipse-outline"}
        size={24}
        color={selected ? theme.primary : theme.mutedForeground}
      />
    </Pressable>
  );
}

function ListRow({
  title,
  detail,
  value,
  styles,
  theme,
  onPress,
  icon,
  tone,
}: {
  title: string;
  detail?: string;
  value?: string;
  styles: Styles;
  theme: Theme;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: "positive" | "warning";
}) {
  const content = (
    <>
      {icon && (
        <View style={styles.rowIcon}>
          <Ionicons name={icon} size={20} color={theme.foreground} />
        </View>
      )}
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        {detail && <Text style={styles.muted}>{detail}</Text>}
      </View>
      {value && (
        <Text
          style={[
            styles.rowValue,
            tone === "positive" && { color: theme.positive },
            tone === "warning" && { color: theme.warning },
          ]}
        >
          {value}
        </Text>
      )}
      {onPress && (
        <Ionicons
          name="chevron-forward"
          size={20}
          color={theme.mutedForeground}
        />
      )}
    </>
  );

  if (!onPress) {
    return <View style={styles.listRow}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPressIn={lightTap}
      onPress={onPress}
      style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

function ActionTile({
  label,
  detail,
  styles,
  theme,
  onPress,
  primary = false,
  badge,
  icon,
}: {
  label: string;
  detail?: string;
  styles: Styles;
  theme: Theme;
  onPress: () => void;
  primary?: boolean;
  badge?: number;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPressIn={lightTap}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionTile,
        primary && styles.actionTilePrimary,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons
        name={icon}
        size={26}
        color={primary ? theme.primaryForeground : theme.foreground}
      />
      <View style={styles.tileCopy}>
        <Text
          style={primary ? styles.tileTitlePrimary : styles.tileTitle}
        >
          {label}
        </Text>
        {detail && (
          <Text style={primary ? styles.tileDetailPrimary : styles.muted}>
            {detail}
          </Text>
        )}
      </View>
      {badge !== undefined && badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

function ProgressBar({
  progress,
  styles,
}: {
  progress: number;
  styles: Styles;
}) {
  return (
    <View style={styles.progressTrack}>
      <View
        style={[styles.progressFill, { width: `${Math.min(progress, 1) * 100}%` }]}
      />
    </View>
  );
}

export function VariantEWorkflow() {
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const theme = themes[themeMode];
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [stack, setStack] = useState<Screen[]>(["home"]);
  const screen = stack[stack.length - 1] ?? "home";

  const [workspaceKind, setWorkspaceKind] =
    useState<WorkspaceKind>("Personal");
  const [workspaceCurrency, setWorkspaceCurrency] = useState<Currency>("COP");
  const [setupKind, setSetupKind] = useState<WorkspaceKind>("Personal");
  const [setupCurrency, setSetupCurrency] = useState<Currency>("COP");
  const [setupMode, setSetupMode] = useState<SetupMode>("onboarding");
  const [accountName, setAccountName] = useState("Daily account");
  const [accountKind, setAccountKind] = useState("Checking");
  const [openingBalance, setOpeningBalance] = useState("2450000");

  const [accounts, setAccounts] = useState(initialAccounts);
  const [selectedAccountId, setSelectedAccountId] = useState("daily");
  const [drafts, setDrafts] = useState(initialDrafts);
  const [selectedDraftId, setSelectedDraftId] = useState(initialDrafts[0].id);
  const [lastPosted, setLastPosted] = useState<Draft | null>(null);
  const [activity, setActivity] = useState(initialActivity);
  const [paceOpen, setPaceOpen] = useState(false);
  const [monthComplete, setMonthComplete] = useState(false);
  const [recoveryContributed, setRecoveryContributed] = useState(1800000);
  const [newPlanActive, setNewPlanActive] = useState(false);
  const [planMonths, setPlanMonths] = useState<4 | 6>(4);

  const selectedDraft =
    drafts.find((draft) => draft.id === selectedDraftId) ?? drafts[0];
  const selectedAccount =
    accounts.find((account) => account.id === selectedAccountId) ?? accounts[0];
  const spentThisMonth = 2310000;
  const daysElapsed = 20;
  const daysInMonth = 31;
  const projectedSpend = Math.round(
    (spentThisMonth / daysElapsed) * daysInMonth,
  );
  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0);

  function money(amount: number, currency = workspaceCurrency) {
    return `${currency} ${amount.toLocaleString("es-CO")}`;
  }

  function go(next: Screen) {
    setStack((current) => [...current, next]);
  }

  function replace(next: Screen) {
    setStack((current) => [...current.slice(0, -1), next]);
  }

  function back() {
    setStack((current) =>
      current.length > 1 ? current.slice(0, -1) : current,
    );
  }

  function home() {
    setStack(["home"]);
  }

  function openDraft(draft: Draft) {
    setSelectedDraftId(draft.id);
    go("draft-review");
  }

  function postSelectedDraft() {
    if (!selectedDraft) return;
    setLastPosted(selectedDraft);
    setDrafts((current) =>
      current.filter((draft) => draft.id !== selectedDraft.id),
    );
    setActivity((current) => [
      {
        id: `posted-${selectedDraft.id}`,
        description: selectedDraft.description,
        amount: selectedDraft.amount,
        accountId: selectedDraft.accountId,
        direction: "out",
        date: "Today",
      },
      ...current,
    ]);
    replace("draft-posted");
  }

  function reviewNextDraft() {
    const nextDraft = drafts[0];
    if (!nextDraft) {
      setStack(["home", "month-close"]);
      return;
    }
    setSelectedDraftId(nextDraft.id);
    setStack(["home", "drafts", "draft-review"]);
  }

  function startOnboarding() {
    setSetupMode("onboarding");
    setSetupKind(workspaceKind);
    setSetupCurrency(workspaceCurrency);
    setAccountName("Daily account");
    setAccountKind("Checking");
    setOpeningBalance("2450000");
    setStack(["onboarding-kind"]);
  }

  function startAddAccount() {
    setSetupMode("add-account");
    setAccountName("New account");
    setAccountKind("Savings");
    setOpeningBalance("0");
    go("account-setup");
  }

  function finishAccountSetup() {
    const parsedBalance = Number(openingBalance.replace(/[^0-9.-]/g, "")) || 0;
    const nextAccount: Account = {
      id: setupMode === "onboarding" ? "daily" : `account-${accounts.length + 1}`,
      name: accountName.trim() || "New account",
      kind: accountKind,
      balance: parsedBalance,
      currency: setupMode === "onboarding" ? setupCurrency : workspaceCurrency,
    };

    if (setupMode === "onboarding") {
      setWorkspaceKind(setupKind);
      setWorkspaceCurrency(setupCurrency);
      setAccounts([nextAccount]);
      setDrafts(
        initialDrafts.map((draft) => ({ ...draft, accountId: "daily" })),
      );
      setActivity([]);
      replace("onboarding-complete");
    } else {
      setAccounts((current) => [...current, nextAccount]);
      setSelectedAccountId(nextAccount.id);
      replace("account-detail");
    }
  }

  function makeRecoveryContribution() {
    setRecoveryContributed((current) => current + recoveryDue);
    setActivity((current) => [
      {
        id: `recovery-out-${current.length}`,
        description: "Savings recovery transfer",
        amount: recoveryDue,
        accountId: "daily",
        direction: "out",
        date: "Today",
      },
      {
        id: `recovery-in-${current.length}`,
        description: "Savings recovery transfer",
        amount: recoveryDue,
        accountId: "savings",
        direction: "in",
        date: "Today",
      },
      ...current,
    ]);
    replace("recovery-contributed");
  }

  function resetPrototype() {
    setAccounts(initialAccounts);
    setDrafts(initialDrafts);
    setActivity(initialActivity);
    setMonthComplete(false);
    setRecoveryContributed(1800000);
    setNewPlanActive(false);
    setPaceOpen(false);
    home();
  }

  const shell = (content: React.ReactNode) => (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
        {content}
      </ScrollView>
    </SafeAreaView>
  );

  if (screen === "home") {
    const primaryLabel =
      drafts.length > 0
        ? "Drafts"
        : monthComplete
          ? "August complete"
          : "Complete month";
    const primaryDetail =
      drafts.length > 0
        ? `${drafts.length} to review`
        : monthComplete
          ? "Locked"
          : "Ready now";
    const primaryIcon =
      drafts.length > 0
        ? "document-text-outline"
        : monthComplete
          ? "checkmark-circle-outline"
          : "calendar-outline";

    return shell(
      <View style={styles.home}>
        <View style={styles.homeHeader}>
          <Text style={styles.eyebrow}>SPENT IN AUGUST</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open user and workspace"
            onPressIn={lightTap}
            onPress={() => go("user")}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="person-outline" size={22} color={theme.foreground} />
          </Pressable>
        </View>

        <View style={styles.spendingHero}>
          <Text style={styles.heroAmount}>{money(spentThisMonth)}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show month pace details"
            accessibilityState={{ expanded: paceOpen }}
            onPressIn={lightTap}
            onPress={() => setPaceOpen((current) => !current)}
            style={({ pressed }) => [
              styles.progressDisclosure,
              pressed && styles.pressed,
            ]}
          >
            <ProgressBar progress={daysElapsed / daysInMonth} styles={styles} />
            {paceOpen && (
              <View style={styles.legendRow}>
                <Text style={styles.muted}>Day {daysElapsed} of {daysInMonth}</Text>
                <Text style={styles.muted}>On pace for {money(projectedSpend)}</Text>
              </View>
            )}
          </Pressable>
        </View>

        <View style={styles.tileGrid}>
          <View style={styles.tileRow}>
            <ActionTile
              label={primaryLabel}
              detail={primaryDetail}
              badge={drafts.length || undefined}
              icon={primaryIcon}
              primary
              styles={styles}
              theme={theme}
              onPress={() =>
                drafts.length > 0
                  ? go("drafts")
                  : monthComplete
                    ? go("month-complete")
                    : go("month-close")
              }
            />
            <ActionTile
              label="Alerts"
              detail="3 updates"
              icon="notifications-outline"
              styles={styles}
              theme={theme}
              onPress={() => go("alerts")}
            />
          </View>
          <View style={styles.tileRow}>
            <ActionTile
              label="Plans"
              detail="Budget & recovery"
              icon="layers-outline"
              styles={styles}
              theme={theme}
              onPress={() => go("plans")}
            />
            <ActionTile
              label="Overview"
              detail="Accounts & activity"
              icon="pie-chart-outline"
              styles={styles}
              theme={theme}
              onPress={() => go("overview")}
            />
          </View>
        </View>
      </View>,
    );
  }

  if (screen === "user") {
    return shell(
      <>
        <Header title="Daniel" eyebrow="USER & WORKSPACE" onBack={back} styles={styles} theme={theme} />
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <View style={styles.segmented}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: themeMode === "light" }}
              onPressIn={lightTap}
              onPress={() => setThemeMode("light")}
              style={[styles.segment, themeMode === "light" && styles.segmentSelected]}
            >
              <Ionicons name="sunny-outline" size={20} color={theme.foreground} />
              <Text style={styles.segmentText}>Light</Text>
            </Pressable>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: themeMode === "dark" }}
              onPressIn={lightTap}
              onPress={() => setThemeMode("dark")}
              style={[styles.segment, themeMode === "dark" && styles.segmentSelected]}
            >
              <Ionicons name="moon-outline" size={20} color={theme.foreground} />
              <Text style={styles.segmentText}>Dark</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.listGroup}>
          <ListRow title="My finances" detail={`${workspaceKind} · ${workspaceCurrency}`} icon="home-outline" styles={styles} theme={theme} />
          <ListRow title="Financial accounts" detail={`${accounts.length} connected profiles`} icon="wallet-outline" onPress={() => go("overview")} styles={styles} theme={theme} />
        </View>
        <SecondaryButton label="Preview first-time setup" icon="play-outline" onPress={startOnboarding} styles={styles} theme={theme} />
        <SecondaryButton label="Reset prototype state" icon="refresh-outline" onPress={resetPrototype} styles={styles} theme={theme} />
        <View style={styles.prototypeState}>
          <Text style={styles.eyebrow}>PROTOTYPE STATE</Text>
          <Text style={styles.muted}>{drafts.length} Drafts · {monthComplete ? "August closed" : "August open"} · {money(recoveryContributed)} recovered</Text>
        </View>
      </>,
    );
  }

  if (screen === "onboarding-kind") {
    return shell(
      <>
        <Header title="Who are these finances for?" eyebrow="SETUP · 1 OF 3" styles={styles} theme={theme} />
        <Text style={styles.lede}>Choose the boundary you want to understand. You can invite people later.</Text>
        <View style={styles.choiceGroup}>
          <Choice label="Just me" detail="A Personal Workspace" selected={setupKind === "Personal"} onPress={() => setSetupKind("Personal")} styles={styles} theme={theme} />
          <Choice label="My household" detail="Shared household finances" selected={setupKind === "Household"} onPress={() => setSetupKind("Household")} styles={styles} theme={theme} />
        </View>
        <PrimaryButton label="Continue" onPress={() => go("onboarding-currency")} styles={styles} />
        <SecondaryButton label="Cancel preview" onPress={home} styles={styles} theme={theme} />
      </>,
    );
  }

  if (screen === "onboarding-currency") {
    return shell(
      <>
        <Header title="Choose your main currency" eyebrow="SETUP · 2 OF 3" onBack={back} styles={styles} theme={theme} />
        <Text style={styles.lede}>Balances and plans use this currency by default. Activity can still preserve another transaction currency.</Text>
        <View style={styles.choiceGroup}>
          <Choice label="Colombian peso" detail="COP · Recommended for your location" selected={setupCurrency === "COP"} onPress={() => setSetupCurrency("COP")} styles={styles} theme={theme} />
          <Choice label="US dollar" detail="USD" selected={setupCurrency === "USD"} onPress={() => setSetupCurrency("USD")} styles={styles} theme={theme} />
        </View>
        <PrimaryButton label="Continue" onPress={() => { setSetupMode("onboarding"); go("account-setup"); }} styles={styles} />
      </>,
    );
  }

  if (screen === "account-setup") {
    return shell(
      <>
        <Header
          title={setupMode === "onboarding" ? "Add your first account" : "Add financial account"}
          eyebrow={setupMode === "onboarding" ? "SETUP · 3 OF 3" : "FINANCIAL ACCOUNT"}
          onBack={back}
          styles={styles}
          theme={theme}
        />
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Name you recognize</Text>
          <TextInput accessibilityLabel="Account name" value={accountName} onChangeText={setAccountName} placeholder="Daily account" placeholderTextColor={theme.mutedForeground} style={styles.input} />
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Account type</Text>
          <View style={styles.chipRow}>
            {["Checking", "Savings", "Wallet"].map((kind) => (
              <Pressable
                key={kind}
                accessibilityRole="radio"
                accessibilityState={{ selected: accountKind === kind }}
                onPressIn={lightTap}
                onPress={() => setAccountKind(kind)}
                style={[styles.chip, accountKind === kind && styles.chipSelected]}
              >
                <Text style={styles.chipText}>{kind}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Balance today</Text>
          <TextInput accessibilityLabel="Balance today" value={openingBalance} onChangeText={setOpeningBalance} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.mutedForeground} style={styles.input} />
          <Text style={styles.muted}>We will start tracking from this amount; it is not editable history.</Text>
        </View>
        <PrimaryButton label={setupMode === "onboarding" ? "Finish setup" : "Add account"} icon="checkmark" onPress={finishAccountSetup} styles={styles} />
      </>,
    );
  }

  if (screen === "onboarding-complete") {
    return shell(
      <View style={styles.completion}>
        <View style={styles.completionIcon}><Ionicons name="checkmark" size={32} color={theme.primaryForeground} /></View>
        <Text style={styles.completionTitle}>Your workspace is ready</Text>
        <Text style={styles.completionCopy}>{workspaceKind} finances in {workspaceCurrency}, starting with {accountName}.</Text>
        <PrimaryButton label="Go to home" icon="home-outline" onPress={home} styles={styles} />
        <Text style={styles.prototypeNote}>Prototype only · changes live in memory</Text>
      </View>,
    );
  }

  if (screen === "drafts") {
    return shell(
      <>
        <Header title="Drafts" eyebrow={`${drafts.length} NEED REVIEW`} onBack={back} styles={styles} theme={theme} />
        <Text style={styles.lede}>Check what happened, then post it. Nothing here changes your balances until you confirm.</Text>
        <View style={styles.listGroup}>
          {drafts.length === 0 ? (
            <ListRow title="Review complete" detail="August is ready to close" icon="checkmark-circle-outline" value="Done" tone="positive" styles={styles} theme={theme} />
          ) : drafts.map((draft) => (
            <ListRow key={draft.id} title={draft.description} detail={`${draft.date} · ${draft.category}`} value={money(draft.amount)} onPress={() => openDraft(draft)} styles={styles} theme={theme} />
          ))}
        </View>
        {drafts.length > 0 ? (
          <PrimaryButton label="Review next Draft" onPress={() => openDraft(drafts[0])} styles={styles} />
        ) : (
          <PrimaryButton label="Continue to Month Close" icon="calendar-outline" onPress={() => go("month-close")} styles={styles} />
        )}
      </>,
    );
  }

  if (screen === "draft-review" && selectedDraft) {
    const account = accounts.find((item) => item.id === selectedDraft.accountId);
    return shell(
      <>
        <Header title="Review Draft" eyebrow="NOT POSTED YET" onBack={back} styles={styles} theme={theme} />
        <View style={styles.amountCard}>
          <Text style={styles.muted}>Money out</Text>
          <Text style={styles.detailAmount}>{money(selectedDraft.amount)}</Text>
          <Text style={styles.rowTitle}>{selectedDraft.description}</Text>
        </View>
        <View style={styles.listGroup}>
          <ListRow title="Account" value={account?.name ?? "Account"} styles={styles} theme={theme} />
          <ListRow title="Category" value={selectedDraft.category} styles={styles} theme={theme} />
          <ListRow title="Date" value={selectedDraft.date} styles={styles} theme={theme} />
        </View>
        <PrimaryButton label="Post entry" icon="checkmark" onPress={postSelectedDraft} styles={styles} />
        <SecondaryButton label="Keep as Draft" onPress={back} styles={styles} theme={theme} />
      </>,
    );
  }

  if (screen === "draft-posted") {
    return shell(
      <View style={styles.completion}>
        <View style={styles.completionIcon}><Ionicons name="checkmark" size={32} color={theme.primaryForeground} /></View>
        <Text style={styles.completionTitle}>{lastPosted?.description} posted</Text>
        <Text style={styles.completionCopy}>{drafts.length > 0 ? `${drafts.length} Draft${drafts.length === 1 ? "" : "s"} still need review.` : "All Drafts are reviewed. August is ready to close."}</Text>
        <PrimaryButton label={drafts.length > 0 ? "Review next Draft" : "Complete August"} icon={drafts.length > 0 ? "arrow-forward" : "calendar-outline"} onPress={reviewNextDraft} styles={styles} />
        <SecondaryButton label="Back home" onPress={home} styles={styles} theme={theme} />
      </View>,
    );
  }

  if (screen === "alerts") {
    return shell(
      <>
        <Header title="Alerts" eyebrow="WHAT NEEDS ATTENTION" onBack={back} styles={styles} theme={theme} />
        <View style={styles.listGroup}>
          <ListRow title={`${drafts.length} activities need review`} detail="Finish before completing August" icon="document-text-outline" value={drafts.length ? "Now" : "Done"} tone={drafts.length ? "warning" : "positive"} onPress={() => go(drafts.length ? "drafts" : "month-close")} styles={styles} theme={theme} />
          <ListRow title="Savings recovery due" detail={`${money(recoveryDue)} for August`} icon="trending-up-outline" value="This week" onPress={() => go("recovery")} styles={styles} theme={theme} />
          <ListRow title="Dining is moving faster" detail="COP 186,000 remains for 11 days" icon="restaurant-outline" value="Soon" onPress={() => go("plans")} styles={styles} theme={theme} />
        </View>
        <Text style={styles.prototypeNote}>Alerts point to an existing workflow; they do not invent a second place to act.</Text>
      </>,
    );
  }

  if (screen === "plans") {
    return shell(
      <>
        <Header title="Plans" eyebrow="LOOKING AHEAD" onBack={back} styles={styles} theme={theme} />
        <View style={styles.planCard}>
          <View style={styles.planHeader}><Text style={styles.sectionTitle}>August budget</Text><Text style={styles.statusPill}>On track</Text></View>
          <Text style={styles.detailAmount}>{money(2310000)}</Text>
          <Text style={styles.muted}>of {money(3400000)} planned</Text>
          <ProgressBar progress={2310000 / 3400000} styles={styles} />
        </View>
        <Pressable accessibilityRole="button" onPress={() => go("recovery")} style={({ pressed }) => [styles.planCard, pressed && styles.pressed]}>
          <View style={styles.planHeader}><Text style={styles.sectionTitle}>Savings recovery</Text><Ionicons name="chevron-forward" size={20} color={theme.mutedForeground} /></View>
          <Text style={styles.detailAmount}>{money(recoveryContributed)}</Text>
          <Text style={styles.muted}>of {money(recoveryPrincipal)} moved back to savings</Text>
          <ProgressBar progress={recoveryContributed / recoveryPrincipal} styles={styles} />
        </Pressable>
        {newPlanActive && <ListRow title="Laptop repair recovery" detail={`${planMonths} monthly contributions`} icon="checkmark-circle-outline" value="Active" tone="positive" onPress={() => go("recovery")} styles={styles} theme={theme} />}
        <SecondaryButton label="Find expenses to recover" icon="search-outline" onPress={() => go("recovery-candidates")} styles={styles} theme={theme} />
      </>,
    );
  }

  if (screen === "recovery") {
    const progress = recoveryContributed / recoveryPrincipal;
    return shell(
      <>
        <Header title="Savings recovery" eyebrow="EMERGENCY REPAIR" onBack={back} styles={styles} theme={theme} />
        <View style={styles.amountCard}>
          <Text style={styles.muted}>Recovered so far</Text>
          <Text style={styles.detailAmount}>{money(recoveryContributed)}</Text>
          <ProgressBar progress={progress} styles={styles} />
          <View style={styles.legendRow}><Text style={styles.muted}>{Math.round(progress * 100)}% complete</Text><Text style={styles.muted}>{money(recoveryPrincipal - recoveryContributed)} left</Text></View>
        </View>
        <View style={styles.listGroup}>
          <ListRow title="Due this month" value={money(recoveryDue)} tone="warning" styles={styles} theme={theme} />
          <ListRow title="Destination" value="Savings" styles={styles} theme={theme} />
          <ListRow title="Original plan" value="10 months" styles={styles} theme={theme} />
        </View>
        <PrimaryButton label="Move money for August" icon="swap-horizontal" onPress={() => go("recovery-contribution")} styles={styles} />
        <SecondaryButton label="Find another expense" onPress={() => go("recovery-candidates")} styles={styles} theme={theme} />
        <Text style={styles.prototypeNote}>Recovery is a saving plan. It does not undo the original expense or create money you owe yourself.</Text>
      </>,
    );
  }

  if (screen === "recovery-contribution") {
    return shell(
      <>
        <Header title="Move money" eyebrow="RECOVERY CONTRIBUTION" onBack={back} styles={styles} theme={theme} />
        <View style={styles.amountCard}><Text style={styles.muted}>Amount</Text><Text style={styles.detailAmount}>{money(recoveryDue)}</Text></View>
        <View style={styles.listGroup}>
          <ListRow title="From" value="Daily account" icon="arrow-up-circle-outline" styles={styles} theme={theme} />
          <ListRow title="To" value="Savings" icon="arrow-down-circle-outline" styles={styles} theme={theme} />
          <ListRow title="Counts toward" value="Emergency repair" icon="trending-up-outline" styles={styles} theme={theme} />
        </View>
        <PrimaryButton label="Post transfer" icon="checkmark" onPress={makeRecoveryContribution} styles={styles} />
        <Text style={styles.prototypeNote}>Progress changes only after this real account-to-account transfer posts.</Text>
      </>,
    );
  }

  if (screen === "recovery-contributed") {
    return shell(
      <View style={styles.completion}>
        <View style={styles.completionIcon}><Ionicons name="checkmark" size={32} color={theme.primaryForeground} /></View>
        <Text style={styles.completionTitle}>{money(recoveryDue)} moved</Text>
        <Text style={styles.completionCopy}>Your Emergency repair plan is now {Math.round((recoveryContributed / recoveryPrincipal) * 100)}% complete. The Savings account balance remains separate from plan progress.</Text>
        <PrimaryButton label="View recovery plan" icon="trending-up-outline" onPress={() => replace("recovery")} styles={styles} />
        <SecondaryButton label="Back home" onPress={home} styles={styles} theme={theme} />
      </View>,
    );
  }

  if (screen === "recovery-candidates") {
    return shell(
      <>
        <Header title="Expenses to recover" eyebrow="AUGUST CLOSE" onBack={back} styles={styles} theme={theme} />
        <Text style={styles.lede}>Choose an expense you want to replenish through future saving. The expense stays posted as it happened.</Text>
        <View style={styles.listGroup}>
          <ListRow title="Laptop repair" detail="August 9 · Technology" value={money(1200000)} onPress={() => go("recovery-plan-draft")} styles={styles} theme={theme} />
          <ListRow title="Dental care" detail="August 4 · Health" value={money(480000)} onPress={() => go("recovery-plan-draft")} styles={styles} theme={theme} />
          <ListRow title="Home appliance" detail="July 28 · Home" value={money(760000)} onPress={() => go("recovery-plan-draft")} styles={styles} theme={theme} />
        </View>
        <Text style={styles.prototypeNote}>You can recover now, defer to another close, or exclude an expense. No choice changes its accounting.</Text>
      </>,
    );
  }

  if (screen === "recovery-plan-draft") {
    return shell(
      <>
        <Header title="Plan the recovery" eyebrow="LAPTOP REPAIR · DRAFT" onBack={back} styles={styles} theme={theme} />
        <View style={styles.amountCard}><Text style={styles.muted}>Amount to replenish</Text><Text style={styles.detailAmount}>{money(1200000)}</Text></View>
        <View style={styles.choiceGroup}>
          <Choice label="4 months" detail={`${money(330000)} each · ${money(120000)} extra saving`} selected={planMonths === 4} onPress={() => setPlanMonths(4)} styles={styles} theme={theme} />
          <Choice label="6 months" detail={`${money(230000)} each · ${money(180000)} extra saving`} selected={planMonths === 6} onPress={() => setPlanMonths(6)} styles={styles} theme={theme} />
        </View>
        <ListRow title="Destination" value="Savings" icon="wallet-outline" styles={styles} theme={theme} />
        <PrimaryButton label="Activate plan" icon="checkmark" onPress={() => { setNewPlanActive(true); replace("recovery-plan-active"); }} styles={styles} />
        <Text style={styles.prototypeNote}>Activation fixes this schedule. Future changes cancel and replace the plan; completed saving stays in history.</Text>
      </>,
    );
  }

  if (screen === "recovery-plan-active") {
    return shell(
      <View style={styles.completion}>
        <View style={styles.completionIcon}><Ionicons name="checkmark" size={32} color={theme.primaryForeground} /></View>
        <Text style={styles.completionTitle}>Recovery plan active</Text>
        <Text style={styles.completionCopy}>Laptop repair will begin with a {money(planMonths === 4 ? 330000 : 230000)} contribution in August.</Text>
        <PrimaryButton label="View Plans" icon="layers-outline" onPress={() => setStack(["home", "plans"])} styles={styles} />
        <SecondaryButton label="Back home" onPress={home} styles={styles} theme={theme} />
      </View>,
    );
  }

  if (screen === "overview") {
    return shell(
      <>
        <Header title="Overview" eyebrow="BALANCES & ACTIVITY" onBack={back} styles={styles} theme={theme} />
        <View style={styles.amountCard}><Text style={styles.muted}>Across your accounts</Text><Text style={styles.detailAmount}>{money(totalBalance)}</Text></View>
        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Financial accounts</Text><Pressable accessibilityRole="button" onPressIn={lightTap} onPress={startAddAccount} style={styles.textActionButton}><Text style={styles.textAction}>+ Add</Text></Pressable></View>
        <View style={styles.listGroup}>
          {accounts.map((account) => (
            <ListRow key={account.id} title={account.name} detail={account.kind} value={money(account.balance, account.currency)} onPress={() => { setSelectedAccountId(account.id); go("account-detail"); }} styles={styles} theme={theme} />
          ))}
        </View>
        <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Recent activity</Text><Text style={styles.muted}>{activity.length} entries</Text></View>
        <View style={styles.listGroup}>
          {activity.slice(0, 4).map((item) => (
            <ListRow key={item.id} title={item.description} detail={item.date} value={`${item.direction === "in" ? "+" : "−"}${money(item.amount)}`} tone={item.direction === "in" ? "positive" : undefined} styles={styles} theme={theme} />
          ))}
        </View>
      </>,
    );
  }

  if (screen === "account-detail" && selectedAccount) {
    const accountActivity = activity.filter((item) => item.accountId === selectedAccount.id);
    return shell(
      <>
        <Header title={selectedAccount.name} eyebrow="FINANCIAL ACCOUNT" onBack={back} styles={styles} theme={theme} />
        <View style={styles.amountCard}><Text style={styles.muted}>Current balance</Text><Text style={styles.detailAmount}>{money(selectedAccount.balance, selectedAccount.currency)}</Text></View>
        <View style={styles.listGroup}>
          <ListRow title="Type" value={selectedAccount.kind} styles={styles} theme={theme} />
          <ListRow title="Currency" value={selectedAccount.currency} styles={styles} theme={theme} />
          <ListRow title="Tracking from" value="August 1" styles={styles} theme={theme} />
        </View>
        <Text style={styles.sectionTitle}>Recent activity</Text>
        <View style={styles.listGroup}>
          {accountActivity.length === 0 ? (
            <ListRow title="No activity yet" detail="New entries will appear here" icon="receipt-outline" styles={styles} theme={theme} />
          ) : accountActivity.slice(0, 3).map((item) => (
              <ListRow key={item.id} title={item.description} detail={item.date} value={`${item.direction === "in" ? "+" : "−"}${money(item.amount)}`} tone={item.direction === "in" ? "positive" : undefined} styles={styles} theme={theme} />
            ))}
        </View>
      </>,
    );
  }

  if (screen === "month-close") {
    const ready = drafts.length === 0;
    return shell(
      <>
        <Header title="Complete August" eyebrow={ready ? "READY TO REVIEW" : "1 STEP NEEDS ATTENTION"} onBack={back} styles={styles} theme={theme} />
        <View style={styles.amountCard}><Text style={styles.muted}>August spending</Text><Text style={styles.detailAmount}>{money(spentThisMonth)}</Text><Text style={styles.muted}>This review locks the month; it does not move money or change balances.</Text></View>
        <View style={styles.listGroup}>
          <ListRow title="Draft review" detail={drafts.length ? `${drafts.length} still need review` : "All reviewed"} icon={drafts.length ? "alert-circle-outline" : "checkmark-circle-outline"} value={drafts.length ? "Required" : "Done"} tone={drafts.length ? "warning" : "positive"} onPress={drafts.length ? () => go("drafts") : undefined} styles={styles} theme={theme} />
          <ListRow title="Account balances" detail={`${accounts.length} Financial Accounts checked`} icon="wallet-outline" value="Reviewed" tone="positive" onPress={() => go("overview")} styles={styles} theme={theme} />
          <ListRow title="Savings recovery" detail={`${money(recoveryDue)} due this month`} icon="trending-up-outline" value="Review" onPress={() => go("recovery")} styles={styles} theme={theme} />
        </View>
        <PrimaryButton label={ready ? "Complete and lock August" : "Review Drafts first"} icon={ready ? "lock-closed-outline" : "document-text-outline"} onPress={() => { if (ready) { setMonthComplete(true); replace("month-complete"); } else { go("drafts"); } }} styles={styles} />
        <Text style={styles.prototypeNote}>If recovery is not funded, Month Close records a planning shortfall; it never fabricates a transfer.</Text>
      </>,
    );
  }

  if (screen === "month-complete") {
    return shell(
      <View style={styles.completion}>
        <View style={styles.completionIcon}><Ionicons name="lock-closed" size={28} color={theme.primaryForeground} /></View>
        <Text style={styles.completionTitle}>August is complete</Text>
        <Text style={styles.completionCopy}>The month is locked. Balances and posted activity did not change because of the close itself.</Text>
        <PrimaryButton label="View August overview" icon="pie-chart-outline" onPress={() => setStack(["home", "overview"])} styles={styles} />
        <SecondaryButton label="Back home" onPress={home} styles={styles} theme={theme} />
      </View>,
    );
  }

  return null;
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: theme.background },
    page: {
      flexGrow: 1,
      gap: spacing.xl,
      paddingHorizontal: spacing.xxl,
      paddingTop: spacing.md,
      paddingBottom: 132,
      backgroundColor: theme.background,
    },
    home: { flex: 1, gap: spacing.section },
    homeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    pageHeader: { minHeight: touchTarget, flexDirection: "row", alignItems: "center", gap: spacing.md },
    headerCopy: { flex: 1, gap: spacing.xs },
    eyebrow: { color: theme.mutedForeground, fontSize: fontSize.label, fontFamily: font.bold, letterSpacing: 1 },
    pageTitle: { color: theme.foreground, fontSize: 32, lineHeight: 37, fontFamily: font.extrabold, letterSpacing: -0.7 },
    lede: { color: theme.mutedForeground, fontSize: fontSize.body, lineHeight: 24, fontFamily: font.regular },
    iconButton: { width: touchTarget, height: touchTarget, borderRadius: radius.full, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center" },
    spendingHero: { gap: spacing.lg, alignItems: "center", paddingVertical: spacing.lg },
    heroAmount: { color: theme.foreground, fontSize: fontSize.hero, lineHeight: 52, fontFamily: font.extrabold, letterSpacing: -1.2, textAlign: "center" },
    progressDisclosure: { alignSelf: "stretch", minHeight: touchTarget, justifyContent: "center", gap: spacing.md, paddingVertical: spacing.sm },
    progressTrack: { height: 6, borderRadius: radius.full, backgroundColor: theme.border, overflow: "hidden" },
    progressFill: { height: "100%", borderRadius: radius.full, backgroundColor: theme.primary },
    legendRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
    tileGrid: { flex: 1, minHeight: 340, gap: spacing.xl },
    tileRow: { flex: 1, flexDirection: "row", gap: spacing.xl },
    actionTile: { flex: 1, minHeight: 148, justifyContent: "space-between", padding: spacing.lg, borderRadius: radius.xl, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border },
    actionTilePrimary: { backgroundColor: theme.primary, borderColor: theme.primary },
    tileCopy: { gap: spacing.xs },
    tileTitle: { color: theme.foreground, fontSize: fontSize.action, fontFamily: font.bold },
    tileTitlePrimary: { color: theme.primaryForeground, fontSize: fontSize.action, fontFamily: font.bold },
    tileDetailPrimary: { color: theme.primaryForeground, opacity: 0.82, fontSize: fontSize.label, fontFamily: font.medium },
    badge: { position: "absolute", top: spacing.lg, right: spacing.lg, minWidth: 26, height: 26, paddingHorizontal: spacing.sm, borderRadius: radius.full, backgroundColor: theme.primaryForeground, alignItems: "center", justifyContent: "center" },
    badgeText: { color: theme.primary, fontSize: fontSize.label, fontFamily: font.bold },
    card: { gap: spacing.lg, padding: spacing.xl, borderRadius: radius.lg, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border },
    segmented: { flexDirection: "row", gap: spacing.sm, padding: spacing.xs, borderRadius: radius.md, backgroundColor: theme.background },
    segment: { flex: 1, minHeight: touchTarget, flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
    segmentSelected: { backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.ring },
    segmentText: { color: theme.foreground, fontSize: fontSize.body, fontFamily: font.medium },
    prototypeState: { gap: spacing.sm, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: theme.border },
    prototypeNote: { color: theme.mutedForeground, fontSize: 13, lineHeight: 19, fontFamily: font.regular, textAlign: "center" },
    choiceGroup: { gap: spacing.md },
    choice: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border },
    choiceSelected: { borderColor: theme.primary, borderWidth: 2 },
    primaryButton: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, paddingHorizontal: spacing.xl, borderRadius: radius.md, backgroundColor: theme.primary },
    primaryButtonText: { color: theme.primaryForeground, fontSize: fontSize.action, fontFamily: font.bold },
    secondaryButton: { minHeight: touchTarget, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.background },
    secondaryButtonText: { color: theme.foreground, fontSize: fontSize.body, fontFamily: font.semibold },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
    listGroup: { borderRadius: radius.lg, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border, overflow: "hidden" },
    listRow: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
    rowIcon: { width: 36, height: 36, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: theme.background },
    rowCopy: { flex: 1, gap: spacing.xs },
    rowTitle: { color: theme.foreground, fontSize: fontSize.body, fontFamily: font.semibold },
    rowValue: { maxWidth: "42%", color: theme.foreground, fontSize: 14, fontFamily: font.semibold, textAlign: "right" },
    muted: { color: theme.mutedForeground, fontSize: 14, lineHeight: 20, fontFamily: font.regular },
    fieldGroup: { gap: spacing.sm },
    fieldLabel: { color: theme.foreground, fontSize: 14, fontFamily: font.semibold },
    input: { minHeight: 56, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: theme.ring, color: theme.foreground, backgroundColor: theme.secondary, fontSize: fontSize.body, fontFamily: font.regular },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: { minHeight: touchTarget, justifyContent: "center", paddingHorizontal: spacing.lg, borderRadius: radius.full, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.secondary },
    chipSelected: { borderColor: theme.primary, borderWidth: 2 },
    chipText: { color: theme.foreground, fontSize: 14, fontFamily: font.semibold },
    completion: { flex: 1, minHeight: 560, justifyContent: "center", alignItems: "center", gap: spacing.xl },
    completionIcon: { width: 68, height: 68, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: theme.primary },
    completionTitle: { color: theme.foreground, fontSize: 30, lineHeight: 36, fontFamily: font.extrabold, textAlign: "center" },
    completionCopy: { maxWidth: 340, color: theme.mutedForeground, fontSize: fontSize.body, lineHeight: 24, fontFamily: font.regular, textAlign: "center" },
    amountCard: { gap: spacing.md, padding: spacing.xl, borderRadius: radius.lg, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border },
    detailAmount: { color: theme.foreground, fontSize: 30, lineHeight: 36, fontFamily: font.extrabold, letterSpacing: -0.6 },
    sectionHeader: { minHeight: touchTarget, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    sectionTitle: { color: theme.foreground, fontSize: fontSize.title, fontFamily: font.bold },
    textAction: { color: theme.primary, fontSize: fontSize.body, fontFamily: font.bold },
    textActionButton: { minWidth: touchTarget, minHeight: touchTarget, alignItems: "flex-end", justifyContent: "center" },
    planCard: { gap: spacing.md, padding: spacing.xl, borderRadius: radius.lg, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border },
    planHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
    statusPill: { color: theme.positive, fontSize: fontSize.label, fontFamily: font.bold, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.full, backgroundColor: theme.background },
  });
