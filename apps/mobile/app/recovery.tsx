import { Redirect, router } from "expo-router";
import { ActivityIndicator } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { Recovery } from "../src/features/recovery/Recovery";
import { Screen } from "../src/ui/core";

export default function RecoveryRoute() {
  const defaults = usePersonalDefaults();
  return defaults
    ? <Recovery
        key={defaults.workspace.id}
        workspaceId={defaults.workspace.id}
        onBack={() => router.back()}
        onViewPlans={() => router.dismissTo("/plans")}
        onHome={() => router.dismissTo("/")}
      />
    : defaults === null ? <Redirect href="/" /> : <Screen><ActivityIndicator /></Screen>;
}
