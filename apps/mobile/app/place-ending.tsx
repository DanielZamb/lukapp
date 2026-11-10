import { Redirect, router, useLocalSearchParams } from "expo-router";
import { ActivityIndicator } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { PlaceEndingFlow } from "../src/features/placeEnding/PlaceEndingFlow";
import { Screen } from "../src/ui/core";

export default function PlaceEndingRoute() {
  const defaults = usePersonalDefaults();
  const { profileId } = useLocalSearchParams<{ profileId?: string }>();
  if (defaults === null) return <Redirect href="/" />;
  if (!defaults) return <Screen><ActivityIndicator /></Screen>;
  // A direct link without a Place has no caller to return to.
  if (!profileId) return <Redirect href="/places" />;
  const toPlaces = () => router.dismissTo("/places");
  const toAccount = () => router.canGoBack() ? router.back() : router.replace({ pathname: "/account", params: { profileId } });
  return <PlaceEndingFlow key={`${defaults.workspace.id}:${profileId}`} workspaceId={defaults.workspace.id} profileId={profileId}
    onBack={toAccount} onStarted={toAccount} onEnded={toPlaces} onSources={() => router.push("/intake")} />;
}
