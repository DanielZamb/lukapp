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
import { FeedbackIntroCard } from "../src/features/feedback/FeedbackIntroCard";
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
import { formatMonthName, useT } from "../src/i18n";

function Home({
  defaults,
  subject,
}: {
  defaults: NonNullable<ReturnType<typeof usePersonalDefaults>>;
  subject: string;
}) {
  const theme = useTheme();
  const translator = useT();
  const { t, tn, language } = translator;
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { workspace } = defaults;
  const { id: workspaceId, functionalCurrency: currency, timeZone } = workspace;
  const calendar = useWorkspaceCalendar(timeZone);
  const activity = usePostedActivity(workspaceId, timeZone);
  const budget = useQuery(api.budget.evaluate, { workspaceId, month: calendar.month });
  const attention = budget && budgetAttention(budget, translator);
  const inboxCount = useInboxCount({ subject, workspaceId, currency });
  const actions: SheetRef = useRef(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);
  const { posted } = useLocalSearchParams<{ posted?: string }>();
  const accountCount = activity?.accounts.length ?? 0;
  const level = experienceLevel(accountCount, budget);
  const month = formatMonthName(language, calendar.now, { timeZone, capitalize: false });
  const draftsDetail = inboxCount ? t("home.toReview", { count: inboxCount }) : t("home.nothingWaiting");
  const plansDetail = t("home.plansDetail", { month });
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
        accessibilityLabel={`${t("home.drafts")}, ${draftsDetail}`}
        onPress={() => router.push("/drafts")} style={[styles.tile, styles.primaryTile]}>
        <View style={styles.tileTop}>
          <Ionicons name="document-text-outline" size={26} color={theme.primaryForeground} />
          {inboxCount !== undefined && inboxCount > 0 ? (
            <View style={styles.badge}><Text preset="captionStrong" style={styles.badgeText}>{inboxCount}</Text></View>
          ) : null}
        </View>
        <View style={{ gap: spacing.xs }}>
          <Text variant="action" style={[styles.tileTitle, styles.primaryText]}>{t("home.drafts")}</Text>
          <Text preset="captionMedium" style={styles.primaryDetail}>{draftsDetail}</Text>
        </View>
      </Pressable>
</>}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${t("home.drafts")}, ${draftsDetail}`}
          onPress={() => router.push("/drafts")} style={styles.drafts}>
          <View style={styles.draftsTop}>
            <View style={styles.draftsIcon}><Ionicons name="document-text-outline" size={26} color={theme.primaryForeground} /></View>
            <Ionicons name="chevron-forward" size={22} color={theme.primaryForeground} />
          </View>
          <Text variant="section" style={styles.primaryText}>{t("home.drafts")}</Text>
          <Text variant="body" style={styles.primaryText}>{draftsDetail}</Text>
        </Pressable>
      </Presentation>
      <PreviewGroup items={level === 1 ? ["overview", "plans"] : ["overview"]} totalCount={level === 1 ? 2 : 1}
        viewAllLabel={() => ""} onViewAll={() => {}}
        renderItem={(destination) => <DestinationRow key={destination} icon={destination === "overview" ? "pie-chart-outline" : "layers-outline"}
          title={destination === "overview" ? t("home.overview") : t("home.plans")}
          detail={destination === "overview" ? t("home.overviewDetail") : plansDetail}
          onPress={() => router.push(destination === "overview" ? "/overview" : "/plans")} />}
        legacy={<>      <Pressable accessibilityRole="button" accessibilityLabel={`${t("home.overview")}, ${t("home.overviewDetail")}`}
        onPress={() => router.push("/overview")} style={styles.tile}>
        <Ionicons name="pie-chart-outline" size={26} color={theme.foreground} />
        <View style={{ gap: spacing.xs }}>
          <Text variant="action" style={styles.tileTitle}>{t("home.overview")}</Text>
          <Text variant="meta" tone="muted">{t("home.overviewDetail")}</Text>
        </View>
      </Pressable>
      {level === 1 && (
        <Pressable accessibilityRole="button" accessibilityLabel={`${t("home.plans")}, ${plansDetail}`}
          onPress={() => router.push("/plans")} style={styles.plansRow}>
          <Ionicons name="layers-outline" size={22} color={theme.foreground} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text preset="rowName">{t("home.plans")}</Text>
            <Text variant="meta" tone="muted">{plansDetail}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.mutedForeground} />
        </Pressable>
      )}
</>} />
  </>;
  const content = <>
      <BrandBand header={{ logo: <BrandLogo width={104} />, eyebrow: t("home.thisMonth"), actions: <>        {level === 1 && (
          <IconButton preset="brand" icon="notifications-outline" iconSize={24}
            accessibilityLabel={attention?.bellLabel ?? t("home.alertsLoading")} onPress={() => router.push("/alerts")}>
            <AlertDot count={attention?.rows.length ?? 0} />
          </IconButton>
        )}
        <IconButton preset="brand" icon="person-outline" iconSize={24}
          accessibilityLabel={t("home.openSettings")} onPress={() => router.push("/settings")} />
</> }}
        hero={{ label: t("home.whatYouHave"), content: <Pressable accessibilityRole="button" accessibilityLabel={t("home.whatToDo")}
          onPress={() => setActionsOpen(true)} style={{ minHeight: touchTarget }}>
          {totalMinorUnits !== undefined ? <MoneyHero currency={currency} amount={formatAmount(Math.abs(totalMinorUnits), currency, { hideZeroDecimals: true })} negative={totalMinorUnits < 0} /> : null}
        </Pressable> }}
        chip={<BrandBandChip label={accountCount === 1 ? t("home.onePool") : tn("home.acrossPlaces", accountCount)} onPress={() => router.push("/places")} />}
        legacy={<>      <View style={styles.header}>
        <View style={{ flex: 1, gap: spacing.sm }}>
          <BrandLogo width={104} />
          <Text variant="label" tone="muted">{t("home.thisMonth")}</Text>
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
                <Text preset="badge" style={styles.bellBadgeText}>{attention.rows.length}</Text>
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
      {posted && <Text preset="body" accessibilityRole="alert">{t("home.posted")}</Text>}
      <View style={{ gap: spacing.xs }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("home.seePlaces")}
          onPress={() => router.push("/places")} hitSlop={spacing.md}>
          <Text variant="meta" tone="muted">{t("home.whatYouHave")}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t("home.whatToDo")}
          onPress={() => setActionsOpen(true)} style={{ minHeight: touchTarget }}>
          {totalMinorUnits !== undefined ? (
            <Text variant="hero" adjustsFontSizeToFit numberOfLines={1} style={styles.hero}>
              {formatMoney({ currency, minorUnits: totalMinorUnits }, { hideZeroDecimals: true })}
            </Text>
          ) : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t("home.seePlaces")}
          onPress={() => router.push("/places")} hitSlop={spacing.md}>
          {activity ? (
            <Text variant="meta" tone="muted">
              {accountCount === 1 ? t("home.onePool") : tn("home.acrossPlaces", accountCount)}
            </Text>
          ) : null}
        </Pressable>
      </View>
</>} />
    <Presentation legacy={body}><View style={{ gap: 32, paddingTop: spacing.md }}>{body}</View></Presentation>
    <FeedbackIntroCard placement="home" />
      {actionsOpen && <ActionSheet title={t("home.whatToDo")}
        eyebrow={totalMinorUnits !== undefined ? formatMoney({ currency, minorUnits: totalMinorUnits }, { hideZeroDecimals: true }) : undefined}
        onClose={() => setActionsOpen(false)}
        actions={[{ icon: "create-outline", label: t("posting.title"), status: t("home.createEntryDetail"), onPress: () => { setActionsOpen(false); router.push("/post"); } },
          { icon: "wallet-outline", label: t("home.createPlace"), status: t("home.createPlaceDetail"), disabled: activity === undefined || budget === undefined, onPress: () => { if (activity === undefined || budget === undefined) return; setActionsOpen(false); setPlaceOpen(true); } }]}
        legacy={<Sheet body="native" sheetRef={actions} presentOnMount onClose={() => setActionsOpen(false)} nativeModalProps={{ enablePanDownToClose: true,
        backdropComponent: (props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />,
        backgroundStyle: styles.sheetSurface,
        handleIndicatorStyle: { backgroundColor: theme.ring } }}>
        <BottomSheetView style={styles.sheetBody}>
          <Text preset="sheetTitle" accessibilityRole="header">{t("home.whatToDo")}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`${t("home.createPlace")}, ${t("home.createPlaceDetail")}`}
            disabled={activity === undefined || budget === undefined}
            onPress={() => { actions.current?.dismiss(); setPlaceOpen(true); }} style={styles.choice}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text preset="rowName">{t("home.createPlace")}</Text>
              <Text variant="meta" tone="muted">{t("home.createPlaceDetail")}</Text>
            </View>
            <Ionicons name="wallet-outline" size={22} color={theme.foreground} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`${t("home.createEntry")}, ${t("home.createEntryDetail")}`}
            onPress={() => { actions.current?.dismiss(); router.push("/post"); }} style={styles.choice}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text preset="rowName">{t("home.createEntry")}</Text>
              <Text variant="meta" tone="muted">{t("home.createEntryDetail")}</Text>
            </View>
            <Ionicons name="create-outline" size={22} color={theme.foreground} />
          </Pressable>
        </BottomSheetView>
      </Sheet>} />}
      {placeOpen && <HomePlaceSetup defaults={defaults} subject={subject} unlocking={accountCount === 1 && level === 0} onClose={() => setPlaceOpen(false)} />}
  </>;
  return <ConnectingHandover ready={activity !== undefined}>
    <Presentation legacy={<Screen contentStyle={{ gap: spacing.xl, paddingTop: spacing.md }}>{content}</Screen>}>
      <Screen contentStyle={{ gap: 0 }} footer={<ActionBar primary={{ label: t("posting.title"), icon: "add", onPress: () => router.push("/post") }} />}>{content}</Screen>
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
