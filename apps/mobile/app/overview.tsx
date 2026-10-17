import { router, Redirect } from "expo-router";
import { ActivityIndicator, Text } from "react-native";
import {
  usePersonalDefaults,
  usePostedActivity,
} from "../src/features/activity";
import { ActivityRows } from "../src/features/ActivityRows";
import { formatMoney } from "../src/features/money";
import { Header, ListGroup, ListRow, Screen, ui } from "../src/ui/core";

function Overview({ workspaceId }: { workspaceId: string }) {
  const activity = usePostedActivity(workspaceId);
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
                value={formatMoney(account.balance)}
                onPress={() => router.push("/account")}
              />
            ))}
          </ListGroup>
          <Text style={ui.title}>Recent activity</Text>
          <ActivityRows rows={activity.rows.slice(0, 4)} />
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
    <Overview workspaceId={defaults.workspace.id} />
  ) : defaults === null ? (
    <Redirect href="/" />
  ) : (
    <Screen>
      <ActivityIndicator />
    </Screen>
  );
}
