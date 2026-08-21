import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  normalizePrototypeVariant,
  PrototypeSwitcher,
} from "../components/prototype-switcher"
import { VariantEWorkflow } from "../components/variant-e-workflow";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useMemo, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  font,
  fontSize,
  radius,
  spacing,
  type Theme,
  type ThemeMode,
} from "../theme/tokens";

const fixture = {
  workspace: {
    name: "My finances",
    type: "Personal",
    functionalCurrency: "COP",
  },
  accounts: [
    {
      id: "daily-account",
      name: "Daily account",
      balance: 2450000,
    },
    {
      id: "savings-account",
      name: "Savings",
      balance: 8920000,
    },
    {
      id: "digital-wallet",
      name: "Digital wallet",
      balance: 340000,
    },
    {
      id: "emergency-savings",
      name: "Emergency savings",
      balance: 12750000,
    },
    {
      id: "term-deposit",
      name: "Term deposit",
      balance: 6000000,
    },
  ],
  drafts: [
    {
      id: "drafts-1",
      description: "Groceries",
      amount: 126400,
      status: "Draft",
    },
    {
      id: "draft-2",
      description: "Rent",
      amount: 1250000,
      status: "Draft",
    },
    {
      id: "draft-3",
      description: "Electricity",
      amount: 184700,
      status: "Draft",
    },
    {
      id: "draft-4",
      description: "Mobile plan",
      amount: 62900,
      status: "Draft",
    },
    {
      id: "draft-5",
      description: "Transport",
      amount: 38500,
      status: "Draft",
    },
    {
      id: "draft-6",
      description: "Coffee",
      amount: 14800,
      status: "Draft",
    },
    {
      id: "draft-7",
      description: "Streaming",
      amount: 29900,
      status: "Draft",
    },
    {
      id: "draft-8",
      description: "Pharmacy",
      amount: 71300,
      status: "Draft",
    },
  ],
  recentActivity: [
    {
      id: "activity-1",
      accountId: "daily-account",
      description: "Salary deposit",
      amount: 4200000,
      direction: "in",
      status: "Posted",
    },
    {
      id: "activity-2",
      accountId: "daily-account",
      description: "Transfer to savings",
      amount: 500000,
      direction: "out",
      status: "Posted",
    },
    {
      id: "activity-3",
      accountId: "savings-account",
      description: "Transfer from daily account",
      amount: 500000,
      direction: "in",
      status: "Posted",
    },
    {
      id: "activity-4",
      accountId: "savings-account",
      description: "Interest earned",
      amount: 48500,
      direction: "in",
      status: "Posted",
    },
    {
      id: "activity-5",
      accountId: "daily-account",
      description: "Wallet top-up",
      amount: 200000,
      direction: "out",
      status: "Posted",
    },
    {
      id: "activity-6",
      accountId: "digital-wallet",
      description: "Wallet top-up",
      amount: 200000,
      direction: "in",
      status: "Posted",
    },
    {
      id: "activity-7",
      accountId: "savings-account",
      description: "Term deposit contribution",
      amount: 1000000,
      direction: "out",
      status: "Posted",
    },
    {
      id: "activity-8",
      accountId: "term-deposit",
      description: "Term deposit contribution",
      amount: 1000000,
      direction: "in",
      status: "Posted",
    },
    {
      id: "activity-9",
      accountId: "digital-wallet",
      description: "Bus fare",
      amount: 7200,
      direction: "out",
      status: "Posted",
    },
    {
      id: "activity-10",
      accountId: "daily-account",
      description: "Emergency savings transfer",
      amount: 250000,
      direction: "out",
      status: "Posted",
    },
    {
      id: "activity-11",
      accountId: "emergency-savings",
      description: "Emergency savings transfer",
      amount: 250000,
      direction: "in",
      status: "Posted",
    },
  ],
  plans: [
    {
      id: "month-close",
      name: "August close",
      progressLabel: "3 of 5 steps complete",
      progress: 0.6,
      nextAction: "Review 8 Drafts",
    },
    {
      id: "savings-recovery",
      name: "Savings recovery",
      progressLabel: "COP 1,800,000 of COP 3,000,000",
      progress: 0.6,
      nextAction: "Set aside COP 300,000",
    },
  ],
  attentionItems: [
    {
      id: "future-budget",
      urgency: "NOW",
      title: "Next month looks tight",
      detail: "Planned spending is COP 320,000 above available money.",
      actionLabel: "Adjust September plan",
    },
    {
      id: "spending-pace",
      urgency: "SOON",
      title: "Dining is moving faster than planned",
      detail: "COP 186,000 remains for the next 11 days.",
      actionLabel: "Review spending",
    },
    {
      id: "draft-review",
      urgency: "THIS WEEK",
      title: "8 activities still need review",
      detail: "Finish them before completing the August close.",
      actionLabel: "Review Drafts",
    },
  ],
  homeSummary: {
    isMonthEnd: false,
    spentThisMonth: 2310000,
    daysElapsed: 20,
    daysInMonth: 31,
  },
};

