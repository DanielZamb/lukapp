import { useClerk } from "@clerk/expo";
import { router } from "expo-router";
import { Text } from "react-native";
import { Header, Screen, SecondaryButton, ui } from "../src/ui/core";
export default function Settings() {
  const { signOut } = useClerk();
  return (
    <Screen>
      <Header title="You" onBack={() => router.back()} />
      <Text style={ui.body}>Personal finances</Text>
      <SecondaryButton label="Sign out" onPress={() => void signOut()} />
    </Screen>
  );
}
