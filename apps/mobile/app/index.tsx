import type { Theme } from "../src/ui/tokens";
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useAuth } from "@clerk/expo";
import { useQuery } from "convex/react";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { usePersonalDefaults, usePostedActivity } from "../src/features/activity";
import { api } from "../src/features/api";
import { HomePlaceSetup } from "../src/features/HomePlaceSetup";
import { FeedbackIntroCard } from "../src/features/feedback/FeedbackIntroCard";
import { experienceLevel } from "../src/features/levelDoor/model";
import { formatMoney } from "../src/features/money";
import { Setup } from "../src/features/Setup";
import { SetupCompletion } from "../src/features/setup/Completion";
import type { SetupSummary } from "../src/features/setup/model";
import { useWorkspaceCalendar } from "../src/features/useWorkspaceCalendar";
import { budgetAttention } from "../src/features/attention/model";
import { useInboxCount } from "../src/features/useInboxCount";
import { Header, PrimaryButton, Screen, useTheme, useUi } from "../src/ui/core";
import { font, fontSize, radius, spacing, touchTarget } from "../src/ui/tokens";
import { BrandLogo } from "../src/ui/Brand";
import { formatMonthName, useT } from "../src/i18n";

function Home({
  defaults,
  subject,
}: {
  defaults: NonNullable<ReturnType<typeof usePersonalDefaults>>;
  subject: string;
}) {
  const ui = useUi();
  const theme = useTheme();
  const translator = useT();
  const { t, tn, language } = translator;
  const styles = useMemo(() => createStyles(theme, ui), [theme, ui]);
  const { workspace } = defaults;
  const { id: workspaceId, functionalCurrency: currency, timeZone } = workspace;
  const calendar = useWorkspaceCalendar(timeZone);
  const activity = usePostedActivity(workspaceId, timeZone);
  const budget = useQuery(api.budget.evaluate, { workspaceId, month: calendar.month });
  const attention = budget && budgetAttention(budget, translator);
  const inboxCount = useInboxCount({ subject, workspaceId, currency });
  const actions = useRef<BottomSheetModal>(null);
  const [placeOpen, setPlaceOpen] = useState(false);
  const { posted } = useLocalSearchParams<{ posted?: string }>();
  const accountCount = activity?.accounts.length ?? 0;
  const level = experienceLevel(accountCount, budget?.jars.length ?? 0);
  const month = formatMonthName(language, calendar.now, { timeZone, capitalize: false });
  const draftsDetail = inboxCount ? t("home.toReview", { count: inboxCount }) : t("home.nothingWaiting");
  const plansDetail = t("home.plansDetail", { month });
  const totalMinorUnits = activity?.accounts.reduce((sum, account) => {
    const { minorUnits } = account.balance;
    if (account.nature === "Liability") return sum - minorUnits;
    if (account.nature === "Asset") return sum + minorUnits;
    return sum;
  }, 0);
  return (
    <Screen contentStyle={{ gap: spacing.xl, paddingTop: spacing.md }}>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: spacing.sm }}>
          <BrandLogo width={104} />
          <Text style={ui.label}>{t("home.thisMonth")}</Text>
        </View>
        {level === 1 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={attention?.bellLabel ?? t("home.alertsLoading")}
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
          accessibilityLabel={t("home.openSettings")}
          onPress={() => router.push("/settings")}
          style={styles.iconButton}
        >
          <Ionicons name="person-outline" size={22} color={theme.foreground} />
        </Pressable>
      </View>
      {posted && <Text accessibilityRole="alert" style={ui.body}>{t("home.posted")}</Text>}
      <View style={{ gap: spacing.xs }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("home.seePlaces")}
          onPress={() => router.push("/places")} hitSlop={spacing.md}>
          <Text style={styles.muted}>{t("home.whatYouHave")}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t("home.whatToDo")}
          onPress={() => actions.current?.present()} style={{ minHeight: touchTarget }}>
          {totalMinorUnits !== undefined ? (
            <Text adjustsFontSizeToFit numberOfLines={1} style={[ui.hero, styles.hero]}>
              {formatMoney({ currency, minorUnits: totalMinorUnits }, { hideZeroDecimals: true })}
            </Text>
          ) : <ActivityIndicator accessibilityLabel={t("home.loadingBalances")} />}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t("home.seePlaces")}
          onPress={() => router.push("/places")} hitSlop={spacing.md}>
          {activity ? (
            <Text style={styles.muted}>
              {accountCount === 1 ? t("home.onePool") : tn("home.acrossPlaces", accountCount)}
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
        accessibilityLabel={`${t("home.drafts")}, ${draftsDetail}`}
        onPress={() => router.push("/drafts")} style={[styles.tile, styles.primaryTile]}>
        <View style={styles.tileTop}>
          <Ionicons name="document-text-outline" size={26} color={theme.primaryForeground} />
          {inboxCount !== undefined && inboxCount > 0 ? (
            <View style={styles.badge}><Text style={styles.badgeText}>{inboxCount}</Text></View>
          ) : null}
        </View>
        <View style={{ gap: spacing.xs }}>
          <Text style={[styles.tileTitle, styles.primaryText]}>{t("home.drafts")}</Text>
          <Text style={styles.primaryDetail}>{draftsDetail}</Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`${t("home.overview")}, ${t("home.overviewDetail")}`}
        onPress={() => router.push("/overview")} style={styles.tile}>
        <Ionicons name="pie-chart-outline" size={26} color={theme.foreground} />
        <View style={{ gap: spacing.xs }}>
          <Text style={styles.tileTitle}>{t("home.overview")}</Text>
          <Text style={styles.muted}>{t("home.overviewDetail")}</Text>
        </View>
      </Pressable>
      {level === 1 && (
        <Pressable accessibilityRole="button" accessibilityLabel={`${t("home.plans")}, ${plansDetail}`}
          onPress={() => router.push("/plans")} style={styles.plansRow}>
          <Ionicons name="layers-outline" size={22} color={theme.foreground} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text style={[ui.body, { fontFamily: font.semibold }]}>{t("home.plans")}</Text>
            <Text style={styles.muted}>{plansDetail}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.mutedForeground} />
        </Pressable>
      )}
      <FeedbackIntroCard placement="home" />
      <BottomSheetModal ref={actions} enablePanDownToClose
        backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />}
        backgroundStyle={styles.sheetSurface}
        handleIndicatorStyle={{ backgroundColor: theme.ring }}>
        <BottomSheetView style={styles.sheetBody}>
          <Text accessibilityRole="header" style={styles.sheetTitle}>{t("home.whatToDo")}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`${t("home.createPlace")}, ${t("home.createPlaceDetail")}`}
            disabled={activity === undefined || budget === undefined}
            onPress={() => { actions.current?.dismiss(); setPlaceOpen(true); }} style={styles.choice}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.choiceTitle}>{t("home.createPlace")}</Text>
              <Text style={styles.muted}>{t("home.createPlaceDetail")}</Text>
            </View>
            <Ionicons name="wallet-outline" size={22} color={theme.foreground} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`${t("home.createEntry")}, ${t("home.createEntryDetail")}`}
            onPress={() => { actions.current?.dismiss(); router.push("/post"); }} style={styles.choice}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.choiceTitle}>{t("home.createEntry")}</Text>
              <Text style={styles.muted}>{t("home.createEntryDetail")}</Text>
            </View>
            <Ionicons name="create-outline" size={22} color={theme.foreground} />
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>
      {placeOpen && <HomePlaceSetup defaults={defaults} subject={subject} unlocking={accountCount === 1 && level === 0} onClose={() => setPlaceOpen(false)} />}
    </Screen>
  );
}
type EntryView =
  | { kind: "setup" }
  | { kind: "home" }
  | { kind: "complete"; summary: SetupSummary };

function createStyles(theme: Theme, ui: ReturnType<typeof useUi>) {
  return StyleSheet.create({
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
  badge: { minWidth: 26, minHeight: 26, borderRadius: radius.full, backgroundColor: theme.primaryForeground,
    alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm },
  badgeText: { color: theme.primary, fontFamily: font.bold, fontSize: fontSize.label },
  bellBadge: { position: "absolute", top: -2, right: -2, minWidth: 20, minHeight: 20,
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
}

export default function Index() {
  const defaults = usePersonalDefaults();
  const { userId } = useAuth();
  if (defaults === undefined || !userId)
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
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
  const { t } = useT();
  const [view, setView] = useState<EntryView>(() =>
    defaults ? { kind: "home" } : { kind: "setup" },
  );
  if (view.kind === "complete")
    return (
      <SetupCompletion
        summary={view.summary}
        onNotificationSetup={() => {
          setView({ kind: "home" });
          router.push("/intake");
        }}
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
        <Header title={t("home.homeTitle")} />
        <PrimaryButton
          label={t("home.startSetup")}
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
