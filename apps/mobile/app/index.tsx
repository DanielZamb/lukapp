import type { Theme } from "../src/ui/tokens";
import { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "@clerk/expo";
import { useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { usePersonalDefaults, usePostedActivity } from "../src/features/activity";
import { api } from "../src/features/api";
import { HomePlaceSetup } from "../src/features/HomePlaceSetup";
import { experienceLevel } from "../src/features/levelDoor/model";
import { formatAmount, formatMoney } from "../src/features/money";
import { Setup } from "../src/features/Setup";
import { SetupCompletion } from "../src/features/setup/Completion";
import type { SetupSummary } from "../src/features/setup/model";
import { useWorkspaceCalendar } from "../src/features/useWorkspaceCalendar";
import { budgetAttention } from "../src/features/attention/model";
import { useInboxCount } from "../src/features/useInboxCount";
import { ActionBar, AlertDot, BrandBand, BrandBandChip, DestinationRow, Header, IconButton, MoneyHero, Presentation, PreviewGroup, PrimaryButton, Screen, Text, useTheme } from "../src/ui/core";
import { radius, spacing, touchTarget } from "../src/ui/tokens";
import { ConnectingHandover, ConnectingScreen } from "../src/ui/ConnectingScreen";
import { Sheet } from "../src/ui/Sheet";
import type { SheetRef } from "../src/ui/SheetModal";
import { ActionSheet } from "../src/ui/pickers";
import { BrandLogo } from "../src/ui/Brand";

function Home({
  defaults,
  subject,
}: {
  defaults: NonNullable<ReturnType<typeof usePersonalDefaults>>;
  subject: string;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { workspace } = defaults;
  const { id: workspaceId, functionalCurrency: currency, timeZone } = workspace;
  const calendar = useWorkspaceCalendar(timeZone);
  const activity = usePostedActivity(workspaceId, timeZone);
  const budget = useQuery(api.budget.evaluate, { workspaceId, month: calendar.month });
  const attention = budget && budgetAttention(budget);
  const inboxCount = useInboxCount({ subject, workspaceId, currency });
  const actions: SheetRef = useRef(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);
  const { posted } = useLocalSearchParams<{ posted?: string }>();
  const accountCount = activity?.accounts.length ?? 0;
  const level = experienceLevel(accountCount, budget?.jars.length ?? 0);
  const month = new Intl.DateTimeFormat("en", { month: "long", timeZone }).format(calendar.now);
  const totalMinorUnits = activity?.accounts.reduce((sum, account) => {
    const { minorUnits } = account.balance;
    if (account.nature === "Liability") return sum - minorUnits;
    if (account.nature === "Asset") return sum + minorUnits;
    return sum;
  }, 0);
  const body = <>
      <Presentation legacy={<>
      {attention?.home && (
        <Pressable accessibilityRole="button"
          accessibilityLabel={`${attention.home.title}, ${attention.home.detail}`}
          onPress={() => router.push("/alerts")} style={styles.alertRow}>
          <View style={styles.alertIcon}>
            <Ionicons name="alert-circle" size={20} color={theme.background} />
          </View>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text preset="bodyStrong" style={styles.alertTitle}>{attention.home.title}</Text>
            <Text preset="rowMoney" style={styles.alertDetail}>{attention.home.detail}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.warning} />
        </Pressable>
      )}
      </>} />
      <Presentation legacy={<>      <Pressable accessibilityRole="button"
        accessibilityLabel={`Drafts, ${inboxCount ? `${inboxCount} to review` : "Nothing waiting"}`}
        onPress={() => router.push("/drafts")} style={[styles.tile, styles.primaryTile]}>
        <View style={styles.tileTop}>
          <Ionicons name="document-text-outline" size={26} color={theme.primaryForeground} />
          {inboxCount !== undefined && inboxCount > 0 ? (
            <View style={styles.badge}><Text preset="captionStrong" style={styles.badgeText}>{inboxCount}</Text></View>
          ) : null}
        </View>
        <View style={{ gap: spacing.xs }}>
          <Text variant="action" style={[styles.tileTitle, styles.primaryText]}>Drafts</Text>
          <Text preset="captionMedium" style={styles.primaryDetail}>
            {inboxCount ? `${inboxCount} to review` : "Nothing waiting"}
          </Text>
        </View>
      </Pressable>
</>}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Drafts, ${inboxCount ? `${inboxCount} to review` : "Nothing waiting"}`}
          onPress={() => router.push("/drafts")} style={styles.drafts}>
          <View style={styles.draftsTop}>
            <View style={styles.draftsIcon}><Ionicons name="document-text-outline" size={26} color={theme.primaryForeground} /></View>
            <Ionicons name="chevron-forward" size={22} color={theme.primaryForeground} />
          </View>
          <Text variant="section" style={styles.primaryText}>Drafts</Text>
          <Text variant="body" style={styles.primaryText}>{inboxCount ? `${inboxCount} to review` : "Nothing waiting"}</Text>
        </Pressable>
      </Presentation>
      <PreviewGroup items={level === 1 ? ["overview", "plans"] : ["overview"]} totalCount={level === 1 ? 2 : 1}
        viewAllLabel={() => ""} onViewAll={() => {}}
        renderItem={(destination) => <DestinationRow key={destination} icon={destination === "overview" ? "pie-chart-outline" : "layers-outline"}
          title={destination === "overview" ? "Overview" : "Plans"}
          detail={destination === "overview" ? "This month, by category" : `${month} budget and recovery`}
          onPress={() => router.push(destination === "overview" ? "/overview" : "/plans")} />}
        legacy={<>      <Pressable accessibilityRole="button" accessibilityLabel="Overview, This month, by category"
        onPress={() => router.push("/overview")} style={styles.tile}>
        <Ionicons name="pie-chart-outline" size={26} color={theme.foreground} />
        <View style={{ gap: spacing.xs }}>
          <Text variant="action" style={styles.tileTitle}>Overview</Text>
          <Text variant="meta" tone="muted">This month, by category</Text>
        </View>
      </Pressable>
      {level === 1 && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Plans, ${month} budget and recovery`}
          onPress={() => router.push("/plans")} style={styles.plansRow}>
          <Ionicons name="layers-outline" size={22} color={theme.foreground} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text preset="rowName">Plans</Text>
            <Text variant="meta" tone="muted">{month} budget and recovery</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.mutedForeground} />
        </Pressable>
      )}
