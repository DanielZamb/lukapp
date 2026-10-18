import { useAction } from "convex/react";
import { router, Redirect, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { usePersonalDefaults, usePostedActivity, useRecentActivity } from "../src/features/activity";
import { api } from "../src/features/api";
import { formatActivityAmount } from "../src/features/history/format";
import { formatMoney } from "../src/features/money";
import { EmojiSheet } from "../src/features/places/EmojiSheet";
import { accountEmoji, accountKinds, trackingDate } from "../src/features/places/model";
import { styles } from "../src/features/places/styles";
import { Header, ListGroup, ListRow, PrimaryButton, Screen, theme, ui } from "../src/ui/core";

function Account({ workspaceId, profileId, timeZone }: {
  workspaceId: string;
  profileId: string;
  timeZone: string;
}) {
  const activity = usePostedActivity(workspaceId, timeZone);
  const recent = useRecentActivity(workspaceId, 3, profileId);
  const changeLook = useAction(api.accounting.changeAccountLook);
  const [emoji, setEmoji] = useState<string | null>(null);
  const { posted } = useLocalSearchParams<{ posted?: string }>();
  const account = activity?.accounts.find((a) => a.financialAccountProfileId === profileId);
  return <Screen contentStyle={styles.page}>
    <Header titleStyle={styles.pageTitle} title={account?.name ?? "My money"} eyebrow="PLACE" onBack={() => router.back()} />
    {posted && <Text accessibilityRole="alert" style={ui.body}>✓ Posted</Text>}
    {account ? <>
      <View style={styles.hero}>
        <Pressable accessibilityRole="button" accessibilityLabel="Change look" onPress={() => setEmoji(accountEmoji(account))}>
          <Text style={styles.heroEmoji}>{accountEmoji(account)}</Text>
        </Pressable>
        <Text style={styles.muted}>Current balance</Text>
        <Text adjustsFontSizeToFit numberOfLines={1} style={styles.detailAmount}>
          {formatMoney(account.balance, { hideZeroDecimals: true })}
        </Text>
      </View>
      <PrimaryButton label="See in tx history" trailingIcon="receipt-outline"
        onPress={() => router.push({ pathname: "/history", params: { profileId } })} />
      <ListGroup>
        <ListRow title="Type" value={accountKinds[account.productKind]} />
        <ListRow title="Currency" value={account.balance.currency} />
        <ListRow title="Tracking from" value={trackingDate(account.trackingFrom)} />
      </ListGroup>
      <Text style={ui.title}>Recent activity</Text>
      {recent ? <ListGroup>
        {recent.page.length === 0 ? <ListRow title="No activity yet" detail="New entries will appear here" />
          : recent.page.slice(0, 3).map((row) => <ListRow key={row.id} title={row.title} detail={row.date}
            value={formatActivityAmount(row.amount)} valueStyle={{ color: row.amount.minorUnits > 0 ? theme.primary : theme.foreground }} />)}
      </ListGroup> : <ActivityIndicator accessibilityLabel="Loading recent activity" />}
      {emoji !== null && <EmojiSheet emoji={emoji} onPick={setEmoji} onDismiss={() => setEmoji(null)}
        onUse={async () => { await changeLook({ workspaceId, financialAccountProfileId: profileId, emoji }); }} />}
    </> : activity ? <Text style={ui.muted}>Place not found.</Text> : <ActivityIndicator accessibilityLabel="Loading place" />}
  </Screen>;
}
export default function AccountRoute() {
  const defaults = usePersonalDefaults();
  const { profileId } = useLocalSearchParams<{ profileId?: string }>();
  return defaults ? <Account key={profileId ?? defaults.financialAccountProfile.id} workspaceId={defaults.workspace.id}
    profileId={profileId ?? defaults.financialAccountProfile.id} timeZone={defaults.workspace.timeZone} />
    : defaults === null ? <Redirect href="/" /> : <Screen><ActivityIndicator /></Screen>;
}