function VariantA({ data }: { data: typeof fixture }) {
  const account = data.accounts[0];

  return (
    <View style={styles.variant}>
      <View>
        <Text style={styles.eyebrow}>QUICK CAPTURE</Text>
        <Text style={styles.title}>What Happened?</Text>
      </View>

      <Pressable style={styles.primaryAction}
        onPress={ ()=> Alert.alert("Prototype", "The capture flow is not connected yet")}
      >
        <Text style={ styles.primaryActionText }>+ Capture Activity</Text>
      </Pressable>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}> Review Drafts </Text>
        <Text style={styles.muted}>{ data.drafts.length} waiting</Text>
      </View>

      {data.drafts.slice(0, 3).map((draft) => (
        <View key={draft.id} style={styles.draftRow}>
          <View>
            <Text style={styles.draftDescription}>{draft.description}</Text>
            <Text style={styles.muted}>{draft.status}</Text>
          </View>
          <Text style={styles.draftAmount}>
            {data.workspace.functionalCurrency}{" "}{ draft.amount.toLocaleString("es-CO")}
          </Text>
        </View>
      ))}

      <View style={styles.secondaryBalance}>
        <Text style={styles.muted}>{account.name}</Text>
        <Text>
          {data.workspace.functionalCurrency}{" "}{ account.balance.toLocaleString("es-CO")}
        </Text>

      </View>
    </View>
  )
}

