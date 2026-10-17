import { router, Redirect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Text } from "react-native";
import {
  usePersonalDefaults,
  usePostedActivity,
  useRecentActivity,
} from "../src/features/activity";
import { ActivityRows } from "../src/features/ActivityRows";
import { formatMoney } from "../src/features/money";
import { Header, PrimaryButton, Screen, SecondaryButton, ui } from "../src/ui/core";

function Account({
  workspaceId,
  profileId,
  timeZone,
}: {
  workspaceId: string;
  profileId: string;
  timeZone: string;
}) {
  const activity = usePostedActivity(workspaceId, timeZone);
  const recent = useRecentActivity(workspaceId, 3, profileId);
  const { posted } = useLocalSearchParams<{ posted?: string }>();
  const account = activity?.accounts.find(
    (a) => a.financialAccountProfileId === profileId,
  );
  return (
    <Screen>
      <Header title={account?.name ?? "My money"} onBack={() => router.back()} />
      {posted && (
        <Text accessibilityRole="alert" style={ui.body}>
          ✓ Posted
        </Text>
      )}
      <Text style={ui.muted}>{account?.nature === "Liability" ? "Balance owed" : "Current balance"}</Text>
      {account ? (
        <Text adjustsFontSizeToFit numberOfLines={1} style={ui.hero}>
          {formatMoney(account.balance)}
        </Text>
      ) : (
        <ActivityIndicator />
      )}
      <PrimaryButton
        label="Post money"
        onPress={() =>
          router.push({ pathname: "/post", params: { profileId } })
        }
      />
      <Text style={ui.title}>Recent activity</Text>
      {recent && (
        <ActivityRows
          rows={recent.page}
          onEntry={(entryId) => router.push({ pathname: "/entry", params: { entryId } })}
        />
      )}
      <SecondaryButton label="View all activity" onPress={() => router.push({ pathname: "/history", params: { profileId } })} />
    </Screen>
  );
}
export default function AccountRoute() {
  const defaults = usePersonalDefaults();
  const { profileId } = useLocalSearchParams<{ profileId?: string }>();
  return defaults ? (
    <Account
      workspaceId={defaults.workspace.id}
      profileId={profileId ?? defaults.financialAccountProfile.id}
      timeZone={defaults.workspace.timeZone}
    />
  ) : defaults === null ? (
    <Redirect href="/" />
  ) : (
    <Screen>
      <ActivityIndicator />
    </Screen>
  );
}
