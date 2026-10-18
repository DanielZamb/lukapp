import { router, Redirect } from "expo-router";
import { ActivityIndicator, Text } from "react-native";
import {
  usePersonalDefaults,
  usePostedActivity,
  useRecentActivity,
} from "../src/features/activity";
import { ActivityRows } from "../src/features/ActivityRows";
import { formatMoney } from "../src/features/money";
import { Header, ListGroup, ListRow, PrimaryButton, Screen, useUi } from "../src/ui/core";

function Overview({ workspaceId, timeZone }: { workspaceId: string; timeZone: string }) {
  const ui = useUi();
  const activity = usePostedActivity(workspaceId, timeZone);
  const recent = useRecentActivity(workspaceId, 4);
  return (
    <Screen>
      <Header title="Overview" onBack={() => router.back()} />
      {activity ? (
        <>
          <Text style={ui.label}>ACCOUNTS</Text>
          <ListGroup>
            {activity.accounts.map((account) => (
              <ListRow
                key={account.financialAccountProfileId}
                title={account.name}
                detail={account.nature === "Liability" ? "Owed" : undefined}
                value={formatMoney(account.balance)}
                onPress={() => router.push({ pathname: "/account", params: { profileId: account.financialAccountProfileId } })}
              />
            ))}
          </ListGroup>
          <Text style={ui.title}>Recent activity</Text>
          {recent ? <ActivityRows rows={recent.page} onEntry={(entryId) => router.push({ pathname: "/entry", params: { entryId } })} /> : <ActivityIndicator />}
          <PrimaryButton label="Go to tx history" trailingIcon="receipt-outline" onPress={() => router.push("/history")} />
        </>
      ) : (
        <ActivityIndicator />
      )}
    </Screen>
  );
}
export default function OverviewRoute() {
  const defaults = usePersonalDefaults();
  return defaults ? (
    <Overview workspaceId={defaults.workspace.id} timeZone={defaults.workspace.timeZone} />
  ) : defaults === null ? (
    <Redirect href="/" />
  ) : (
    <Screen>
      <ActivityIndicator />
    </Screen>
  );
}
