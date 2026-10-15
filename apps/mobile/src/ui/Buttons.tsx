import { useInteraction } from "./Interaction";
import { inspectTarget } from "../dev/target-inspection";
import { ActivityIndicator, Pressable, Text } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { font, fontSize, radius, spacing, touchTarget } from "../theme/tokens";

export type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};
function Button({
  label,
  onPress,
  disabled = false,
  loading = false,
  primary,
}: ButtonProps & { primary: boolean }) {
  const theme = useTheme();
  const interact = useInteraction();
  const unavailable = disabled || loading;
  const foreground = primary
    ? theme.primaryForeground
    : theme.secondaryForeground;
  return (
    <Pressable
      onLayout={inspectTarget(
        primary ? "PrimaryButton" : "SecondaryButton",
        label,
      )}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: unavailable, busy: loading }}
      disabled={unavailable}
      onPress={() => { interact(); onPress?.(); }}
      style={({ pressed }) => ({
        minHeight: touchTarget,
        minWidth: touchTarget,
        borderRadius: radius.md,
        backgroundColor: primary ? theme.primary : theme.secondary,
        padding: spacing.lg,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: spacing.sm,
        opacity: unavailable ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      {loading && <ActivityIndicator color={foreground} />}
      <Text
        style={{
          color: foreground,
          fontFamily: font.semibold,
          fontSize: fontSize.action,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
export function PrimaryButton(props: ButtonProps) {
  return <Button {...props} primary />;
}
export function SecondaryButton(props: ButtonProps) {
  return <Button {...props} primary={false} />;
}