</>} />
  </>;
  const content = <>
      <BrandBand header={{ logo: <BrandLogo width={104} />, eyebrow: "THIS MONTH", actions: <>        {level === 1 && (
          <IconButton preset="brand" icon="notifications-outline" iconSize={24}
            accessibilityLabel={attention?.bellLabel ?? "Alerts, loading"} onPress={() => router.push("/alerts")}>
            <AlertDot count={attention?.rows.length ?? 0} />
          </IconButton>
        )}
        <IconButton preset="brand" icon="person-outline" iconSize={24}
          accessibilityLabel="Open user and workspace" onPress={() => router.push("/settings")} />
</> }}
        hero={{ label: "What you have now", content: <Pressable accessibilityRole="button" accessibilityLabel="What do you want to do?"
          onPress={() => setActionsOpen(true)} style={{ minHeight: touchTarget }}>
          {totalMinorUnits !== undefined ? <MoneyHero currency={currency} amount={formatAmount(Math.abs(totalMinorUnits), currency, { hideZeroDecimals: true })} negative={totalMinorUnits < 0} /> : null}
        </Pressable> }}
        chip={<BrandBandChip label={`Across ${accountCount} places`} onPress={() => router.push("/places")} />}
        legacy={<>      <View style={styles.header}>
        <View style={{ flex: 1, gap: spacing.sm }}>
          <BrandLogo width={104} />
          <Text variant="label" tone="muted">THIS MONTH</Text>
        </View>
        {level === 1 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={attention?.bellLabel ?? "Alerts, loading"}
            onPress={() => router.push("/alerts")}
            style={styles.iconButton}
          >
            <Ionicons name="notifications-outline" size={22} color={theme.foreground} />
            {attention && attention.rows.length > 0 && (
              <View style={styles.bellBadge} pointerEvents="none">
                <Text preset="badge" style={styles.bellBadgeText}>{attention.rows.length}</Text>
              </View>
            )}
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open user and workspace"
          onPress={() => router.push("/settings")}
          style={styles.iconButton}
        >
          <Ionicons name="person-outline" size={22} color={theme.foreground} />
        </Pressable>
      </View>
      {posted && <Text preset="body" accessibilityRole="alert">✓ Posted</Text>}
      <View style={{ gap: spacing.xs }}>
        <Pressable accessibilityRole="button" accessibilityLabel="See places"
          onPress={() => router.push("/places")} hitSlop={spacing.md}>
          <Text variant="meta" tone="muted">What you have now</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="What do you want to do?"
          onPress={() => setActionsOpen(true)} style={{ minHeight: touchTarget }}>
          {totalMinorUnits !== undefined ? (
            <Text variant="hero" adjustsFontSizeToFit numberOfLines={1} style={styles.hero}>
              {formatMoney({ currency, minorUnits: totalMinorUnits }, { hideZeroDecimals: true })}
            </Text>
          ) : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="See places"
          onPress={() => router.push("/places")} hitSlop={spacing.md}>
          {activity ? (
            <Text variant="meta" tone="muted">
              {accountCount === 1 ? "One pool · See this place" : `Across ${accountCount} places`}
            </Text>
          ) : null}
        </Pressable>
      </View>
</>} />
    <Presentation legacy={body}><View style={{ gap: 32, paddingTop: spacing.md }}>{body}</View></Presentation>
      {actionsOpen && <ActionSheet title="What do you want to do?"
        eyebrow={totalMinorUnits !== undefined ? formatMoney({ currency, minorUnits: totalMinorUnits }, { hideZeroDecimals: true }) : undefined}
        onClose={() => setActionsOpen(false)}
        actions={[{ icon: "create-outline", label: "Post money", status: "Money in or out", onPress: () => { setActionsOpen(false); router.push("/post"); } },
          { icon: "wallet-outline", label: "Create a place", status: "Another pocket for money", disabled: activity === undefined || budget === undefined, onPress: () => { if (activity === undefined || budget === undefined) return; setActionsOpen(false); setPlaceOpen(true); } }]}
        legacy={<Sheet body="native" sheetRef={actions} presentOnMount onClose={() => setActionsOpen(false)} nativeModalProps={{ enablePanDownToClose: true,
        backdropComponent: (props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />,
        backgroundStyle: styles.sheetSurface,
        handleIndicatorStyle: { backgroundColor: theme.ring } }}>
        <BottomSheetView style={styles.sheetBody}>
          <Text preset="sheetTitle" accessibilityRole="header">What do you want to do?</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Create a place, Another pocket for money"
            disabled={activity === undefined || budget === undefined}
            onPress={() => { actions.current?.dismiss(); setPlaceOpen(true); }} style={styles.choice}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text preset="rowName">Create a place</Text>
              <Text variant="meta" tone="muted">Another pocket for money</Text>
            </View>
            <Ionicons name="wallet-outline" size={22} color={theme.foreground} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Create a tx, Post money"
            onPress={() => { actions.current?.dismiss(); router.push("/post"); }} style={styles.choice}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text preset="rowName">Create a tx</Text>
              <Text variant="meta" tone="muted">Post money</Text>
            </View>
            <Ionicons name="create-outline" size={22} color={theme.foreground} />
          </Pressable>
        </BottomSheetView>
      </Sheet>} />}
      {placeOpen && <HomePlaceSetup defaults={defaults} subject={subject} unlocking={accountCount === 1 && level === 0} onClose={() => setPlaceOpen(false)} />}
  </>;
  return <ConnectingHandover ready={activity !== undefined}>
    <Presentation legacy={<Screen contentStyle={{ gap: spacing.xl, paddingTop: spacing.md }}>{content}</Screen>}>
      <Screen contentStyle={{ gap: 0 }} footer={<ActionBar primary={{ label: "Post money", icon: "add", onPress: () => router.push("/post") }} />}>{content}</Screen>
    </Presentation>
  </ConnectingHandover>;
}
type EntryView =
  | { kind: "setup" }
  | { kind: "home" }
  | { kind: "complete"; summary: SetupSummary };

function createStyles(theme: Theme) {
  return StyleSheet.create({
  drafts: { padding: spacing.lg, gap: spacing.sm, borderRadius: radius.xl, backgroundColor: theme.primary },
  draftsTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  draftsIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff29" },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconButton: { width: touchTarget, height: touchTarget, borderRadius: radius.full,
    backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border,
    alignItems: "center", justifyContent: "center" },
  hero: { textAlign: "center", letterSpacing: -1.2 },
  tile: { minHeight: 148, justifyContent: "space-between", padding: spacing.lg, gap: spacing.lg,
    borderRadius: radius.xl, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border },
  primaryTile: { backgroundColor: theme.primary, borderColor: theme.primary },
  tileTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tileTitle: { color: theme.foreground },
  primaryText: { color: theme.primaryForeground },
  primaryDetail: { color: theme.primaryForeground },
  badge: { minWidth: 26, minHeight: 26, borderRadius: radius.full, backgroundColor: theme.primaryForeground,
    alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm },
  badgeText: { color: theme.primary },
  bellBadge: { position: "absolute", top: -2, right: -2, minWidth: 20, minHeight: 20,
    paddingHorizontal: 5, borderRadius: radius.full, backgroundColor: theme.warning,
    borderWidth: 2, borderColor: theme.background, alignItems: "center", justifyContent: "center" },
  bellBadgeText: { color: theme.background },
  alertRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg,
    backgroundColor: `${theme.warning}1f`, borderWidth: 1, borderColor: `${theme.warning}4d` },
  alertIcon: { width: 36, height: 36, borderRadius: radius.full, backgroundColor: theme.warning,
    alignItems: "center", justifyContent: "center" },
  alertTitle: { color: theme.foreground },
  alertDetail: { color: theme.warning },
  plansRow: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border },
  sheetSurface: { backgroundColor: theme.background, borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: theme.border },
  sheetBody: { gap: spacing.md, paddingHorizontal: spacing.xxl, paddingTop: spacing.sm, paddingBottom: 44 },
  choice: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg,
    borderRadius: radius.md, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border },
  });
}

