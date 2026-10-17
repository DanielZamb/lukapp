import { router } from "expo-router";
import { Text } from "react-native";
import { Header, Screen, ui } from "../src/ui/core";

export default function MonthCloseRoute() {
  return (
    <Screen>
      <Header title="Month Close" eyebrow="LATER UNIT" onBack={() => router.back()} />
      <Text style={ui.body}>
        Month Close stays a footer on Drafts. Locking the period is a later unit.
      </Text>
    </Screen>
  );
}
