import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "@clerk/expo";
import { useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { usePersonalDefaults, usePostedActivity } from "../src/features/activity";
import { api } from "../src/features/api";
import { HomePlaceSetup } from "../src/features/HomePlaceSetup";
import { experienceLevel } from "../src/features/levelDoor/model";
import { formatMoney } from "../src/features/money";
import { Setup } from "../src/features/Setup";
import { useWorkspaceCalendar } from "../src/features/useWorkspaceCalendar";
import { budgetAttention } from "../src/features/attention/model";
import { useInboxCount } from "../src/features/useInboxCount";
import { ConfirmationScreen, Screen, theme, ui } from "../src/ui/core";
import { font, fontSize, radius, spacing, touchTarget } from "../src/ui/tokens";

function Home({
  defaults,
  subject,
}: {
  defaults: NonNullable<ReturnType<typeof usePersonalDefaults>>;
  subject: string;
}) {
  const { workspace } = defaults;
  const { id: workspaceId, functionalCurrency: currency, timeZone } = workspace;
  const calendar = useWorkspaceCalendar(timeZone);
  const activity = usePostedActivity(workspaceId, timeZone);
  const budget = useQuery(api.budget.evaluate, { workspaceId, month: calendar.month });
  const attention = budget && budgetAttention(budget);
  const inboxCount = useInboxCount({ subject, workspaceId, currency });
  const actions = useRef<BottomSheetModal>(null);
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
  return (
    <Screen contentStyle={{ gap: spacing.xl, paddingTop: spacing.md }}>
      <View style={styles.header}>
        <Text style={[ui.label, { flex: 1 }]}>THIS MONTH</Text>
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
                <Text style={styles.bellBadgeText}>{attention.rows.length}</Text>
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
      {posted && <Text accessibilityRole="alert" style={ui.body}>✓ Posted</Text>}
      <View style={{ gap: spacing.xs }}>
        <Pressable accessibilityRole="button" accessibilityLabel="See places"
          onPress={() => router.push("/places")} hitSlop={spacing.md}>
          <Text style={styles.muted}>What you have now</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="What do you want to do?"
          onPress={() => actions.current?.present()} style={{ minHeight: touchTarget }}>
          {totalMinorUnits !== undefined ? (
            <Text adjustsFontSizeToFit numberOfLines={1} style={[ui.hero, styles.hero]}>
              {formatMoney({ currency, minorUnits: totalMinorUnits }, { hideZeroDecimals: true })}
            </Text>
          ) : <ActivityIndicator accessibilityLabel="Loading balances" />}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="See places"
          onPress={() => router.push("/places")} hitSlop={spacing.md}>
          {activity ? (
            <Text style={styles.muted}>
              {accountCount === 1 ? "One pool · See this place" : `Across ${accountCount} places`}
            </Text>
          ) : null}
        </Pressable>
      </View>
      {attention?.home && (
        <Pressable accessibilityRole="button"
          accessibilityLabel={`${attention.home.title}, ${attention.home.detail}`}
          onPress={() => router.push("/alerts")} style={styles.alertRow}>
          <View style={styles.alertIcon}>
            <Ionicons name="alert-circle" size={20} color={theme.background} />
          </View>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text style={styles.alertTitle}>{attention.home.title}</Text>
            <Text style={styles.alertDetail}>{attention.home.detail}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.warning} />
        </Pressable>
      )}
      <Pressable accessibilityRole="button"
        accessibilityLabel={`Drafts, ${inboxCount ? `${inboxCount} to review` : "Nothing waiting"}`}
        onPress={() => router.push("/drafts")} style={[styles.tile, styles.primaryTile]}>
        <View style={styles.tileTop}>
          <Ionicons name="document-text-outline" size={26} color={theme.primaryForeground} />
          {inboxCount !== undefined && inboxCount > 0 ? (
            <View style={styles.badge}><Text style={styles.badgeText}>{inboxCount}</Text></View>
          ) : null}
        </View>
        <View style={{ gap: spacing.xs }}>
          <Text style={[styles.tileTitle, styles.primaryText]}>Drafts</Text>
          <Text style={styles.primaryDetail}>
            {inboxCount ? `${inboxCount} to review` : "Nothing waiting"}
          </Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Overview, This month, by category"
        onPress={() => router.push("/overview")} style={styles.tile}>
        <Ionicons name="pie-chart-outline" size={26} color={theme.foreground} />
        <View style={{ gap: spacing.xs }}>
          <Text style={styles.tileTitle}>Overview</Text>
          <Text style={styles.muted}>This month, by category</Text>
        </View>
      </Pressable>
      {level === 1 && (
        <Pressable accessibilityRole="button" accessibilityLabel={`Plans, ${month} budget and recovery`}
          onPress={() => router.push("/plans")} style={styles.plansRow}>
          <Ionicons name="layers-outline" size={22} color={theme.foreground} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text style={[ui.body, { fontFamily: font.semibold }]}>Plans</Text>
            <Text style={styles.muted}>{month} budget and recovery</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.mutedForeground} />
        </Pressable>
      )}
      <BottomSheetModal ref={actions} enablePanDownToClose
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
        backgroundStyle={styles.sheetSurface}
        handleIndicatorStyle={{ backgroundColor: theme.ring }}>
        <BottomSheetView style={styles.sheetBody}>
          <Text accessibilityRole="header" style={styles.sheetTitle}>What do you want to do?</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Create a place, Another pocket for money"
            disabled={activity === undefined || budget === undefined}
            onPress={() => { actions.current?.dismiss(); setPlaceOpen(true); }} style={styles.choice}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.choiceTitle}>Create a place</Text>
              <Text style={styles.muted}>Another pocket for money</Text>
            </View>
            <Ionicons name="wallet-outline" size={22} color={theme.foreground} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Create a tx, Post money"
            onPress={() => { actions.current?.dismiss(); router.push("/post"); }} style={styles.choice}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.choiceTitle}>Create a tx</Text>
              <Text style={styles.muted}>Post money</Text>
            </View>
            <Ionicons name="create-outline" size={22} color={theme.foreground} />
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>
      {placeOpen && <HomePlaceSetup defaults={defaults} subject={subject} unlocking={accountCount === 1 && level === 0} onClose={() => setPlaceOpen(false)} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  iconButton: { width: touchTarget, height: touchTarget, borderRadius: radius.full,
    backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border,
    alignItems: "center", justifyContent: "center" },
  muted: { ...ui.muted, fontSize: 14, lineHeight: 20 },
  hero: { textAlign: "center", letterSpacing: -1.2 },
  tile: { minHeight: 148, justifyContent: "space-between", padding: spacing.lg, gap: spacing.lg,
    borderRadius: radius.xl, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border },
  primaryTile: { backgroundColor: theme.primary, borderColor: theme.primary },
  tileTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tileTitle: { color: theme.foreground, fontSize: fontSize.action, fontFamily: font.bold },
  primaryText: { color: theme.primaryForeground },
  primaryDetail: { color: theme.primaryForeground, fontSize: fontSize.label, fontFamily: font.medium },
  badge: { minWidth: 26, height: 26, borderRadius: radius.full, backgroundColor: theme.primaryForeground,
    alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm },
  badgeText: { color: theme.primary, fontFamily: font.bold, fontSize: fontSize.label },
  bellBadge: { position: "absolute", top: -2, right: -2, minWidth: 20, height: 20,
    paddingHorizontal: 5, borderRadius: radius.full, backgroundColor: theme.warning,
    borderWidth: 2, borderColor: theme.background, alignItems: "center", justifyContent: "center" },
  bellBadgeText: { color: theme.background, fontSize: 11, fontFamily: font.bold },
  alertRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg,
    backgroundColor: `${theme.warning}1f`, borderWidth: 1, borderColor: `${theme.warning}4d` },
  alertIcon: { width: 36, height: 36, borderRadius: radius.full, backgroundColor: theme.warning,
    alignItems: "center", justifyContent: "center" },
  alertTitle: { color: theme.foreground, fontSize: fontSize.body, fontFamily: font.bold },
  alertDetail: { color: theme.warning, fontSize: 14, fontFamily: font.semibold },
  plansRow: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border },
  sheetSurface: { backgroundColor: theme.background, borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: theme.border },
  sheetBody: { gap: spacing.md, paddingHorizontal: spacing.xxl, paddingTop: spacing.sm, paddingBottom: 44 },
  sheetTitle: { color: theme.foreground, fontSize: 28, lineHeight: 34, fontFamily: font.extrabold, letterSpacing: -0.6 },
  choice: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg,
    borderRadius: radius.md, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border },
  choiceTitle: { ...ui.body, fontFamily: font.semibold },
});

export default function Index() {
  const defaults = usePersonalDefaults();
  const { userId } = useAuth();
  const [confirmed, setConfirmed] = useState(false);
  if (confirmed)
    return (
      <ConfirmationScreen
        title="You’re ready"
        detail="Your money is ready to track."
        onContinue={() => setConfirmed(false)}
      />
    );
  if (defaults === null)
    return (
      <Screen>
        <Setup onComplete={() => setConfirmed(true)} />
      </Screen>
    );
  if (defaults === undefined || !userId)
    return (
      <Screen>
        <ActivityIndicator />
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
