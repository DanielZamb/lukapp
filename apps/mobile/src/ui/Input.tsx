import { useId } from "react";
import { TextInput, InputAccessoryView, Keyboard, Platform, View } from "react-native";
import type { TextInputProps } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { font, fontSize, radius, spacing, touchTarget } from "../theme/tokens";
import { useInteraction } from "./Interaction";
import { SecondaryButton } from "./Buttons";

export function Input(props: TextInputProps & { accessibilityLabel: string }) {
  const theme = useTheme();
  const interact = useInteraction();
  const accessory = useId();
  return <><TextInput {...props}
    inputAccessoryViewID={Platform.OS === "ios" ? accessory : undefined}
    onFocus={event => { interact(); props.onFocus?.(event); }}
    onChangeText={value => { interact(); props.onChangeText?.(value); }}
    placeholderTextColor={theme.mutedForeground}
    style={[{ minHeight: touchTarget, padding: spacing.lg, borderWidth: 1,
      borderColor: theme.border, borderRadius: radius.sm, color: theme.foreground,
      fontFamily: font.regular, fontSize: fontSize.body }, props.style]} />
    {Platform.OS === "ios" && <InputAccessoryView nativeID={accessory}>
      <View style={{ backgroundColor: theme.background, padding: spacing.sm }}>
        <SecondaryButton label="Done" onPress={() => Keyboard.dismiss()} />
      </View>
    </InputAccessoryView>}
  </>;
}