function VariantB({ data }: { data: typeof fixture }) {
  const currency = data.workspace.functionalCurrency;

  return (
    <View style={styles.variant}>
      <View>
        <Text style={styles.eyebrow}>YOUR ACCOUNTS</Text>
        <Text style={styles.title}>Money at a Glance</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.accountStrip}
      >
        {data.accounts.map((account) => (
          <Pressable
            key={account.id}
            style={({ pressed }) => [styles.accountCard, pressed && styles.accountCardPressed]}
            onPress={()=> Alert.alert(account.name, "Account details are not connected yet")}
          >
            <Text style={styles.accountLabel}>{ account.name }</Text>
            <Text style={styles.accountBalance}>{currency} {account.balance.toLocaleString("es-CO")}</Text>
            <Text style={styles.accountHint}>View Activity</Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={styles.sectionTitle}>Recent activity</Text>
      {data.recentActivity.map((activity) => {
        const account = data.accounts.find(
          (candidate) => candidate.id === activity.accountId,
        );

        const incoming = activity.direction === "in";

        return (
          <View key={activity.id} style={styles.activityRow}>
            <View style={styles.activityCopy}>
              <Text style={styles.draftDescription}>
                {activity.description}
              </Text>
              <Text style={styles.muted}>
                {account?.name ?? "Account"}
              </Text>
            </View>

            <Text
              style={[
                styles.activityAmount,
                incoming ? styles.moneyIn : styles.moneyOut,
              ]}
            >
              {incoming ? "+" : "−"} {currency}{" "}
              {activity.amount.toLocaleString("es-CO")}
            </Text>
          </View>
        );
      })}
      <View style={styles.draftSummary}>
        <Text style={styles.muted}>Still needs review</Text>
        <Text>{data.drafts.length} Drafts</Text>
      </View>
    </View>
  )
}

function VariantC({ data }: { data: typeof fixture }) {
  return (
    <View style={ styles.variant }>
      <View>
        <Text style={styles.eyebrow}>YOUR ROADMAP</Text>
        <Text style={styles.title}>Plans in Progress</Text>
      </View>
      {data.plans.map((plan, index) => (
        <View key={plan.id} style={styles.planStep}>
          <View style={ styles.planNumber}>
            <Text style={styles.planNumberText}>{ index + 1 }</Text>
          </View>
          <View style={styles.planCopy}>
            <Text style={styles.planName}>{ plan.name }</Text>
            <Text style={styles.muted}>{plan.progressLabel}</Text>
            <View style={ styles.progressTrack }>
              <View style={[styles.progressFill, {width: `${plan.progress*100}%`}]}></View>
            </View>
            <Text style={styles.planNext}>Next : { plan.nextAction }</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

function AttentionRow({
  item,
}: {
  item: (typeof fixture.attentionItems)[number];
}) {
  return (
    <Pressable
      style={styles.attentionRow}
      onPress={() =>
        Alert.alert(
          item.title,
          `${item.actionLabel} is not connected yet.`,
        )
      }
    >
      <Text style={styles.attentionUrgency}>{item.urgency}</Text>
      <Text style={styles.attentionTitle}>{item.title}</Text>
      <Text style={styles.muted}>{item.detail}</Text>
      <Text style={styles.attentionAction}>{item.actionLabel} →</Text>
    </Pressable>
  );
}

// Fire-and-forget light impact; no-ops where haptics are unavailable (web).
function lightTap() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function LegacyVariantE({
  data,
  theme,
  mode,
  onToggleTheme,
}: {
  data: typeof fixture;
  theme: Theme;
  mode: ThemeMode;
  onToggleTheme: () => void;
}) {
  const summary = data.homeSummary;
  const currency = data.workspace.functionalCurrency;
  const dailySpendRate = Math.round(
    summary.spentThisMonth / summary.daysElapsed,
  );
  const projectedSpend = dailySpendRate * summary.daysInMonth;
  const [isMonthEnd, setIsMonthEnd] = useState(summary.isMonthEnd);
  const es = useMemo(() => createEssentialStyles(theme), [theme]);

  function showDestination(destination: string) {
    Alert.alert("Prototype", `${destination} is not connected yet.`);
  }

  return (
    <View style={es.essentialHome}>
      <View style={es.essentialHeader}>
        <Text style={es.essentialLabel}>SPENT IN AUGUST</Text>
        <View style={es.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Switch theme"
            hitSlop={8}
            style={({ pressed }) => [
              es.accountButton,
              pressed && es.essentialPressed,
            ]}
            onPressIn={lightTap}
            onPress={onToggleTheme}
          >
            <Ionicons
              name={mode === "light" ? "moon-outline" : "sunny-outline"}
              size={22}
              color={theme.foreground}
            />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Account"
            hitSlop={8}
            style={({ pressed }) => [
              es.accountButton,
              pressed && es.essentialPressed,
            ]}
            onPressIn={lightTap}
            onPress={() => showDestination("Account")}
          >
            <Ionicons
              name="person-outline"
              size={22}
              color={theme.foreground}
            />
          </Pressable>
        </View>
      </View>

      <View style={es.spendingHero}>
        <Text style={es.spendingAmount}>
          {currency} {summary.spentThisMonth.toLocaleString("es-CO")}
        </Text>
        <Text style={es.pacePrediction}>
          On pace for {currency} {projectedSpend.toLocaleString("es-CO")}
        </Text>
        <View style={es.monthTrack}>
          <View
            style={[
              es.monthFill,
              {
                width: `${Math.round(
                  (summary.daysElapsed / summary.daysInMonth) * 100,
                )}%`,
              },
            ]}
          />
        </View>
        <Text style={es.essentialLabel}>
          DAY {summary.daysElapsed} OF {summary.daysInMonth}
        </Text>
      </View>

      <View style={es.essentialGrid}>
        <View style={es.essentialGridRow}>
          <Pressable
            style={({ pressed }) => [
              es.essentialTile,
              es.essentialTilePrimary,
              pressed && es.essentialPressed,
            ]}
            onPressIn={lightTap}
            onPress={() =>
              showDestination(isMonthEnd ? "Month close" : "Drafts")
            }
            onLongPress={() => setIsMonthEnd((current) => !current)}
            accessibilityHint="Long press to preview the alternate month-end state"
          >
            <Text style={es.essentialTilePrimaryText}>
              {isMonthEnd ? "Complete month" : "Drafts"}
            </Text>
            {!isMonthEnd && (
              <View style={es.tileBadge}>
                <Text style={es.tileBadgeText}>{data.drafts.length}</Text>
              </View>
            )}
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              es.essentialTile,
              pressed && es.essentialPressed,
            ]}
            onPressIn={lightTap}
            onPress={() => showDestination("Alerts")}
          >
            <Text style={es.essentialTileText}>Alerts</Text>
          </Pressable>
        </View>

        <View style={es.essentialGridRow}>
          <Pressable
            style={({ pressed }) => [
              es.essentialTile,
              pressed && es.essentialPressed,
            ]}
            onPressIn={lightTap}
            onPress={() => showDestination("Budgets")}
          >
            <Text style={es.essentialTileText}>Budgets</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              es.essentialTile,
              pressed && es.essentialPressed,
            ]}
            onPressIn={lightTap}
            onPress={() => showDestination("Financial overview")}
          >
            <Text style={es.essentialTileText}>Overview</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const createEssentialStyles = (theme: Theme) =>
  StyleSheet.create({
    essentialHome: {
      flex: 1,
      gap: spacing.section,
    },
    essentialHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    headerActions: {
      flexDirection: "row",
      gap: spacing.md,
    },
    accountButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.full,
      backgroundColor: theme.secondary,
      borderWidth: 1,
      borderColor: theme.border,
    },
    spendingHero: {
      gap: spacing.sm + 2,
      paddingVertical: spacing.lg,
      alignItems: "center",
    },
    essentialLabel: {
      color: theme.mutedForeground,
      fontSize: fontSize.label,
      fontFamily: font.bold,
      letterSpacing: 1,
    },
    spendingAmount: {
      color: theme.foreground,
      fontSize: fontSize.hero,
      fontFamily: font.extrabold,
      letterSpacing: -1,
      textAlign: "center",
    },
    pacePrediction: {
      color: theme.mutedForeground,
      fontSize: fontSize.body,
      fontFamily: font.regular,
      textAlign: "center",
    },
    monthTrack: {
      alignSelf: "stretch",
      height: 4,
      marginTop: spacing.sm,
      borderRadius: radius.full,
      backgroundColor: theme.border,
      overflow: "hidden",
    },
    monthFill: {
      height: "100%",
      borderRadius: radius.full,
      backgroundColor: theme.primary,
    },
    essentialGrid: {
      flex: 1,
      gap: spacing.xl,
    },
    essentialGridRow: {
      flex: 1,
      flexDirection: "row",
      gap: spacing.xl,
    },
    essentialTile: {
      flex: 1,
      minHeight: 104,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.lg,
      borderRadius: radius.xl,
      backgroundColor: theme.secondary,
      borderWidth: 1,
      borderColor: theme.ring,
    },
    essentialTilePrimary: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    essentialTileText: {
      color: theme.secondaryForeground,
      fontSize: fontSize.action,
      fontFamily: font.bold,
      textAlign: "center",
    },
    essentialTilePrimaryText: {
      color: theme.primaryForeground,
      fontSize: fontSize.action,
      fontFamily: font.bold,
      textAlign: "center",
    },
    tileBadge: {
      position: "absolute",
      top: spacing.lg,
      right: spacing.lg,
      minWidth: 24,
      height: 24,
      paddingHorizontal: spacing.xs + 2,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.full,
      backgroundColor: theme.primaryForeground,
    },
    tileBadgeText: {
      color: theme.primary,
      fontSize: fontSize.label,
      fontFamily: font.bold,
    },
    essentialPressed: {
      opacity: 0.75,
      transform: [{ scale: 0.98 }],
    },
  });

export default function Index() {
  // PROTOTYPE: five structurally different first-cutover homes on `/workflow`,
  // switchable through the shareable `?variant=` parameter.

  const { variant } = useLocalSearchParams<{ variant?: string }>();
  const insets = useSafeAreaInsets();
  const currentVariant = normalizePrototypeVariant(variant);

  if (currentVariant === "E") {
    return (
      <View style={styles.screen}>
        <VariantEWorkflow />
        {__DEV__ && <PrototypeSwitcher current={currentVariant} />}
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: "#ffffff" }]}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12 },
        ]}
      >
        {/*<Text> PROTOTYPE VARIANT {currentVariant} </Text>*/}
        {currentVariant === "A" && <VariantA data={fixture} />}
        {currentVariant === "B" && <VariantB data={fixture} />}
        {currentVariant === "C" && <VariantC data={fixture}/>}
        {currentVariant === "D" && (
          <AttentionRow item={fixture.attentionItems[0]} />
        )}
        {/*<Text>Prototype State</Text>
        <Text>{JSON.stringify(fixture, null, 2)}</Text>*/}
      </ScrollView>
      {Platform.OS === "android" && insets.bottom > 0 && (
        <View
          pointerEvents="none"
          style={[
            styles.systemNavBackdrop,
            {
              height: insets.bottom,
              backgroundColor: "#e5e5e5",
              borderTopColor: "#a3a3a3",
            },
          ]}
        />
      )}
      {__DEV__ && <PrototypeSwitcher current={currentVariant} />}
    </View>

  )
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingBottom: 112,
    gap: 12,
  },
  systemNavBackdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  variant: {
    gap: 16,
  },
  eyebrow: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
  },
  primaryAction: {
    padding: 18,
    borderRadius: 16,
    backgroundColor: "#111827",
  },
  primaryActionText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700"
  },
  draftRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#eeeeee",
  },
  draftDescription: {
    fontSize: 16,
    fontWeight: "600",
  },
  draftAmount: {
    fontWeight: "700",
  },
  muted: {
    color: "#6b7280",
  },
  secondaryBalance: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#d1d5db",
  },
  accountStrip: {
    gap: 12,
    paddingRight: 24,
  },
  accountCard: {
    width: 250,
    minHeight: 150,
    justifyContent: "space-between",
    padding: 20,
    borderRadius: 24,
    backgroundColor: "#0f766e",
  },
  accountCardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  accountLabel: {
    color: "#ccfbf1",
    fontSize: 15,
    fontWeight: "600",
  },
  accountBalance: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "800",
  },
  accountHint: {
    color: "#99f6e4",
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb"
  },
  activityCopy: {
    flex: 1,
  },
  activityAmount: {
    fontWeight: "700"
  },
  moneyIn: {
    color: "#047857",
  },
  moneyOut: {
    color: "#ef4444",
  },
  draftSummary: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#f3f4f6",
  },
  planStep: {
    flexDirection: "row",
    gap: 14,
    paddingVertical: 16
  },
  planNumber: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#111827"
  },
  planNumberText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  planCopy: {
    flex: 1,
    gap: 4,
  },
  planName: {
    fontSize: 18,
    fontWeight: "700",
  },
  planNext: {
    marginTop: 4,
    fontWeight: "600"
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#e5e7eb",
    overflow: "hidden"
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#0f766e"
  },
  attentionRow: {
    gap: 6,
    paddingVertical: 18,
    paddingLeft: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#dc2626",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  attentionUrgency: {
    color: "#dc2626",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  attentionTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  attentionAction: {
    marginTop: 4,
    fontWeight: "700",
  },
});
