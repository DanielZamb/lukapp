import { Redirect, router } from "expo-router";
import { ActivityIndicator } from "react-native";
import { Budget } from "../src/features/budget/Budget";
import { usePersonalDefaults } from "../src/features/activity";
import { Screen } from "../src/ui/core";

export default function BudgetRoute() {
  const defaults = usePersonalDefaults();
  return defaults ? <Budget key={defaults.workspace.id} workspaceId={defaults.workspace.id} onBack={() => router.back()} />
    : defaults === null ? <Redirect href="/" /> : <Screen><ActivityIndicator /></Screen>;
}
