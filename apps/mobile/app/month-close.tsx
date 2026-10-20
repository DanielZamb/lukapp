import { useAuth } from "@clerk/expo";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { MonthClose } from "../src/features/monthClose/MonthClose";
import { periodFromMonthKey } from "../src/features/monthClose/model";
import { Screen } from "../src/ui/core";

export default function MonthCloseRoute() {
  const defaults = usePersonalDefaults();
  const { userId } = useAuth();
  const { month } = useLocalSearchParams<{ month?: string }>();
  if (!defaults || !userId)
    return defaults === null ? (
      <Redirect href="/" />
    ) : (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  const current = defaults.workspace.currentAccountingPeriod;
  const requestedPeriod = month
    ? periodFromMonthKey(Array.isArray(month) ? month[0] : month)
    : { year: current.year, month: current.month };
  return (
    <MonthClose
      workspaceId={defaults.workspace.id}
      requestedPeriod={requestedPeriod}
      currentPeriod={current}
      subject={userId}
      currency={defaults.workspace.functionalCurrency}
      onBack={() => router.back()}
      onReviewDrafts={() => router.replace("/drafts")}
      onAccountBalances={() => router.push("/overview")}
      onOverview={() => router.replace("/overview")}
      onRecovery={() => router.push("/recovery")}
      onHome={() => router.replace("/")}
    />
  );
}
