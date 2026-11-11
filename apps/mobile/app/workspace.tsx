import { Redirect, router } from "expo-router";
import { ActivityIndicator } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { WorkspaceSettings } from "../src/features/workspace/WorkspaceSettings";
import { Screen } from "../src/ui/core";

export default function WorkspaceRoute() {
  const defaults = usePersonalDefaults();
  if (defaults === null) return <Redirect href="/" />;
  if (!defaults) return <Screen><ActivityIndicator /></Screen>;
  return <WorkspaceSettings workspaceId={defaults.workspace.id}
    onBack={() => router.canGoBack() ? router.back() : router.replace("/settings")} />;
}
