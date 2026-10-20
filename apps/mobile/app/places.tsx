import { useAuth } from "@clerk/expo";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { usePersonalDefaults, usePostedActivity } from "../src/features/activity";
import { api } from "../src/features/api";
import { HomePlaceSetup } from "../src/features/HomePlaceSetup";
import { experienceLevel } from "../src/features/levelDoor/model";
import { formatMoney } from "../src/features/money";
import { accountEmoji, placesTotal } from "../src/features/places/model";
import { usePlaceStyles } from "../src/features/places/styles";
import { useWorkspaceCalendar } from "../src/features/useWorkspaceCalendar";
import { Header, PrimaryButton, Screen, useTheme, useUi } from "../src/ui/core";

function Places({ defaults, subject }: {
  defaults: NonNullable<ReturnType<typeof usePersonalDefaults>>;
  subject: string;
}) {
  const styles = usePlaceStyles();
  const theme = useTheme();
  const ui = useUi();
  const { workspace } = defaults;
  const activity = usePostedActivity(workspace.id, workspace.timeZone);
  const { month } = useWorkspaceCalendar(workspace.timeZone);
  const budget = useQuery(api.budget.evaluate, { workspaceId: workspace.id, month });
  const [placeOpen, setPlaceOpen] = useState(false);
  const many = (activity?.accounts.length ?? 0) > 1;
  const ready = activity !== undefined && budget !== undefined;
  const unlocking = ready && activity.accounts.length === 1 && experienceLevel(activity.accounts.length, budget.jars.length) === 0;
  return <Screen contentStyle={styles.page}>
    <Header titleStyle={styles.pageTitle} title={many ? "Places" : "My money"} eyebrow={many ? "YOUR PLACES" : "ONE POOL"} onBack={() => router.back()} />
    {activity ? <>
      <View style={styles.hero}>
        <Text style={styles.muted}>What you have now</Text>
        <Text style={styles.amount} adjustsFontSizeToFit numberOfLines={1}>
          {formatMoney(placesTotal(activity.accounts, workspace.functionalCurrency), { hideZeroDecimals: true })}
        </Text>
        <Text style={styles.muted}>{many ? `Across ${activity.accounts.length} places`
          : "Bank and pocket are still one pool. Add a place when money lives apart."}</Text>
      </View>
      <View style={styles.group}>
        {activity.accounts.map((account) => <View key={account.financialAccountProfileId} style={styles.row}>
          <Pressable accessibilityRole="button" accessibilityLabel={account.name} style={styles.placeButton}
            onPress={() => router.push({ pathname: "/account", params: { profileId: account.financialAccountProfileId } })}>
            <Text style={styles.placeGlyph}>{accountEmoji(account)}</Text>
            <Text style={styles.name}>{account.name}</Text>
            <Text style={styles.value}>{formatMoney(account.balance, { hideZeroDecimals: true })}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Tx history for ${account.name}`} style={styles.icon}
            onPress={() => router.push({ pathname: "/history", params: { profileId: account.financialAccountProfileId } })}>
            <Ionicons name="receipt-outline" size={18} color={theme.foreground} />
          </Pressable>
        </View>)}
      </View>
      {activity.accounts.length === 0 && <Text style={ui.muted}>No places yet.</Text>}
    </> : <ActivityIndicator accessibilityLabel="Loading places" />}
    <PrimaryButton label="Add another place" trailingIcon="add" disabled={!ready} onPress={() => setPlaceOpen(true)} />
    {placeOpen && <HomePlaceSetup defaults={defaults} subject={subject} unlocking={unlocking} onClose={() => setPlaceOpen(false)} />}
  </Screen>;
}
export default function PlacesRoute() {
  const defaults = usePersonalDefaults();
  const { userId } = useAuth();
  if (defaults === null) return <Redirect href="/" />;
  return defaults && userId ? <Places key={`${userId}:${defaults.workspace.id}`} defaults={defaults} subject={userId} />
    : <Screen><ActivityIndicator /></Screen>;
}
