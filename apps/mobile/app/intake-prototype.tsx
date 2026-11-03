import { useAuth } from "@clerk/expo";
import { Redirect, router } from "expo-router";
import { ActivityIndicator } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { NotificationFirst } from "../src/features/intake/prototype/NotificationFirst";
import { Screen } from "../src/ui/core";

/** PROTOTYPE route: notification-first review. Reached from the intake hub in dev or beta builds. */
export default function IntakePrototypeRoute() {
  const defaults = usePersonalDefaults();
  const { userId } = useAuth();
  if (defaults === undefined || !userId) return <Screen><ActivityIndicator accessibilityLabel="Loading current workspace" /></Screen>;
  if (defaults === null) return <Redirect href="/" />;
  return <NotificationFirst key={defaults.workspace.id} subject={userId} workspaceId={defaults.workspace.id}
    currency={defaults.workspace.functionalCurrency} timeZone={defaults.workspace.timeZone}
    defaultProfileId={defaults.financialAccountProfile.id} onBack={() => router.back()} />;
}
