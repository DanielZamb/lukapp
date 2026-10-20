import { Redirect, router, useNavigation } from "expo-router";
import { CommonActions } from "@react-navigation/native";
import { ActivityIndicator } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { Recovery } from "../src/features/recovery/Recovery";
import { Screen } from "../src/ui/core";

export default function RecoveryRoute() {
  const defaults = usePersonalDefaults();
  const navigation = useNavigation();
  return defaults
    ? <Recovery
        key={defaults.workspace.id}
        workspaceId={defaults.workspace.id}
        timeZone={defaults.workspace.timeZone}
        onBack={() => router.back()}
        onViewPlans={() => navigation.dispatch(CommonActions.reset({ index: 1, routes: [{ name: "index" }, { name: "plans" }] }))}
        onHome={() => navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: "index" }] }))}
      />
    : defaults === null ? <Redirect href="/" /> : <Screen><ActivityIndicator /></Screen>;
}
