import type { PropsWithChildren } from "react";
import { Children } from "react";
import { Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { font, fontSize, spacing } from "../theme/tokens";

export function ListGroup({
  title,
  children,
}: PropsWithChildren<{ title: string }>) {
  const theme = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text
        accessibilityRole="header"
        style={{
          color: theme.mutedForeground,
          fontFamily: font.medium,
          fontSize: fontSize.label,
        }}
      >
        {title}
      </Text>
      <View>
        {Children.map(children, (child, index) => (
          <View
            style={{
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: theme.border,
            }}
          >
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}
