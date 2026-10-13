import { inspectTarget } from "../../dev/target-inspection";
import { useState } from "react";
import { router } from "expo-router";
import { Keyboard, TextInput, View } from "react-native";
import { Screen, Header, Copy, PrimaryButton } from "../../ui";
import { useTheme } from "../../theme/ThemeProvider";
import {
  font,
  fontSize,
  radius,
  spacing,
  touchTarget,
} from "../../theme/tokens";

export default function EntryPreview() {
  const theme = useTheme();
  const [note, setNote] = useState("");
  return (
    <Screen>
      <Header
        title="Keyboard entry"
        back={{ label: "Back to core preview", onPress: () => router.back() }}
      />
      <Copy
        title="Try a note"
        detail="UI fixture only. This text is not saved and cannot be posted."
      />
      <View style={{ gap: spacing.xl }}>
        <TextInput
          onLayout={inspectTarget("TextInput", "Example note")}
          accessibilityLabel="Example note"
          placeholder="A short note"
          placeholderTextColor={theme.mutedForeground}
          value={note}
          onChangeText={setNote}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
          style={{
            minHeight: touchTarget,
            color: theme.foreground,
            fontFamily: font.regular,
            fontSize: fontSize.body,
            borderWidth: 1,
            borderColor: theme.border,
            borderRadius: radius.sm,
            padding: spacing.lg,
          }}
        />
        <PrimaryButton
          label="Finish example"
          disabled={note.trim().length === 0}
          onPress={() => {
            Keyboard.dismiss();
            router.push("/core-preview/confirmation");
          }}
        />
      </View>
    </Screen>
  );
}
