import { router, Redirect } from "expo-router";
import { ActivityIndicator } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { Overview } from "../src/features/overview/Overview";
import { Screen } from "../src/ui/core";

export default function OverviewRoute() {
  const defaults = usePersonalDefaults();
  return defaults ? (
    <Overview workspaceId={defaults.workspace.id} timeZone={defaults.workspace.timeZone}
      onBack={() => router.back()} onHistory={() => router.push("/history")} onCategory={() => router.push("/budget")} />
  ) : defaults === null ? (
    <Redirect href="/" />
  ) : (
    <Screen>
      <ActivityIndicator />
    </Screen>
  );
}
