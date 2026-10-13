import { Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { font, fontSize, spacing } from "../theme/tokens";

export function Copy({ title, detail }: { title: string; detail?: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text
        accessibilityRole="header"
        style={{
          color: theme.foreground,
          fontFamily: font.bold,
          fontSize: fontSize.title,
        }}
      >
        {title}
      </Text>
      {detail && (
        <Text
          style={{
            color: theme.mutedForeground,
            fontFamily: font.regular,
            fontSize: fontSize.body,
            lineHeight: 24,
          }}
        >
          {detail}
        </Text>
      )}
    </View>
  );
}
