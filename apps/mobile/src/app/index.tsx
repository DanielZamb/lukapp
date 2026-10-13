import { router } from "expo-router";
import { Screen, Copy, Header, PrimaryButton } from "../ui";

export default function Index() {
  return (
    <Screen>
      <Header title="Lukapp" />
      <Copy
        title="Your money, clearly"
        detail="Your accounts are not connected in this build."
      />
      {__DEV__ && (
        <PrimaryButton
          label="Open core preview"
          onPress={() => router.push("/core-preview")}
        />
      )}
    </Screen>
  );
}
