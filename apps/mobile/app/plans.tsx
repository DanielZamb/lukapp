import { router } from "expo-router";
import { Header, ListGroup, ListRow, Screen } from "../src/ui/core";

export default function PlansRoute() {
  return (
    <Screen>
      <Header title="Plans" onBack={() => router.back()} />
      <ListGroup>
        <ListRow title="Budget" detail="What is left in each category" onPress={() => router.push("/budget")} />
        <ListRow title="Savings Recovery" detail="Replenish an expense through saving" onPress={() => router.push("/recovery")} />
      </ListGroup>
    </Screen>
  );
}
