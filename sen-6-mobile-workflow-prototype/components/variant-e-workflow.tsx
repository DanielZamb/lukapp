import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
import {
  DraftsInbox,
  initialCandidates,
  type Candidate,
} from "./drafts-inbox";
import {
  FirstTimeSetup,
  currencySymbol,
  paletteColor,
  starterLooks,
  type CategoryLook,
  type Currency,
  type SetupDraft,
  type WorkspaceKind,
} from "./first-time-setup";
import {
  BudgetComposer,
  CategoryCoin,
  CategoryLookPage,
  DoorAskSheet,
  LevelUnlocked,
  PlacesLookPage,
  compactAmount,
  lookFor,
  type BudgetMap,
  type DoorAsk,
  type DoorVariant,
} from "./level-1-door";
import { BudgetsView } from "./budgets-view";
import { CapitalFlow } from "./capital-flow";
import {
  AddPlaceSheet,
  ChooseActionSheet,
  EmojiSheet,
  kindEmoji,
} from "./home-sheets";
import { BatchNativeStack } from "./batch-native-stack";
import {
  canPostDraft,
  candidateFromDraft,
  CreateTxPrototype,
  draftFromCandidate,
  emptyTxDraft,
  formatOccurred,
  parseCopAmount,
  toDateKey,
  type ComposeMode,
  type QueuedTx,
  type TxDraft,
  type TxPlace,
} from "./create-tx-prototype";
import { TxHistory } from "./tx-history";
import {
  generatedHistory,
  inInMonth,
  spentInMonth,
  type Activity,
  type TxKind,
} from "./tx-history-data";

type Screen =
  | "home"
  | "user"
  | "onboarding"
  | "budget-setup"
  | "category-look"
  | "pool-look"
  | "budgets"
  | "level-unlocked"
  | "drafts"
  | "alerts"
  | "plans"
  | "recovery"
  | "recovery-contribution"
  | "recovery-contributed"
  | "recovery-candidates"
  | "recovery-plan-draft"
  | "recovery-plan-active"
  | "overview"
  | "tx-history"
  | "create-tx"
  | "account-detail"
  | "month-close"
  | "month-complete";

type Account = {
  id: string;
  name: string;
  kind: string;
  balance: number;
  currency: Currency;
  emoji: string;
};

const level0Account: Account = {
  id: "pool",
  name: "My money",
  kind: "Checking",
  balance: 8500000,
  currency: "COP",
  emoji: "💰",
};

