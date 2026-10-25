import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Text, type TextProps } from "./Text";
import { useThemeContext } from "./themeContext";

export function SheetHeader({ title, eyebrow, onClose, disabled = false, titleProps, legacy = null }: {
  title: string; eyebrow?: string; onClose: () => void; disabled?: boolean;
  titleProps?: Pick<TextProps, "ref" | "onLayout">; legacy?: ReactNode;
}) {
  const { layout, theme } = useThemeContext();
  if (layout.tier !== "xxxl") return legacy;
  return <View style={{ minHeight: 56, flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
    <View style={{ flex: 1, minWidth: 0, gap: 2, paddingTop: 4 }}>{eyebrow ? <Text variant="eyebrow" tone="muted">{eyebrow}</Text> : null}<Text {...titleProps} variant="section" accessibilityRole="header">{title}</Text></View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Close ${title}`} accessibilityState={{ disabled }} disabled={disabled} onPress={onClose} style={{ width: 56, height: 56, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border }}><Ionicons name="close" size={22} color={theme.foreground} /></Pressable>
  </View>;
}
