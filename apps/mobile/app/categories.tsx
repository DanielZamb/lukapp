import { useAuth } from "@clerk/expo";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { CategoryManager } from "../src/features/categories/CategoryManager";
import { Screen } from "../src/ui/core";

export default function CategoriesRoute() {
  const defaults = usePersonalDefaults();
  const { userId } = useAuth();
  const { categoryId } = useLocalSearchParams<{ categoryId?: string }>();
  if (defaults === null) return <Redirect href="/" />;
  if (!defaults || !userId) return <Screen><ActivityIndicator /></Screen>;
  return <CategoryManager key={`${userId}:${defaults.workspace.id}`} workspaceId={defaults.workspace.id}
    subject={userId} profileId={defaults.financialAccountProfile.id} currency={defaults.workspace.functionalCurrency}
    timeZone={defaults.workspace.timeZone} initialCategoryId={categoryId} onBack={() => router.back()} />;
}
