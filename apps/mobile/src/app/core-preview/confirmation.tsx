import { router } from "expo-router";
import { ConfirmationScreen } from "../../ui";

export default function ConfirmationPreview() {
  return (
    <ConfirmationScreen
      title="Example complete"
      detail="You finished the UI preview. No financial record was created."
      action={{
        label: "Back to core preview",
        onPress: () => router.dismissTo("/core-preview"),
      }}
    />
  );
}
