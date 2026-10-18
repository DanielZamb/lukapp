import { Redirect, router } from "expo-router";
import { ActivityIndicator } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { AlertsScreen } from "../src/features/attention/AlertsScreen";
import { useAttention } from "../src/features/attention/useAttention";
import { Screen } from "../src/ui/core";

function Alerts({ input }: { input: Parameters<typeof useAttention>[0] }) {
  const alerts = useAttention(input);
  return <AlertsScreen state={alerts} onBack={() => router.back()}
    onOpen={(destination) => router.push(destination)} />;
}

export default function AlertsRoute() {
  const defaults = usePersonalDefaults();
  if (defaults === null) return <Redirect href="/" />;
  if (!defaults) return <Screen><ActivityIndicator /></Screen>;
  return <Alerts key={defaults.workspace.id} input={{
    workspaceId: defaults.workspace.id,
    timeZone: defaults.workspace.timeZone,
  }} />;
}
