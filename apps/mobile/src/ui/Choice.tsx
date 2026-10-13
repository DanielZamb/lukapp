import { inspectTarget } from "../dev/target-inspection";
import { Pressable, Text } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { font, fontSize, radius, spacing, touchTarget } from "../theme/tokens";

export function Choice({
  label,
  selected,
  onPress,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onLayout={inspectTarget("Choice", label)}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: touchTarget,
        minWidth: touchTarget,
        padding: spacing.md,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        borderWidth: 1,
        borderColor: selected ? theme.primary : theme.border,
        borderRadius: radius.sm,
        backgroundColor: selected ? theme.secondary : theme.background,
        opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
      })}
    >
      <Text
        accessible={false}
        style={{ color: selected ? theme.primary : theme.mutedForeground }}
      >
        {" "}
        {selected ? "●" : "○"}{" "}
      </Text>
      <Text
        style={{
          color: theme.foreground,
          fontFamily: selected ? font.semibold : font.regular,
          fontSize: fontSize.body,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
