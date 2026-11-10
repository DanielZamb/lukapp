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
import { accountEmoji, placesTotal, placeTitle } from "../src/features/places/model";
import { usePlaceStyles } from "../src/features/places/styles";
import { useWorkspaceCalendar } from "../src/features/useWorkspaceCalendar";
import { useT } from "../src/i18n";
import { Header, PrimaryButton, Screen, useTheme, useUi } from "../src/ui/core";

function Places({ defaults, subject }: {
  defaults: NonNullable<ReturnType<typeof usePersonalDefaults>>;
  subject: string;
}) {
  const styles = usePlaceStyles();
  const theme = useTheme();
  const ui = useUi();
  const { t, tn } = useT();
  const { workspace } = defaults;
  const activity = usePostedActivity(workspace.id, workspace.timeZone);
  const { month } = useWorkspaceCalendar(workspace.timeZone);
  const budget = useQuery(api.budget.evaluate, { workspaceId: workspace.id, month });
  const [placeOpen, setPlaceOpen] = useState(false);
  const count = activity?.accounts.length ?? 0;
  const many = count > 1;
  const title = !activity ? "" : many ? t("places.title") : activity.accounts[0] ? placeTitle(activity.accounts[0].name, count, t) : t("planning.myMoney");
  const ready = activity !== undefined && budget !== undefined;
  const unlocking = ready && activity.accounts.length === 1 && experienceLevel(activity.accounts.length, budget.jars.length) === 0;
  return <Screen contentStyle={styles.page}>
    <Header titleStyle={styles.pageTitle} title={title} eyebrow={many ? t("places.eyebrowMany") : t("places.eyebrowOne")} onBack={() => router.back()} />
    {activity ? <>
      <View style={styles.hero}>
        <Text style={styles.muted}>{t("places.now")}</Text>
        <Text style={styles.amount} adjustsFontSizeToFit numberOfLines={1}>
          {formatMoney(placesTotal(activity.accounts, workspace.functionalCurrency), { hideZeroDecimals: true })}
        </Text>
        <Text style={styles.muted}>{many ? tn("places.across", activity.accounts.length) : t("places.onePool")}</Text>
      </View>
      <View style={styles.group}>
        {activity.accounts.map((account) => { const name = placeTitle(account.name, count, t);
          const isDefault = many && account.financialAccountProfileId === defaults.financialAccountProfile.id;
          return <View key={account.financialAccountProfileId} style={styles.row}>
          <Pressable accessibilityRole="button" accessibilityLabel={isDefault ? t("workspace.defaultPlaceA11y", { name }) : name}
            style={styles.placeButton}
            onPress={() => router.push({ pathname: "/account", params: { profileId: account.financialAccountProfileId } })}>
            <Text style={styles.placeGlyph}>{accountEmoji(account)}</Text>
            <Text style={styles.name}>{name}</Text>
            {isDefault && <Text style={styles.badge}>{t("workspace.defaultBadge")}</Text>}
            <Text style={styles.value}>{formatMoney(account.balance, { hideZeroDecimals: true })}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t("places.historyA11y", { name })} style={styles.icon}
            onPress={() => router.push({ pathname: "/history", params: { profileId: account.financialAccountProfileId } })}>
            <Ionicons name="receipt-outline" size={18} color={theme.foreground} />
          </Pressable>
        </View>; })}
      </View>
      {activity.accounts.length === 0 && <Text style={ui.muted}>{t("places.empty")}</Text>}
    </> : <ActivityIndicator accessibilityLabel={t("places.loading")} />}
    <PrimaryButton label={t("places.add")} trailingIcon="add" disabled={!ready} onPress={() => setPlaceOpen(true)} />
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