export default function Index() {
  const defaults = usePersonalDefaults();
  const { userId } = useAuth();
  if (defaults === undefined || !userId)
    return (
      <ConnectingScreen phase={userId ? "data" : "session"} />
    );
  return <ReadyIndex key={userId} defaults={defaults} userId={userId} />;
}

function ReadyIndex({
  defaults,
  userId,
}: {
  defaults: Exclude<ReturnType<typeof usePersonalDefaults>, undefined>;
  userId: string;
}) {
  const [view, setView] = useState<EntryView>(() =>
    defaults ? { kind: "home" } : { kind: "setup" },
  );
  if (view.kind === "complete")
    return (
      <SetupCompletion
        summary={view.summary}
        onHome={() => {
          setView({ kind: "home" });
          if (view.summary.wantsBudgets && view.summary.firstCategoryId)
            router.push({
              pathname: "/budget",
              params: { categoryId: view.summary.firstCategoryId },
            });
        }}
      />
    );
  if (view.kind === "setup")
    return (
      <Screen>
        <Setup
          subject={userId}
          onComplete={(summary) => setView({ kind: "complete", summary })}
          onCancel={() => setView({ kind: "home" })}
        />
      </Screen>
    );
  if (!defaults)
    return (
      <Screen>
        <Header title="Home" />
        <PrimaryButton
          label="Start setup"
          onPress={() => setView({ kind: "setup" })}
        />
      </Screen>
    );
  return (
    <Home
      key={`${userId}:${defaults.workspace.id}`}
      defaults={defaults}
      subject={userId}
    />
  );
}
