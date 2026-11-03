import { Redirect, router } from "expo-router";
import { ActivityIndicator } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { IntakeSetup } from "../src/features/intake/IntakeSetup";
import { Screen } from "../src/ui/core";

export default function IntakeRoute() {
  const defaults = usePersonalDefaults();
  if (defaults === undefined) return <Screen><ActivityIndicator accessibilityLabel="Loading current workspace" /></Screen>;
  if (defaults === null) return <Redirect href="/" />;
  return <IntakeSetup key={defaults.workspace.id} workspaceId={defaults.workspace.id}
    onBack={() => router.back()} onInbox={() => router.push("/drafts")}
    onPrototype={() => router.push("/intake-prototype")} />;
}
