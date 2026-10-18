import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import { useAuth } from "@clerk/expo";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import {
  usePersonalDefaults,
  usePostedActivity,
} from "../src/features/activity";
import { formatMoney } from "../src/features/money";
import {
  calendarMonthShape,
  monthPaceProgress,
  projectedMonthSpendMinorUnits,
} from "../src/features/monthPace";
import { Setup } from "../src/features/Setup";
import { spentMonthEyebrow } from "../src/features/timeZones";
import { useWorkspaceCalendar } from "../src/features/useWorkspaceCalendar";
import { useAttention } from "../src/features/attention/useAttention";
import { updatesDetail } from "../src/features/attention/model";
import {
  ActionTile,
  ConfirmationScreen,
  Header,
  PrimaryButton,
  ProgressBar,
  Screen,
  SecondaryButton,
  ui,
} from "../src/ui/core";
import { spacing, touchTarget } from "../src/ui/tokens";

function Home({
  workspaceId,
  currency,
  timeZone,
  subject,
  currentPeriod,
}: {
  workspaceId: string;
  currency: string;
  timeZone: string;
  subject: string;
  currentPeriod: Parameters<typeof useAttention>[0]["currentPeriod"];
}) {
  const calendar = useWorkspaceCalendar(timeZone);
  const activity = usePostedActivity(workspaceId, timeZone);
  const { inboxCount, alerts } = useAttention({
    subject,
    workspaceId,
    currency,
    timeZone,
    currentPeriod,
  });
  const actions = useRef<BottomSheetModal>(null);
  const [paceOpen, setPaceOpen] = useState(false);
  const { posted } = useLocalSearchParams<{ posted?: string }>();
  const { day, daysInMonth } = calendarMonthShape(calendar.date);
  const paceProgress = monthPaceProgress(day, daysInMonth);
  const projectedMinorUnits =
    activity === undefined
      ? 0
      : projectedMonthSpendMinorUnits(
          activity.monthSpendMinorUnits,
          day,
          daysInMonth,
        );
  const projectedLabel = formatMoney(
    {
      currency,
      minorUnits: currency === "COP"
        ? Math.round(projectedMinorUnits / 100) * 100
        : projectedMinorUnits,
    },
    { hideZeroDecimals: true },
  );
  return (
    <Screen>
      <Header
        title=""
        eyebrow={spentMonthEyebrow(timeZone, calendar.now)}
        onUser={() => router.push("/settings")}
      />
      {posted && (
        <Text accessibilityRole="alert" style={ui.body}>
          ✓ Posted
        </Text>
      )}
      <View style={{ gap: spacing.lg, marginVertical: spacing.section }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Money actions"
          onPress={() => actions.current?.present()}
          style={{ minHeight: touchTarget, justifyContent: "center" }}
        >
          {activity ? (
            <Text adjustsFontSizeToFit numberOfLines={1} style={ui.hero}>
              {formatMoney(
                {
                  currency,
                  minorUnits: activity.monthSpendMinorUnits,
                },
                { hideZeroDecimals: true },
              )}
            </Text>
          ) : (
            <ActivityIndicator />
          )}
        </Pressable>
        {activity ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show month pace details"
            accessibilityState={{ expanded: paceOpen }}
            onPress={() => setPaceOpen((open) => !open)}
            style={{ minHeight: touchTarget, justifyContent: "center", gap: spacing.md }}
          >
            <ProgressBar
              value={paceProgress}
              label={`Day ${day} of ${daysInMonth}`}
            />
            {paceOpen ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
                <Text style={[ui.muted, { flex: 1 }]}>
                  Day {day} of {daysInMonth}
                </Text>
                <Text style={[ui.muted, { flex: 1 }]}>
                  On pace for{"\n"}
                  {projectedLabel}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.lg }}>
        <ActionTile
          title="Drafts"
          detail="On this device"
          icon="document-text-outline"
          primary
          count={inboxCount}
          onPress={() => router.push("/drafts")}
        />
        <ActionTile
          title="Alerts"
          detail={updatesDetail(alerts)}
          icon="notifications-outline"
          onPress={() => router.push("/alerts")}
        />
        <ActionTile title="Plans" detail="Budget & recovery" icon="layers-outline" onPress={() => router.push("/plans")} />
        <ActionTile
          icon="pie-chart-outline"
          title="Overview"
          detail="Accounts & activity"
          onPress={() => router.push("/overview")}
        />
      </View>
      <BottomSheetModal
        ref={actions}
        snapPoints={["35%"]}
        enableDynamicSizing={false}
      >
        <BottomSheetView style={{ padding: spacing.xxl, gap: spacing.xl }}>
          <Header title="What do you want to do?" />
          <PrimaryButton
            label="Post money"
            onPress={() => {
              actions.current?.dismiss();
              router.push("/post");
            }}
          />
          <SecondaryButton
            label="My money"
            onPress={() => {
              actions.current?.dismiss();
              router.push("/account");
            }}
          />
        </BottomSheetView>
      </BottomSheetModal>
    </Screen>
  );
}
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
      workspaceId={defaults.workspace.id}
      currency={defaults.workspace.functionalCurrency}
      timeZone={defaults.workspace.timeZone}
      subject={userId}
      currentPeriod={defaults.workspace.currentAccountingPeriod}
    />
  );
}
