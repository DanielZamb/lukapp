import { Redirect, router } from "expo-router";
import { ActivityIndicator } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { IntakeSetup } from "../src/features/intake/IntakeSetup";
import { Screen } from "../src/ui/core";
import { useT } from "../src/i18n";

export default function IntakeRoute() {
  const { t } = useT();
  const defaults = usePersonalDefaults();
  if (defaults === undefined) return <Screen><ActivityIndicator accessibilityLabel={t("inbox.loadingWorkspaceA11y")} /></Screen>;
  if (defaults === null) return <Redirect href="/" />;
  return <IntakeSetup key={defaults.workspace.id} workspaceId={defaults.workspace.id}
    onBack={() => router.back()}
    onPrototype={() => router.push("/intake-prototype")} />;
}
