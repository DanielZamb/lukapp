import { useAuth } from "@clerk/expo";
import { Redirect, router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { AlertsScreen } from "../src/features/attention/AlertsScreen";
import { useAttention } from "../src/features/attention/useAttention";
import { Screen } from "../src/ui/core";

function Alerts({ input, onRetry }: {
  input: Parameters<typeof useAttention>[0];
  onRetry: () => void;
}) {
  const { alerts } = useAttention(input);
  return <AlertsScreen state={alerts} onBack={() => router.back()}
    onOpen={(destination) => router.push(destination)} onRetry={onRetry} />;
}

export default function AlertsRoute() {
  const defaults = usePersonalDefaults();
  const { userId } = useAuth();
  const [retry, setRetry] = useState(0);
  if (defaults === null) return <Redirect href="/" />;
  if (!defaults || !userId) return <Screen><ActivityIndicator /></Screen>;
  return <Alerts key={`${userId}:${defaults.workspace.id}:${retry}`} input={{
    subject: userId,
    workspaceId: defaults.workspace.id,
    currency: defaults.workspace.functionalCurrency,
    timeZone: defaults.workspace.timeZone,
    currentPeriod: defaults.workspace.currentAccountingPeriod,
  }} onRetry={() => setRetry((value) => value + 1)} />;
}
