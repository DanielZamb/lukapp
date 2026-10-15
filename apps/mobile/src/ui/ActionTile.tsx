import { useInteraction } from "./Interaction";
import { inspectTarget } from "../dev/target-inspection";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { font, fontSize, radius, spacing, touchTarget } from "../theme/tokens";

export function ActionTile({
  title,
  supporting,
  value,
  onPress,
}: {
  title: string;
  supporting?: string;
  value?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const interact = useInteraction();
  return (
    <Pressable
      onLayout={inspectTarget("ActionTile", title)}
      accessibilityRole="button"
      accessibilityLabel={[title, supporting, value].filter(Boolean).join(", ")}
      onPress={() => { interact(); onPress?.(); }}
      style={({ pressed }) => ({
        minHeight: touchTarget,
        minWidth: touchTarget,
        padding: spacing.xl,
        borderRadius: radius.lg,
        backgroundColor: theme.secondary,
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text
          style={{
            color: theme.foreground,
            fontFamily: font.semibold,
            fontSize: fontSize.action,
          }}
        >
          {title}
        </Text>
        {supporting && (
          <Text
            style={{
              color: theme.mutedForeground,
              fontFamily: font.regular,
              fontSize: fontSize.label,
            }}
          >
            {supporting}
          </Text>
        )}
      </View>
      {value && (
        <Text
          style={{
            color: theme.foreground,
            fontFamily: font.bold,
            fontSize: fontSize.title,
          }}
        >
          {value}
        </Text>
      )}
    </Pressable>
  );
}
