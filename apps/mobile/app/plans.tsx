import { useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import { ActivityIndicator } from "react-native";
import { usePersonalDefaults } from "../src/features/activity";
import { api } from "../src/features/api";
import { Header, ListGroup, ListRow, Screen } from "../src/ui/core";

function savingsRecoveryDetail(plans: { title: string }[]): string | undefined {
  if (plans.length === 0) return undefined;
  if (plans.length === 1) return plans[0].title;
  return `${plans.length} plans`;
}

export default function PlansRoute() {
  const defaults = usePersonalDefaults();
  const workspaceId = defaults?.workspace.id;
  const board = useQuery(
    api.savingsRecovery.evaluate,
    workspaceId ? { workspaceId } : "skip",
  );

  if (defaults === null) return <Redirect href="/" />;
  if (!defaults || board === undefined) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  }

  const detail = savingsRecoveryDetail(board.plans);

  return (
    <Screen>
      <Header title="Plans" onBack={() => router.back()} />
      <ListGroup>
        <ListRow title="Budget" detail="What is left in each category" onPress={() => router.push("/budget")} />
        <ListRow
          title="Savings recovery"
          {...(detail ? { detail } : {})}
          onPress={() => router.push("/recovery")}
        />
      </ListGroup>
    </Screen>
  );
}