// All ten starters so the bar chart can be judged crowded.
const level0Categories = [
  "Food",
  "Transport",
  "Dining",
  "Home",
  "Health",
  "Fun",
  "Shopping",
  "Bills",
  "Family",
  "Other",
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
  tone?: "positive" | "warning" | "in" | "out";
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
          numberOfLines={1}
          style={[
            styles.rowValue,
            tone === "positive" && { color: theme.positive },
            tone === "warning" && { color: theme.warning },
            tone === "in" && { color: theme.primary },
            tone === "out" && { color: theme.foreground },
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
      accessibilityLabel={label}
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

export function VariantEWorkflow({
  doorVariant,
  openPlans = false,
}: {
  doorVariant: DoorVariant;
  openPlans?: boolean;
}) {
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const theme = themes[themeMode];
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [stack, setStack] = useState<Screen[]>(
    openPlans ? ["home", "plans", "budgets"] : ["home"],
  );
  const screen = stack[stack.length - 1] ?? "home";
  const [setupSession, setSetupSession] = useState(0);

  const [workspaceKind, setWorkspaceKind] =
    useState<WorkspaceKind>("Personal");
  const [workspaceCurrency, setWorkspaceCurrency] = useState<Currency>("COP");
  const [accountName, setAccountName] = useState("Savings");
  const [accountKind, setAccountKind] = useState("Savings");
  const [accountEmoji, setAccountEmoji] = useState("🏦");
  const [openingBalance, setOpeningBalance] = useState("2000000");
  const [historyPlaceId, setHistoryPlaceId] = useState<string | null>(null);
  const [homeSheet, setHomeSheet] = useState<"choose" | "place" | "emoji" | null>(
    null,
  );
  const [addPlaceFor, setAddPlaceFor] = useState<"place" | "destination" | null>(
    null,
  );
  const [emojiFrom, setEmojiFrom] = useState<"place" | "detail">("place");
  const [batchQueue, setBatchQueue] = useState<QueuedTx[]>([]);
  const [composeMode, setComposeMode] = useState<ComposeMode>("single");
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(
    null,
  );
  const [composeSession, setComposeSession] = useState(0);
  const [txDraft, setTxDraft] = useState<TxDraft>({
    amount: "",
    kind: "normal",
    category: "Food",
    placeId: "pool",
    toPlaceId: "",
    description: "",
    occurred: new Date(2026, 7, 23),
  });

  const [accounts, setAccounts] = useState<Account[]>([level0Account]);
  const [selectedAccountId, setSelectedAccountId] = useState("pool");
  const [candidates, setCandidates] = useState(initialCandidates);
  const [activity, setActivity] = useState(generatedHistory);
  const [userCategories, setUserCategories] = useState(level0Categories);
  const [categoryLooks, setCategoryLooks] = useState<Record<string, CategoryLook>>(
    { ...starterLooks },
  );
  const [notificationsAllowed, setNotificationsAllowed] = useState(false);
  const [wantsBudgets, setWantsBudgets] = useState(false);
  const [experienceLevel, setExperienceLevel] = useState<0 | 1>(
    openPlans ? 1 : 0,
  );
  const [budgets, setBudgets] = useState<BudgetMap>({});
  const [doorAsk, setDoorAsk] = useState<DoorAsk | null>(null);
  const [doorCategory, setDoorCategory] = useState("Food");
  const [unlockDoor, setUnlockDoor] = useState<"budget" | "account">("budget");
  const [unlockLimit, setUnlockLimit] = useState(0);
  const [overviewMode, setOverviewMode] = useState<"list" | "bars">("list");
  const [barsAsBudget, setBarsAsBudget] = useState(false);
  const [monthComplete, setMonthComplete] = useState(false);
  const [recoveryContributed, setRecoveryContributed] = useState(1800000);
  const [newPlanActive, setNewPlanActive] = useState(false);
  const [planMonths, setPlanMonths] = useState<4 | 6>(4);

  const selectedAccount =
    accounts.find((account) => account.id === selectedAccountId) ?? accounts[0];
  const spentThisMonth = spentInMonth(activity);
  const moneyInThisMonth = inInMonth(activity);
  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0);

  function categorySpent(category: string) {
    return spentInMonth(activity, category);
  }

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

  function accountIdFromName(name: string) {
    return accounts.find((account) => account.name === name)?.id ?? accounts[0]?.id ?? "pool";
  }

  function postCandidates(posted: Candidate[]) {
    setActivity((current) => [
      ...posted.map((candidate) => ({
        id: `posted-${candidate.id}`,
        description: candidate.description,
        amount: candidate.amount,
        accountId: accountIdFromName(candidate.account),
        category: candidate.category,
        direction: "out" as const,
        date: "August 23",
        dateKey: "2026-08-23",
      })),
      ...current,
    ]);
  }

  useEffect(() => {
    setDoorAsk(null);
    setStack((current) => {
      const top = current[current.length - 1];
      if (
        top === "budget-setup" ||
        top === "category-look" ||
        top === "pool-look" ||
        top === "level-unlocked"
      ) {
        return ["home"];
      }
      return current;
    });
  }, [doorVariant]);

  function startOnboarding() {
    setSetupSession((current) => current + 1);
    setStack(["onboarding"]);
  }

  function startAddAccount() {
    setAccountName("Savings");
    setAccountKind("Savings");
    setAccountEmoji("🏦");
    setOpeningBalance("2000000");
    setHomeSheet("place");
  }

  function startAddPlaceFromTx(field: "place" | "destination") {
    setAddPlaceFor(field);
    startAddAccount();
  }

  function seedPlaces(): Account[] {
    const extras: Account[] = [
      {
        id: "savings",
        name: "Savings",
        kind: "Savings",
        balance: 4200000,
        currency: workspaceCurrency,
        emoji: "🏦",
      },
      {
        id: "wallet",
        name: "Wallet",
        kind: "Wallet",
        balance: 180000,
        currency: workspaceCurrency,
        emoji: "👛",
      },
      {
        id: "nequi",
        name: "Nequi",
        kind: "Checking",
        balance: 950000,
        currency: workspaceCurrency,
        emoji: "💳",
      },
    ];
    const ids = new Set(accounts.map((account) => account.id));
    const next = [...accounts, ...extras.filter((entry) => !ids.has(entry.id))];
    setAccounts(next);
    return next;
  }

  function placesOf(list: Account[] = accounts): TxPlace[] {
    return list.map((account) => ({
      id: account.id,
      name: account.name,
      emoji: account.emoji,
    }));
  }

  function resetComposer(placeId = selectedAccountId) {
    setTxDraft({
      ...emptyTxDraft(placeId),
      category: userCategories[0] ?? "Food",
    });
    setEditingCandidateId(null);
    setComposeSession((current) => current + 1);
  }

  function consumePosted(ids: string[]) {
    const gone = new Set(ids);
    setCandidates((current) => current.filter((item) => !gone.has(item.id)));
    setBatchQueue((current) => current.filter((item) => !gone.has(item.id)));
  }

  function startTxDraft() {
    seedPlaces();
    resetComposer();
    setComposeMode("single");
    setHomeSheet(null);
    go("create-tx");
  }

  function openDraftForPosting(candidate: Candidate) {
    const nextAccounts = seedPlaces();
    setTxDraft(draftFromCandidate(candidate, placesOf(nextAccounts)));
    setEditingCandidateId(candidate.id);
    setComposeSession((current) => current + 1);
    setComposeMode("single");
    setHomeSheet(null);
    go("create-tx");
  }

  function switchComposeMode(next: ComposeMode) {
    if (next === "batch" && composeMode === "single" && canPostDraft(txDraft)) {
      keepCurrent();
    }
    setComposeMode(next);
  }

  function collectPost(draft: TxDraft): {
    rows: Activity[];
    deltas: Record<string, number>;
  } | null {
    const signed = parseCopAmount(draft.amount);
    if (!canPostDraft(draft) || signed === 0) {
      return null;
    }
    const amount = Math.abs(signed);
    const date = formatOccurred(draft.occurred);
    const dateKey = toDateKey(draft.occurred);
    const kind: TxKind = draft.kind;
    const stamp = `${dateKey}-${draft.description}-${Math.random().toString(36).slice(2, 7)}`;

    if (kind === "transfer") {
      return {
        rows: [
          {
            id: `manual-out-${stamp}`,
            description: draft.description.trim(),
            amount,
            accountId: draft.placeId,
            category: draft.category,
            direction: "out",
            date,
            dateKey,
            kind,
          },
          {
            id: `manual-in-${stamp}`,
            description: draft.description.trim(),
            amount,
            accountId: draft.toPlaceId,
            category: draft.category,
            direction: "in",
            date,
            dateKey,
            kind,
          },
        ],
        deltas: {
          [draft.placeId]: -amount,
          [draft.toPlaceId]: amount,
        },
      };
    }

    const direction = signed < 0 ? "out" : "in";
    return {
      rows: [
        {
          id: `manual-${stamp}`,
          description: draft.description.trim(),
          amount,
          accountId: draft.placeId,
          category: kind === "opening" ? "Opening" : draft.category,
          direction,
          date,
          dateKey,
          kind,
        },
      ],
      deltas: {
        [draft.placeId]: direction === "in" ? amount : -amount,
      },
    };
  }

  function commitPosts(drafts: TxDraft[], ids: string[] = []) {
    const collected = drafts.map((draft) => collectPost(draft));
    if (collected.some((entry) => entry == null)) {
      return false;
    }
    const rows = collected.flatMap((entry) => entry?.rows ?? []);
    const deltas: Record<string, number> = {};
    for (const entry of collected) {
      if (!entry) {
        continue;
      }
      for (const [id, delta] of Object.entries(entry.deltas)) {
        deltas[id] = (deltas[id] ?? 0) + delta;
      }
    }
    setActivity((current) => [...rows, ...current]);
    setAccounts((current) =>
      current.map((account) =>
        deltas[account.id] != null
          ? { ...account, balance: account.balance + (deltas[account.id] ?? 0) }
          : account,
      ),
    );
    consumePosted(ids);
    return true;
  }

  function postTx() {
    const id = editingCandidateId ?? `live-${Date.now()}`;
    return commitPosts([txDraft], [id]);
  }

  function keepCurrent() {
    if (!canPostDraft(txDraft)) {
      return false;
    }
    const id = editingCandidateId ?? `manual-${Date.now()}`;
    const places = placesOf();
    const candidate = candidateFromDraft(txDraft, places, id);
    setCandidates((current) => {
      const without = current.filter((item) => item.id !== id);
      return [candidate, ...without];
    });
    setBatchQueue((current) => {
      const without = current.filter((item) => item.id !== id);
      return [...without, { id, draft: txDraft }];
    });
    resetComposer();
    return true;
  }

  function postAllQueued() {
    const items = [...batchQueue];
    if (canPostDraft(txDraft)) {
      const id = editingCandidateId ?? `live-${Date.now()}`;
      items.push({ id, draft: txDraft });
    }
    if (items.length === 0) {
      return false;
    }
    const ok = commitPosts(
      items.map((item) => item.draft),
      items.map((item) => item.id),
    );
    if (ok) {
      setBatchQueue([]);
      resetComposer();
    }
    return ok;
  }

  function openQueued(id: string) {
    const item = batchQueue.find((entry) => entry.id === id);
    if (!item) {
      return;
    }
    if (canPostDraft(txDraft) || txDraft.description.trim()) {
      const currentId = editingCandidateId ?? `live-${Date.now()}`;
      setBatchQueue((current) => [
        ...current.filter((entry) => entry.id !== id && entry.id !== currentId),
        { id: currentId, draft: txDraft },
      ]);
    } else {
      setBatchQueue((current) => current.filter((entry) => entry.id !== id));
    }
    setEditingCandidateId(id);
    setTxDraft(item.draft);
    setComposeSession((current) => current + 1);
  }

  function removeQueued(id: string) {
    setBatchQueue((current) => current.filter((entry) => entry.id !== id));
  }

  function openPlaceHistory(id: string) {
    setHistoryPlaceId(id);
    go("tx-history");
  }

  function openAllHistory() {
    setHistoryPlaceId(null);
    go("tx-history");
  }

  function openBudgetDoor(category: string) {
    setDoorCategory(category);
    setDoorAsk(null);
    if (doorVariant === "A" && experienceLevel === 0) {
      setDoorAsk({ kind: "budget", category });
      return;
    }
    if (doorVariant === "C") {
      go("category-look");
      return;
    }
    go("budget-setup");
  }

  function openAccountDoor() {
    setDoorAsk(null);
    go("pool-look");
  }

  function acceptDoorAsk() {
    if (!doorAsk) {
      return;
    }
    if (doorAsk.kind === "budget") {
      setDoorCategory(doorAsk.category);
      setDoorAsk(null);
      go("budget-setup");
      return;
    }
    setDoorAsk(null);
    startAddAccount();
  }

  function saveBudget(limit: number) {
    const wasLocked = experienceLevel === 0;
    setBudgets((current) => ({ ...current, [doorCategory]: limit }));
    setUnlockDoor("budget");
    setUnlockLimit(limit);
    if (wasLocked) {
      setExperienceLevel(1);
      replace("level-unlocked");
      return;
    }
    home();
  }

  function commitOnboarding(setup: SetupDraft) {
    const parsedBalance = Number(setup.startingAmount.replace(/[^0-9.-]/g, "")) || 0;
    const nextAccount: Account = {
      id: "pool",
      name: "My money",
      kind: "Checking",
      balance: parsedBalance,
      currency: setup.currency,
      emoji: "💰",
    };
    setWorkspaceKind("Personal");
    setWorkspaceCurrency(setup.currency);
    setAccounts([nextAccount]);
    setSelectedAccountId(nextAccount.id);
    setUserCategories(setup.categories);
    setCategoryLooks(setup.categoryLooks);
    setNotificationsAllowed(setup.notifications === true);
    setWantsBudgets(setup.wantsBudgets);
    setExperienceLevel(0);
    setBudgets({});
    setDoorAsk(null);
    setCandidates(initialCandidates);
    setActivity(generatedHistory);
    setMonthComplete(false);
    setRecoveryContributed(1800000);
    setNewPlanActive(false);
  }

  function arriveHomeFromSetup() {
    home();
    if (wantsBudgets && experienceLevel === 0) {
      const category = userCategories[0];
      if (category) {
        openBudgetDoor(category);
      }
    }
  }

  function finishAccountSetup() {
    const parsedBalance = Number(openingBalance.replace(/[^0-9.-]/g, "")) || 0;
    const nextAccount: Account = {
      id: `account-${accounts.length + 1}`,
      name: accountName.trim() || "New account",
      kind: accountKind,
      balance: parsedBalance,
      currency: workspaceCurrency,
      emoji: accountEmoji || kindEmoji[accountKind] || "💳",
    };
    const wasLocked = experienceLevel === 0;
    const fromTx = addPlaceFor;
    setAccounts((current) => [...current, nextAccount]);
    setSelectedAccountId(nextAccount.id);
    setUnlockDoor("account");
    setHomeSheet(null);
    setAddPlaceFor(null);
    if (fromTx) {
      setTxDraft((current) => ({
        ...current,
        ...(fromTx === "destination"
          ? { toPlaceId: nextAccount.id }
          : { placeId: nextAccount.id }),
      }));
      return;
    }
    if (wasLocked) {
      setExperienceLevel(1);
      replace("level-unlocked");
      return;
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
        date: "August 23",
        category: "Other",
        dateKey: "2026-08-23",
      },
      {
        id: `recovery-in-${current.length}`,
        description: "Savings recovery transfer",
        amount: recoveryDue,
        accountId: "savings",
        direction: "in",
        date: "August 23",
        category: "Income",
        dateKey: "2026-08-23",
      },
      ...current,
    ]);
    replace("recovery-contributed");
  }

  function resetPrototype() {
    setAccounts([level0Account]);
    setSelectedAccountId("pool");
    setCandidates(initialCandidates);
    setActivity(generatedHistory);
    setMonthComplete(false);
    setRecoveryContributed(1800000);
    setNewPlanActive(false);
    setUserCategories(level0Categories);
    setCategoryLooks({ ...starterLooks });
    setNotificationsAllowed(false);
    setWantsBudgets(false);
    setExperienceLevel(0);
    setBudgets({});
    setDoorAsk(null);
    setOverviewMode("list");
    setBarsAsBudget(false);
    setHistoryPlaceId(null);
    setWorkspaceCurrency("COP");
    setBatchQueue([]);
    setEditingCandidateId(null);
    setComposeMode("single");
    home();
  }

  function closeEmojiSheet() {
    setHomeSheet(emojiFrom === "place" ? "place" : null);
  }

  function pickEmoji(next: string) {
    setAccountEmoji(next);
    if (emojiFrom === "detail") {
      setAccounts((current) =>
        current.map((account) =>
          account.id === selectedAccountId
            ? { ...account, emoji: next }
            : account,
        ),
      );
    }
  }

  const actionSheets = (
    <>
      {homeSheet === "choose" && (
        <ChooseActionSheet
          theme={theme}
          onPlace={startAddAccount}
          onTx={startTxDraft}
          onDismiss={() =>
            setHomeSheet((current) => (current === "choose" ? null : current))
          }
        />
      )}
      {homeSheet === "place" && (
        <AddPlaceSheet
          theme={theme}
          unlocking={experienceLevel === 0}
          name={accountName}
          kind={accountKind}
          emoji={accountEmoji}
          balance={openingBalance}
          onName={setAccountName}
          onKind={(kind) => {
            setAccountKind(kind);
            if (accountEmoji === kindEmoji[accountKind]) {
              setAccountEmoji(kindEmoji[kind] ?? "💳");
            }
          }}
          onOpenEmoji={() => {
            setEmojiFrom("place");
            setHomeSheet("emoji");
          }}
          onBalance={setOpeningBalance}
          onSave={finishAccountSetup}
          onDismiss={() => {
            setHomeSheet((current) => (current === "place" ? null : current));
            setAddPlaceFor(null);
          }}
        />
      )}
      {homeSheet === "emoji" && (
        <EmojiSheet
          theme={theme}
          emoji={
            emojiFrom === "detail"
              ? (selectedAccount?.emoji ?? accountEmoji)
              : accountEmoji
          }
          onPick={pickEmoji}
          onDismiss={closeEmojiSheet}
        />
      )}
    </>
  );

  // Categories past their limit, worst first. Drives both the header bell and
  // whether the home screen surfaces an alert at all.
  const overBudget = Object.entries(budgets)
    .filter(([name]) => userCategories.includes(name))
    .map(([name, limit]) => ({ name, over: categorySpent(name) - limit }))
    .filter((entry) => entry.over > 0)
    .sort((a, b) => b.over - a.over);

  const shell = (content: React.ReactNode, overlay?: React.ReactNode) => (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
      >
        {content}
      </ScrollView>
      {overlay}
      {actionSheets}
    </SafeAreaView>
  );

  if (screen === "home") {
    return shell(
      <View style={styles.home}>
        <View style={styles.homeHeader}>
          <Text style={styles.eyebrow}>THIS MONTH</Text>
          <View style={styles.headerActions}>
            {experienceLevel >= 1 && (
              <View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    overBudget.length > 0
                      ? `Alerts, ${overBudget.length} over the limit`
                      : "Alerts, nothing needs attention"
                  }
                  onPressIn={lightTap}
                  onPress={() => go("alerts")}
                  style={({ pressed }) => [
                    styles.iconButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name="notifications-outline"
                    size={22}
                    color={theme.foreground}
                  />
                </Pressable>
                {overBudget.length > 0 && (
                  <View style={styles.bellBadge} pointerEvents="none">
                    <Text style={styles.bellBadgeText}>
                      {overBudget.length}
                    </Text>
                  </View>
                )}
              </View>
            )}
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
              <Ionicons
                name="person-outline"
                size={22}
                color={theme.foreground}
              />
            </Pressable>
          </View>
        </View>

        <View style={styles.homeHero}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="See places"
            onPressIn={lightTap}
            onPress={openAccountDoor}
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            <Text style={styles.muted}>What you have now</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="What do you want to do?"
            onPressIn={lightTap}
            onPress={() => setHomeSheet("choose")}
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            <Text style={styles.heroAmount}>{money(totalBalance)}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="See places"
            onPressIn={lightTap}
            onPress={openAccountDoor}
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            <Text style={styles.muted}>
              {accounts.length === 1
                ? "One pool · See this place"
                : `Across ${accounts.length} places`}
            </Text>
          </Pressable>
        </View>

        {overBudget.length > 0 && (
          <Pressable
            accessibilityRole="button"
            onPressIn={lightTap}
            onPress={() => go("alerts")}
            style={({ pressed }) => [styles.alertRow, pressed && styles.pressed]}
          >
            <View style={styles.alertIcon}>
              <Ionicons name="alert-circle" size={20} color={theme.background} />
            </View>
            <View style={styles.rowCopy}>
              <Text style={styles.alertTitle}>
                {overBudget.length === 1
                  ? `${overBudget[0]?.name} is over its limit`
                  : `${overBudget.length} categories are over their limits`}
              </Text>
              <Text style={styles.alertDetail}>
                {money(overBudget.reduce((sum, item) => sum + item.over, 0))}{" "}
                {overBudget.length === 1 ? "over" : "over in total"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.warning} />
          </Pressable>
        )}

        <ActionTile
          label="Drafts"
          detail={
            candidates.length > 0
              ? `${candidates.length} to review`
              : "Nothing waiting"
          }
          badge={candidates.length || undefined}
          icon="document-text-outline"
          primary
          styles={styles}
          theme={theme}
          onPress={() => go("drafts")}
        />

        <ActionTile
          label="Overview"
          detail="This month, by category"
          icon="pie-chart-outline"
          styles={styles}
          theme={theme}
          onPress={() => go("overview")}
        />

        {experienceLevel >= 1 && (
          <ListRow
            title="Plans"
            detail="August budget and recovery"
            icon="layers-outline"
            onPress={() => go("plans")}
            styles={styles}
            theme={theme}
          />
        )}
      </View>,
      doorAsk && (
        <DoorAskSheet
          ask={doorAsk}
          look={lookFor(
            doorAsk.kind === "budget" ? doorAsk.category : "Other",
            categoryLooks,
          )}
          theme={theme}
          themeMode={themeMode}
          onAccept={acceptDoorAsk}
          onDismiss={() => setDoorAsk(null)}
        />
      ),
    );
  }

  if (screen === "user") {
    return shell(
      <>
        <Header title="Daniel" eyebrow="USER & WORKSPACE" onBack={back} styles={styles} theme={theme} />
        <View style={styles.openSection}>
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
          <ListRow
            title="My finances"
            detail={
              accounts.length === 1
                ? `${workspaceKind} · ${workspaceCurrency} · My money`
                : `${workspaceKind} · ${workspaceCurrency} · ${accounts.length} places`
            }
            icon="home-outline"
            onPress={openAccountDoor}
            styles={styles}
            theme={theme}
          />
          <ListRow
            title={notificationsAllowed ? "Drafts from purchase alerts" : "Manual drafts"}
            detail={userCategories.slice(0, 3).join(" · ") || "No categories yet"}
            icon="pricetag-outline"
            styles={styles}
            theme={theme}
          />
          {experienceLevel >= 1 && (
            <ListRow
              title="Plans"
              detail="August budget and recovery"
              icon="layers-outline"
              onPress={() => go("plans")}
              styles={styles}
              theme={theme}
            />
          )}
        </View>
        <SecondaryButton label="Start first-time setup again" icon="play-outline" onPress={startOnboarding} styles={styles} theme={theme} />
        <SecondaryButton label="Reset prototype state" icon="refresh-outline" onPress={resetPrototype} styles={styles} theme={theme} />
        <View style={styles.prototypeState}>
          <Text style={styles.eyebrow}>PROTOTYPE STATE</Text>
          <Text style={styles.muted}>
            level {experienceLevel} · door {doorVariant} · {candidates.length} drafts ·{" "}
            {Object.keys(budgets).length} limits · {accounts.length}{" "}
            {accounts.length === 1 ? "pool" : "places"} ·{" "}
            {monthComplete ? "August closed" : "August open"}
          </Text>
        </View>
      </>,
    );
  }

  if (screen === "onboarding") {
    return (
      <View style={{ flex: 1 }}>
        <FirstTimeSetup
          key={`D-${setupSession}`}
          variant="D"
          themeMode={themeMode}
          onCancel={home}
          onCommit={commitOnboarding}
          onHome={arriveHomeFromSetup}
        />
      </View>
    );
  }

  if (screen === "budget-setup") {
    return (
      <View style={{ flex: 1 }}>
        <BudgetComposer
          category={doorCategory}
          look={lookFor(doorCategory, categoryLooks)}
          spent={categorySpent(doorCategory)}
          currency={workspaceCurrency}
          theme={theme}
          themeMode={themeMode}
          unlocking={experienceLevel === 0}
          onBack={back}
          onSave={saveBudget}
        />
      </View>
    );
  }

  if (screen === "category-look") {
    return (
      <View style={{ flex: 1 }}>
        <CategoryLookPage
          category={doorCategory}
          look={lookFor(doorCategory, categoryLooks)}
          spent={categorySpent(doorCategory)}
          limit={budgets[doorCategory]}
          currency={workspaceCurrency}
          recent={activity
            .filter(
              (item) =>
                item.direction === "out" && item.category === doorCategory,
            )
            .slice(0, 3)
            .map((item) => ({
              id: item.id,
              description: item.description,
              amount: item.amount,
              date: item.date,
            }))}
          theme={theme}
          themeMode={themeMode}
          onBack={back}
          onSetLimit={() => replace("budget-setup")}
        />
      </View>
    );
  }

  if (screen === "pool-look") {
    return (
      <View style={{ flex: 1 }}>
        <PlacesLookPage
          accounts={accounts}
          currency={workspaceCurrency}
          theme={theme}
          onBack={back}
          onAddPlace={startAddAccount}
          onOpenPlace={(id) => {
            setSelectedAccountId(id);
            go("account-detail");
          }}
          onOpenHistory={openPlaceHistory}
        />
        {actionSheets}
      </View>
    );
  }

  if (screen === "budgets") {
    return (
      <View style={{ flex: 1 }}>
        <BudgetsView
          currency={workspaceCurrency}
          theme={theme}
          themeMode={themeMode}
          onBack={back}
        />
      </View>
    );
  }

  if (screen === "level-unlocked") {
    return (
      <View style={{ flex: 1 }}>
        <LevelUnlocked
          door={unlockDoor}
          category={doorCategory}
          look={lookFor(doorCategory, categoryLooks)}
          limit={unlockLimit}
          accountName={accountName}
          currency={workspaceCurrency}
          theme={theme}
          themeMode={themeMode}
          onHome={home}
        />
      </View>
    );
  }

  if (screen === "drafts") {
    return (
      <View style={{ flex: 1 }}>
      <DraftsInbox
        candidates={candidates}
        onChangeCandidates={setCandidates}
        onPosted={postCandidates}
        onReview={openDraftForPosting}
        onBack={back}
        onMonthClose={() => replace("month-close")}
        accountNames={accounts.map((account) => account.name)}
        currency={workspaceCurrency}
        theme={theme}
        themeMode={themeMode}
      />
      </View>
    );
  }

  if (screen === "alerts") {
    const budgetAlerts = userCategories
      .map((category) => ({
        category,
        spent: categorySpent(category),
        limit: budgets[category],
      }))
      .filter((item) => item.limit != null && item.spent > item.limit);
    return shell(
      <>
        <Header title="Alerts" eyebrow="WHAT NEEDS ATTENTION" onBack={back} styles={styles} theme={theme} />
        <View style={styles.listGroup}>
          {budgetAlerts.length === 0 ? (
            <ListRow
              title="Nothing crossed a line"
              detail="Limits are still holding"
              icon="checkmark-circle-outline"
              tone="positive"
              styles={styles}
              theme={theme}
            />
          ) : (
            budgetAlerts.map((item) => {
              const look = lookFor(item.category, categoryLooks);
              return (
                <ListRow
                  key={item.category}
                  title={`${look.emoji}  ${item.category} is over`}
                  detail={`${money(item.spent)} of ${money(item.limit ?? 0)}`}
                  icon="flag-outline"
                  value="Now"
                  tone="warning"
                  onPress={() => openBudgetDoor(item.category)}
                  styles={styles}
                  theme={theme}
                />
              );
            })
          )}
        </View>
        <Text style={styles.prototypeNote}>
          Level 1 alerts watch budget lines. Pace and recovery wait for level 2.
        </Text>
      </>,
    );
  }

  if (screen === "plans") {
    return shell(
      <>
        <Header title="Plans" eyebrow="LOOKING AHEAD" onBack={back} styles={styles} theme={theme} />
        <View style={styles.listGroup}>
          <ListRow
            title="August budget"
            detail="This month's limits"
            icon="flag-outline"
            onPress={() => go("budgets")}
            styles={styles}
            theme={theme}
          />
          <ListRow
            title="Savings recovery"
            detail="Emergency repair"
            icon="trending-up-outline"
            onPress={() => go("recovery")}
            styles={styles}
            theme={theme}
          />
        </View>
        <Text style={styles.prototypeNote}>
          Budget is the August plan. Recovery is a sibling destination. It is
          not a budget row.
        </Text>
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
    const categorySpend = userCategories
      .map((category) => ({
        category,
        amount: categorySpent(category),
        remaining:
          budgets[category] != null
            ? budgets[category] - categorySpent(category)
            : null,
      }))
      .sort((left, right) => right.amount - left.amount);
    const hasALimit = categorySpend.some((item) => item.remaining != null);
    const barRows = barsAsBudget
      ? [...categorySpend]
          .filter((item) => item.remaining != null)
          .sort((left, right) => {
            const leftRem = left.remaining ?? 0;
            const rightRem = right.remaining ?? 0;
            if (leftRem === rightRem) {
              return right.amount - left.amount;
            }
            return leftRem - rightRem;
          })
      : categorySpend;
    const maxSpend = Math.max(...categorySpend.map((item) => item.amount), 1);
    const symbol = currencySymbol(workspaceCurrency);

    return shell(
      <>
        <Header title="Overview" eyebrow="THIS MONTH" onBack={back} styles={styles} theme={theme} />
        <CapitalFlow
          out={spentThisMonth}
          inn={moneyInThisMonth}
          symbol={symbol}
          theme={theme}
        />

        <Pressable
          accessibilityRole="button"
          onPressIn={lightTap}
          onPress={openAllHistory}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>Go to tx history</Text>
          <Ionicons name="receipt-outline" size={20} color={theme.primaryForeground} />
        </Pressable>

        <View style={styles.viewToggle}>
          {(
            [
              { mode: "list", label: "List", icon: "list-outline" },
              { mode: "bars", label: "Bars", icon: "bar-chart-outline" },
            ] as const
          ).map((entry) => {
            const selected = overviewMode === entry.mode;
            return (
              <Pressable
                key={entry.mode}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPressIn={lightTap}
                onPress={() => {
                  setOverviewMode(entry.mode);
                  if (entry.mode !== "bars") {
                    setBarsAsBudget(false);
                  }
                }}
                style={[
                  styles.viewToggleSegment,
                  selected && styles.viewToggleSelected,
                ]}
              >
                <Ionicons
                  name={entry.icon}
                  size={17}
                  color={selected ? theme.foreground : theme.mutedForeground}
                />
                <Text
                  style={[
                    styles.viewToggleText,
                    selected && styles.viewToggleTextSelected,
                  ]}
                >
                  {entry.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {overviewMode === "list" ? (
          <View style={styles.listGroup}>
            {categorySpend.map((item) => {
              const look = lookFor(item.category, categoryLooks);
              const limit = budgets[item.category];
              const color = paletteColor(look.color, themeMode);
              const remaining = limit != null ? limit - item.amount : undefined;
              const over = remaining != null && remaining < 0;
              return (
                <Pressable
                  key={item.category}
                  accessibilityRole="button"
                  accessibilityLabel={item.category}
                  onPressIn={lightTap}
                  onPress={() => openBudgetDoor(item.category)}
                  style={({ pressed }) => [
                    styles.listRow,
                    pressed && styles.pressed,
                  ]}
                >
                  <CategoryCoin
                    emoji={look.emoji}
                    color={color}
                    emptyColor={theme.danger}
                    remaining={remaining}
                    limit={limit}
                  />
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>{item.category}</Text>
                  </View>
                  <View style={styles.rowTrail}>
                    <Text style={styles.trailValue} numberOfLines={1}>
                      {symbol}
                      {item.amount.toLocaleString("es-CO")}
                    </Text>
                    {remaining != null && (
                      <Text
                        style={[
                          styles.leftText,
                          { color: over ? theme.danger : color },
                        ]}
                      >
                        {over
                          ? `${compactAmount(-remaining)} over`
                          : `${compactAmount(remaining)} left`}
                      </Text>
                    )}
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={theme.mutedForeground}
                  />
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.barChart}>
            {barsAsBudget && (
              <Text style={styles.muted}>{"What's left"}</Text>
            )}
            {barRows.map((item) => {
              const look = lookFor(item.category, categoryLooks);
              const color = paletteColor(look.color, themeMode);
              const limit = budgets[item.category];
              const over = item.remaining != null && item.remaining < 0;
              const fill = barsAsBudget
                ? over || item.remaining == null || limit == null
                  ? 0
                  : (item.remaining / limit) * 100
                : (item.amount / maxSpend) * 100;
              const value = barsAsBudget
                ? item.remaining == null
                  ? "—"
                  : over
                    ? `${compactAmount(-item.remaining)} over`
                    : compactAmount(item.remaining)
                : compactAmount(item.amount);
              return (
                <Pressable
                  key={item.category}
                  accessibilityRole="button"
                  accessibilityLabel={
                    barsAsBudget
                      ? `${item.category}, what's left`
                      : item.category
                  }
                  onPressIn={lightTap}
                  onPress={() => {
                    if (!hasALimit) {
                      return;
                    }
                    setBarsAsBudget((current) => !current);
                  }}
                  style={({ pressed }) => [
                    styles.barBlock,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.barRow}>
                    <Text style={styles.barEmoji}>{look.emoji}</Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            width: `${Math.max(0, Math.min(fill, 100))}%`,
                            backgroundColor: barsAsBudget && over ? theme.danger : color,
                          },
                        ]}
                      />
                    </View>
                    <Text
                      style={[
                        styles.barValue,
                        barsAsBudget && over && { color: theme.danger },
                      ]}
                      numberOfLines={1}
                    >
                      {value}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </>,
    );
  }

  if (screen === "create-tx") {
    const reviewing = candidates.find((item) => item.id === editingCandidateId);
    const sourceNote = reviewing
      ? `From drafts · ${reviewing.source}`
      : undefined;
    const shared = {
      theme,
      themeMode,
      currency: workspaceCurrency,
      draft: txDraft,
      categories: userCategories,
      categoryLooks,
      places: placesOf(),
      sourceNote,
      onDraft: setTxDraft,
      onCategories: setUserCategories,
      onLooks: setCategoryLooks,
      onAddPlace: startAddPlaceFromTx,
      onBack: back,
    };
    return (
      <View style={{ flex: 1 }}>
        {composeMode === "batch" ? (
          <BatchNativeStack
            formKey={composeSession}
            queue={batchQueue}
            onKeep={keepCurrent}
            onPostAll={postAllQueued}
            onSelectQueued={openQueued}
            onRemoveQueued={removeQueued}
            composeMode={composeMode}
            onComposeMode={switchComposeMode}
            {...shared}
          />
        ) : (
          <CreateTxPrototype
            key={composeSession}
            composeMode={composeMode}
            onComposeMode={switchComposeMode}
            batchCount={batchQueue.length}
            onSave={postTx}
            {...shared}
          />
        )}
        {actionSheets}
      </View>
    );
  }

  if (screen === "tx-history") {
    return (
      <View style={{ flex: 1 }}>
        <TxHistory
          key={historyPlaceId ?? "all"}
          activity={activity}
          currency={workspaceCurrency}
          theme={theme}
          themeMode={themeMode}
          categoryLooks={categoryLooks}
          places={accounts.map((account) => ({
            id: account.id,
            name: account.name,
            emoji: account.emoji,
          }))}
          initialAccountIds={historyPlaceId ? [historyPlaceId] : []}
          onBack={back}
        />
      </View>
    );
  }

  if (screen === "account-detail" && selectedAccount) {
    const accountActivity = activity.filter((item) => item.accountId === selectedAccount.id);
    return shell(
      <>
        <Header title={selectedAccount.name} eyebrow="PLACE" onBack={back} styles={styles} theme={theme} />
        <View style={styles.openAmount}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change look"
            onPressIn={lightTap}
            onPress={() => {
              setAccountEmoji(selectedAccount.emoji);
              setEmojiFrom("detail");
              setHomeSheet("emoji");
            }}
            style={({ pressed }) => [pressed && styles.pressed]}
          >
            <Text style={styles.placeHeroEmoji}>{selectedAccount.emoji}</Text>
          </Pressable>
          <Text style={styles.muted}>Current balance</Text>
          <Text style={styles.detailAmount}>{money(selectedAccount.balance, selectedAccount.currency)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPressIn={lightTap}
          onPress={() => openPlaceHistory(selectedAccount.id)}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>See in tx history</Text>
          <Ionicons name="receipt-outline" size={20} color={theme.primaryForeground} />
        </Pressable>
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
              <ListRow key={item.id} title={item.description} detail={item.date} value={`${item.direction === "in" ? "+" : "−"}${money(item.amount)}`} tone={item.direction === "in" ? "in" : "out"} styles={styles} theme={theme} />
            ))}
        </View>
      </>,
    );
  }

  if (screen === "month-close") {
    return shell(
      <>
        <Header title="Complete August" eyebrow={candidates.length ? "CANDIDATES STILL LOCAL" : "READY TO REVIEW"} onBack={back} styles={styles} theme={theme} />
        <View style={styles.amountCard}><Text style={styles.muted}>August spending</Text><Text style={styles.detailAmount}>{money(spentThisMonth)}</Text><Text style={styles.muted}>This review locks the month; it does not move money or change balances.</Text></View>
        <View style={styles.listGroup}>
          <ListRow title="Notification Candidates" detail={candidates.length ? `${candidates.length} still local. Intake is not a statement.` : "None waiting"} icon={candidates.length ? "alert-circle-outline" : "checkmark-circle-outline"} value={candidates.length ? "Warns" : "Done"} tone={candidates.length ? "warning" : "positive"} onPress={candidates.length ? () => go("drafts") : undefined} styles={styles} theme={theme} />
          <ListRow title="Account balances" detail={`${accounts.length} Financial Accounts checked`} icon="wallet-outline" value="Reviewed" tone="positive" onPress={() => go("overview")} styles={styles} theme={theme} />
          <ListRow title="Savings recovery" detail={`${money(recoveryDue)} due this month`} icon="trending-up-outline" value="Review" onPress={() => go("recovery")} styles={styles} theme={theme} />
        </View>
        <PrimaryButton label="Complete and lock August" icon="lock-closed-outline" onPress={() => { setMonthComplete(true); replace("month-complete"); }} styles={styles} />
        <Text style={styles.prototypeNote}>Remaining Candidates warn. They do not block Month Close. If recovery is not funded, the close records a planning shortfall; it never fabricates a transfer.</Text>
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
    home: { flex: 1, gap: spacing.xl },
    homeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    bellBadge: {
      position: "absolute",
      top: -2,
      right: -2,
      minWidth: 20,
      height: 20,
      paddingHorizontal: 5,
      borderRadius: radius.full,
      backgroundColor: theme.warning,
      borderWidth: 2,
      borderColor: theme.background,
      alignItems: "center",
      justifyContent: "center",
    },
    bellBadgeText: {
      color: theme.background,
      fontSize: 11,
      fontFamily: font.bold,
    },
    alertRow: {
      minHeight: 72,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: `${theme.warning}1f`,
      borderWidth: 1,
      borderColor: `${theme.warning}4d`,
    },
    alertIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      backgroundColor: theme.warning,
      alignItems: "center",
      justifyContent: "center",
    },
    alertTitle: {
      color: theme.foreground,
      fontSize: fontSize.body,
      fontFamily: font.bold,
    },
    alertDetail: {
      color: theme.warning,
      fontSize: 14,
      fontFamily: font.semibold,
    },
    homeHero: { gap: spacing.xs },
    monthStory: { flexDirection: "row", gap: spacing.xs },
    storyPair: { flex: 1, gap: spacing.xs },
    barChart: { gap: spacing.xs },
    barBlock: { gap: 2 },
    barRow: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    barEmoji: {
      width: 32,
      fontSize: 21,
      textAlign: "center",
    },
    barTrack: {
      flex: 1,
      height: 20,
      borderRadius: radius.full,
      backgroundColor: theme.secondary,
      overflow: "hidden",
    },
    barFill: { height: "100%", borderRadius: radius.full },
    barValue: {
      minWidth: 56,
      maxWidth: 80,
      color: theme.foreground,
      fontSize: 12,
      fontFamily: font.bold,
      textAlign: "right",
    },
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
    openSection: { gap: spacing.lg },
    segmented: { flexDirection: "row", gap: spacing.sm, padding: spacing.xs, borderRadius: radius.md, backgroundColor: theme.background },
    segment: { flex: 1, minHeight: touchTarget, flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
    segmentSelected: { backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.ring },
    segmentText: { color: theme.foreground, fontSize: fontSize.body, fontFamily: font.medium },
    prototypeState: { gap: spacing.sm, paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: theme.border },
    viewToggle: {
      flexDirection: "row",
      gap: spacing.xs,
      padding: spacing.xs,
      borderRadius: radius.full,
      backgroundColor: theme.secondary,
      borderWidth: 1,
      borderColor: theme.border,
    },
    viewToggleSegment: {
      flex: 1,
      minHeight: touchTarget - 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      borderRadius: radius.full,
    },
    viewToggleSelected: {
      backgroundColor: theme.background,
      borderWidth: 1,
      borderColor: theme.border,
    },
    viewToggleText: {
      color: theme.mutedForeground,
      fontSize: fontSize.body,
      fontFamily: font.medium,
    },
    viewToggleTextSelected: { color: theme.foreground, fontFamily: font.bold },
    rowTrail: { alignItems: "flex-end", gap: 2 },
    trailValue: {
      color: theme.foreground,
      fontSize: 14,
      fontFamily: font.semibold,
      textAlign: "right",
    },
    leftText: { fontSize: fontSize.label, fontFamily: font.bold },
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
    categoryProgress: { gap: spacing.sm, paddingTop: spacing.xs },
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
    emojiChip: {
      width: touchTarget,
      height: touchTarget,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.secondary,
    },
    emojiChipText: { fontSize: 22 },
    placeHeroEmoji: { fontSize: 40, lineHeight: 48 },
    completion: { flex: 1, minHeight: 560, justifyContent: "center", alignItems: "center", gap: spacing.xl },
    completionIcon: { width: 68, height: 68, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: theme.primary },
    completionTitle: { color: theme.foreground, fontSize: 30, lineHeight: 36, fontFamily: font.extrabold, textAlign: "center" },
    completionCopy: { maxWidth: 340, color: theme.mutedForeground, fontSize: fontSize.body, lineHeight: 24, fontFamily: font.regular, textAlign: "center" },
    openAmount: { gap: spacing.sm, paddingVertical: spacing.md },
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
