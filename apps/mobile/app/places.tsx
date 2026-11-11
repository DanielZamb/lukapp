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
import { formatLongDate, useT } from "../src/i18n";
import { accountEmoji, placesTotal, placeTitle, type Place } from "../src/features/places/model";
import { usePlaceStyles } from "../src/features/places/styles";
import { everyPlace } from "../src/features/placeEnding/model";
import { undoStatusLine, useUndoStatus } from "../src/features/placeEnding/UndoStatus";
import { useWorkspaceCalendar } from "../src/features/useWorkspaceCalendar";
import { Header, PrimaryButton, Screen, useTheme, useUi } from "../src/ui/core";

type Status = "open" | "undoing" | "closed" | "undone";

/** A Place being undone stays in the list, read-only, with the progress the backend reports. */
function UndoingRow({ workspaceId, account, timeZone }: { workspaceId: string; account: Place; timeZone: string }) {
  const styles = usePlaceStyles();
  const translator = useT();
  const operation = useUndoStatus(workspaceId, account.financialAccountProfileId, true);
  return <View style={styles.row}>
    <Pressable accessibilityRole="button" accessibilityLabel={account.name} style={styles.placeButton}
      onPress={() => router.push({ pathname: "/account", params: { profileId: account.financialAccountProfileId } })}>
      <Text style={styles.placeGlyph}>{accountEmoji(account)}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.name}>{account.name}</Text>
        <Text style={styles.muted}>{undoStatusLine(operation, account.name, translator, timeZone)}</Text>
      </View>
      <Text style={styles.value}>{formatMoney(account.balance, { hideZeroDecimals: true })}</Text>
    </Pressable>
  </View>;
}

/** An ended Place: which act ended it and on what day. */
function EndedRow({ account, status, endedAt, timeZone }: { account: Place; status: Status; endedAt: number | undefined; timeZone: string }) {
  const styles = usePlaceStyles();
  const { t, language } = useT();
  const date = endedAt === undefined ? null : formatLongDate(language, endedAt, timeZone);
  const ended = status === "closed" ? date ? t("placeEnding.closedOn", { date }) : t("placeEnding.closedAct")
    : date ? t("placeEnding.undoneOn", { date }) : t("placeEnding.undoneAct");
  return <View style={styles.row}>
    <Pressable accessibilityRole="button" accessibilityLabel={t("placeEnding.closedRowA11y", { name: account.name, ended })}
      style={styles.placeButton}
      onPress={() => router.push({ pathname: "/account", params: { profileId: account.financialAccountProfileId } })}>
      <Text style={styles.placeGlyph}>{accountEmoji(account)}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.name}>{account.name}</Text>
        <Text style={styles.muted}>{ended}</Text>
      </View>
    </Pressable>
  </View>;
}

function Places({ defaults, subject }: {
  defaults: NonNullable<ReturnType<typeof usePersonalDefaults>>;
  subject: string;
}) {
  const styles = usePlaceStyles();
  const theme = useTheme();
  const ui = useUi();
  const { t, tn } = useT();
  const { workspace } = defaults;
  const activity = usePostedActivity(workspace.id, workspace.timeZone, "all");
  const profiles = useQuery(api.accounting.listFinancialAccountProfiles, { workspaceId: workspace.id, ...everyPlace });
  const { month } = useWorkspaceCalendar(workspace.timeZone);
  const budget = useQuery(api.budget.evaluate, { workspaceId: workspace.id, month });
  const [placeOpen, setPlaceOpen] = useState(false);
  const profileOf = (id: string) => profiles?.find((profile) => profile.id === id);
  const statusOf = (id: string): Status | undefined => profileOf(id)?.status;
  const accounts = activity && profiles ? activity.accounts : undefined;
  const open = accounts?.filter((account) => statusOf(account.financialAccountProfileId) === "open") ?? [];
  const undoing = accounts?.filter((account) => statusOf(account.financialAccountProfileId) === "undoing") ?? [];
  const ended = accounts?.filter((account) => {
    const status = statusOf(account.financialAccountProfileId);
    return status === "closed" || status === "undone";
  }) ?? [];
  const count = open.length;
  const many = count > 1;
  const title = !accounts ? "" : many ? t("places.title") : open[0] ? placeTitle(open[0].name, count, t) : t("planning.myMoney");
  const ready = accounts !== undefined && budget !== undefined;
  const unlocking = ready && count === 1 && experienceLevel(count, budget) === 0;
  return <Screen contentStyle={styles.page}>
    <Header titleStyle={styles.pageTitle} title={title} eyebrow={many ? t("places.eyebrowMany") : t("places.eyebrowOne")} onBack={() => router.back()} />
    {accounts ? <>
      <View style={styles.hero}>
        <Text style={styles.muted}>{t("places.now")}</Text>
        <Text style={styles.amount} adjustsFontSizeToFit numberOfLines={1}>
          {formatMoney(placesTotal([...open, ...undoing], workspace.functionalCurrency), { hideZeroDecimals: true })}
        </Text>
        <Text style={styles.muted}>{many ? tn("places.across", count) : t("places.onePool")}</Text>
      </View>
      <View style={styles.group}>
        {open.map((account) => { const name = placeTitle(account.name, count, t);
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
        {undoing.map((account) => <UndoingRow key={account.financialAccountProfileId} workspaceId={workspace.id}
          account={account} timeZone={workspace.timeZone} />)}
      </View>
      {count === 0 && <Text style={ui.muted}>{t("places.empty")}</Text>}
    </> : <ActivityIndicator accessibilityLabel={t("places.loading")} />}
    <PrimaryButton label={t("places.add")} trailingIcon="add" disabled={!ready} onPress={() => setPlaceOpen(true)} />
    {ended.length > 0 && <View style={ui.section}>
      <Text accessibilityRole="header" style={ui.sectionHeading}>{t("placeEnding.closedSection")}</Text>
      <View style={styles.group}>
        {ended.map((account) => <EndedRow key={account.financialAccountProfileId} account={account}
          status={statusOf(account.financialAccountProfileId)!} endedAt={profileOf(account.financialAccountProfileId)?.endedAt}
          timeZone={workspace.timeZone} />)}
      </View>
    </View>}
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
