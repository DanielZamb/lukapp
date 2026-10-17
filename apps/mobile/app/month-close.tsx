import { useAuth } from "@clerk/expo";
import { Redirect, router } from "expo-router";
import { ActivityIndicator } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { MonthClose } from "../src/features/monthClose/MonthClose";
import { Screen } from "../src/ui/core";

export default function MonthCloseRoute() {
  const defaults = usePersonalDefaults();
  const { userId } = useAuth();
  return defaults && userId ? (
    <MonthClose
      workspaceId={defaults.workspace.id}
      timeZone={defaults.workspace.timeZone}
      currentPeriod={defaults.workspace.currentAccountingPeriod}
      subject={userId}
      onBack={() => router.back()}
      onReviewDrafts={() => router.replace("/drafts")}
    />
  ) : defaults === null ? (
    <Redirect href="/" />
  ) : (
    <Screen>
      <ActivityIndicator />
    </Screen>
  );
}
