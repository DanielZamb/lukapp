import { router, Redirect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Text } from "react-native";
import {
  usePersonalDefaults,
  usePostedActivity,
} from "../src/features/activity";
import { ActivityRows } from "../src/features/ActivityRows";
import { formatMoney } from "../src/features/money";
import { Header, PrimaryButton, Screen, ui } from "../src/ui/core";

function Account({
  workspaceId,
  profileId,
}: {
  workspaceId: string;
  profileId: string;
}) {
  const activity = usePostedActivity(workspaceId);
  const { posted } = useLocalSearchParams<{ posted?: string }>();
  const account = activity?.accounts.find(
    (a) => a.financialAccountProfileId === profileId,
  );
  return (
    <Screen>
      <Header title="My money" eyebrow="CASH" onBack={() => router.back()} />
      {posted && (
        <Text accessibilityRole="alert" style={ui.body}>
          ✓ Posted
        </Text>
      )}
      <Text style={ui.muted}>Current balance</Text>
      {account ? (
        <Text adjustsFontSizeToFit numberOfLines={1} style={ui.hero}>
          {formatMoney(account.balance)}
        </Text>
      ) : (
        <ActivityIndicator />
      )}
      <PrimaryButton label="Post money" onPress={() => router.push("/post")} />
      <Text style={ui.title}>Recent activity</Text>
      {activity && (
        <ActivityRows
          rows={activity.rows
            .filter((r) => r.financialAccountProfileId === profileId)
            .slice(0, 3)}
        />
      )}
    </Screen>
  );
}
export default function AccountRoute() {
  const defaults = usePersonalDefaults();
  return defaults ? (
    <Account
      workspaceId={defaults.workspace.id}
      profileId={defaults.financialAccountProfile.id}
    />
  ) : defaults === null ? (
    <Redirect href="/" />
  ) : (
    <Screen>
      <ActivityIndicator />
    </Screen>
  );
}
