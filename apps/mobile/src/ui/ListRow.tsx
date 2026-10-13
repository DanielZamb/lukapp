import { inspectTarget } from "../dev/target-inspection";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { font, fontSize, spacing, touchTarget } from "../theme/tokens";

export type ListRowProps = {
  title: string;
  supporting?: string;
  value?: string;
  leadingEmoji?: string;
  onPress?: () => void;
  disabled?: boolean;
};
export function ListRow({
  title,
  supporting,
  value,
  leadingEmoji,
  onPress,
  disabled = false,
}: ListRowProps) {
  const theme = useTheme();
  const content = (
    <>
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text
          style={{
            fontFamily: font.medium,
            fontSize: fontSize.body,
            color: theme.foreground,
          }}
        >
          {leadingEmoji ? `${leadingEmoji} ` : ""}
          {title}
        </Text>
        {supporting && (
          <Text
            style={{
              fontFamily: font.regular,
              fontSize: fontSize.label,
              color: theme.mutedForeground,
            }}
          >
            {supporting}
          </Text>
        )}
      </View>
      {value && (
        <Text
          style={{
            fontFamily: font.semibold,
            fontSize: fontSize.body,
            color: theme.foreground,
            flexShrink: 1,
          }}
        >
          {value}
        </Text>
      )}
    </>
  );
  const style = {
    minHeight: touchTarget,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  } satisfies import("react-native").ViewStyle;
  return onPress ? (
    <Pressable
      onLayout={inspectTarget("ListRow", title)}
      accessibilityRole="button"
      accessibilityLabel={[title, supporting, value].filter(Boolean).join(", ")}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        style,
        { opacity: disabled ? 0.5 : pressed ? 0.7 : 1 },
      ]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}
