import { Redirect, router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator } from "react-native";
import { Budget } from "../src/features/budget/Budget";
import { usePersonalDefaults } from "../src/features/activity";
import { Screen } from "../src/ui/core";

export default function BudgetRoute() {
  const { categoryId } = useLocalSearchParams<{ categoryId?: string }>();
  const defaults = usePersonalDefaults();
  return defaults ? (
    <Budget
      key={defaults.workspace.id}
      workspaceId={defaults.workspace.id}
      timeZone={defaults.workspace.timeZone}
      initialCategoryId={categoryId}
      onBack={() => router.back()}
    />
  ) : defaults === null ? (
    <Redirect href="/" />
  ) : (
    <Screen>
      <ActivityIndicator />
    </Screen>
  );
}
