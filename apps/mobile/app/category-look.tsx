import { Redirect, router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { CategoryLook } from "../src/features/categoryLook/CategoryLook";
import { Screen } from "../src/ui/core";

export default function CategoryLookRoute() {
  const defaults = usePersonalDefaults();
  const { categoryId } = useLocalSearchParams<{ categoryId?: string }>();
  if (defaults === undefined) return <Screen><ActivityIndicator /></Screen>;
  if (defaults === null) return <Redirect href="/" />;
  if (!categoryId) return <Redirect href="/overview" />;
  return <CategoryLook workspaceId={defaults.workspace.id} timeZone={defaults.workspace.timeZone}
    categoryId={categoryId} onBack={() => router.back()} onSetLimit={() => router.push("/budget")} />;
}
