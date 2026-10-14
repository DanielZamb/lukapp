import { router } from "expo-router";
import { Copy, Header, PrimaryButton, Screen, SecondaryButton } from "../ui";
import { useRuntime } from "../access/RuntimeProvider";
export default function User() {
  const { controller, fixture } = useRuntime();
  return <Screen><Header title="User and Workspace" back={{ label: "Back home", onPress: () => router.back() }} />
    <Copy title="Your Workspace" detail="You can deliberately set up a Household or add another place." />
    <PrimaryButton label="Set up a Household" onPress={() => router.push("/account-setup?household=1")} />
    <SecondaryButton label="Add another place" onPress={() => router.push("/account-setup")} />
    <Copy title="Appearance" detail="Follows your device appearance." />
    <SecondaryButton label="Security and devices" onPress={() => router.push("/security")} />
    <SecondaryButton label="Lock now" onPress={() => controller.lock()} />
    <SecondaryButton label="Sign out" onPress={() => { void controller.wipe(); }} />
    {__DEV__ && <SecondaryButton label={fixture ? "Controlled native verification" : "Development public verification"} onPress={() => router.push("/native-proof")} />}
  </Screen>;
}
