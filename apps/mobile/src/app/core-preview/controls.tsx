import { useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import {
  Screen,
  Header,
  Copy,
  ListGroup,
  ListRow,
  PrimaryButton,
  SecondaryButton,
  Choice,
  ProgressBar,
} from "../../ui";
import { spacing } from "../../theme/tokens";

export default function ControlsPreview() {
  const [selected, setSelected] = useState("First");
  return (
    <Screen>
      <Header
        title="Shared controls"
        action={{
          label: "About this preview",
          icon: "?",
          onPress: () => router.push("/core-preview/confirmation"),
        }}
        back={{ label: "Back to core preview", onPress: () => router.back() }}
      />
      <Copy
        title="UI fixtures"
        detail="Change the choice. Use your device appearance setting to inspect light and dark."
      />
      <ListGroup title="Rows">
        <ListRow
          leadingEmoji="🏦"
          title="Example place"
          supporting="Place row fixture"
          value="$120.00"
          onPress={() => router.push("/core-preview/confirmation")}
        />
        <ListRow
          title="Unavailable row"
          supporting="Disabled control"
          onPress={() => router.push("/core-preview/confirmation")}
          disabled
        />
      </ListGroup>
      <View accessibilityRole="radiogroup" style={{ gap: spacing.sm }}>
        <Choice
          label="First"
          selected={selected === "First"}
          onPress={() => setSelected("First")}
        />
        <Choice
          label="Second"
          selected={selected === "Second"}
          onPress={() => setSelected("Second")}
        />
        <Choice
          label="Unavailable choice"
          selected={false}
          disabled
          onPress={() => setSelected("Unavailable")}
        />
      </View>
      <View style={{ gap: spacing.xl }}>
        <Copy
          title="Progress presentation"
          detail="These are supplied fractions, not Budget calculations."
        />
        <ProgressBar
          label="Example remaining"
          state={{ kind: "remaining", fraction: 0.65 }}
        />
        <ProgressBar
          label="Example over limit"
          state={{ kind: "over-limit" }}
        />
      </View>
      <View style={{ gap: spacing.md }}>
        <PrimaryButton
          label="Continue example"
          onPress={() => router.push("/core-preview/confirmation")}
        />
        <SecondaryButton
          label="Unavailable action"
          disabled
          onPress={() => router.push("/core-preview/confirmation")}
        />
        <PrimaryButton
          label="Loading example"
          loading
          onPress={() => router.push("/core-preview/confirmation")}
        />
      </View>
    </Screen>
  );
}
