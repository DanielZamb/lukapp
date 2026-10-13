import { View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { radius, spacing } from "../theme/tokens";

export type ProgressState =
  | { kind: "remaining"; fraction: number }
  | { kind: "over-limit" };
export function ProgressBar({
  label,
  state,
}: {
  label: string;
  state: ProgressState;
}) {
  const theme = useTheme();
  const fraction =
    state.kind === "remaining" ? Math.max(0, Math.min(1, state.fraction)) : 0;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={
        state.kind === "remaining"
          ? {
              min: 0,
              max: 100,
              now: Math.round(fraction * 100),
              text: `${Math.round(fraction * 100)}% remaining`,
            }
          : { text: "Over limit" }
      }
      style={{
        height: spacing.sm,
        borderRadius: radius.full,
        overflow: "hidden",
        backgroundColor: theme.secondary,
      }}
    >
      {state.kind === "over-limit" ? (
        <View
          style={{ flex: 1, backgroundColor: theme.danger, opacity: 0.15 }}
        />
      ) : (
        <View
          style={{
            height: "100%",
            width: `${fraction * 100}%`,
            backgroundColor: theme.primary,
          }}
        />
      )}
    </View>
  );
}
