import { router } from "expo-router";
import { Screen, Header, Copy, PrimaryButton, SecondaryButton } from "../ui";
export default function Money() {
  return <Screen><Header title="Your money" back={{ label: "Back home", onPress: () => router.back() }} />
    <Copy title="What would you like to do?" />
    <PrimaryButton label="Record an Expense" onPress={() => router.push("/expense")} />
    <SecondaryButton label="See recent entries" onPress={() => router.push("/account")} />
    <SecondaryButton label="Add another place" onPress={() => router.push("/account-setup")} />
  </Screen>;
}
