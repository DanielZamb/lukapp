import { inspectTarget } from "../dev/target-inspection";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { font, fontSize, spacing, touchTarget } from "../theme/tokens";

type HeaderProps = {
  title: string;
  back?: { label: string; onPress: () => void };
  action?: { label: string; icon: string; onPress: () => void };
};
export function Header({ title, back, action }: HeaderProps) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.md,
        minHeight: touchTarget,
      }}
    >
      {back && (
        <Pressable
          onLayout={inspectTarget("Header", back.label)}
          accessibilityRole="button"
          accessibilityLabel={back.label}
          onPress={back.onPress}
          hitSlop={spacing.xs}
          style={{
            width: touchTarget,
            height: touchTarget,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: fontSize.title, color: theme.foreground }}>
            ←
          </Text>
        </Pressable>
      )}
      <Text
        accessibilityRole="header"
        style={{
          flex: 1,
          fontFamily: font.semibold,
          fontSize: fontSize.title,
          color: theme.foreground,
        }}
      >
        {title}
      </Text>
      {action && (
        <Pressable
          onLayout={inspectTarget("Header", action.label)}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.onPress}
          hitSlop={spacing.xs}
          style={{
            minWidth: touchTarget,
            minHeight: touchTarget,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: fontSize.title, color: theme.foreground }}>
            {action.icon}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
