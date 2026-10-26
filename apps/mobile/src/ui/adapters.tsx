import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ReactNode } from "react";
import { Pressable, View } from "react-native";
import { Text } from "./Text";
import { EmojiTile, IconTile, type IconName } from "./surfaces";
import { useThemeContext } from "./themeContext";
import { mix } from "./design";
import { radius, touchTarget } from "./tokens";

export type FactRowProps = {
  label: string; value: string; leading?: ReactNode; icon?: IconName; emoji?: string; color?: string; isLast?: boolean; legacy?: ReactNode;
};
export function FactRow({ label, value, leading, icon, emoji, color, isLast, legacy = null }: FactRowProps) {
  const { layout, theme, styles } = useThemeContext();
  if (layout.tier !== "xxxl") return legacy;
  return <View accessible accessibilityLabel={`${label}, ${value}`} style={[styles.row, isLast && styles.rowLast, { flexDirection: "row", alignItems: "flex-start", gap: 12 }]}>
    <View style={{ alignSelf: "center" }}>{leading ?? (emoji ? <EmojiTile emoji={emoji} color={color ?? theme.primary} size={48} /> : icon ? <IconTile icon={icon} size={48} /> : null)}</View>
    <View style={{ flex: 1, minWidth: 0, gap: 8 }}><Text variant="meta" tone="muted">{label}</Text><Text variant="rowTitle">{value}</Text></View>
    {!isLast ? <View pointerEvents="none" style={styles.rowDivider} /> : null}
  </View>;
}

export type IconButtonProps = ComponentProps<typeof Pressable> & {
  accessibilityLabel: string; icon?: IconName; iconSize?: number; preset?: "header" | "brand" | "remove"; children?: ReactNode;
};
export function IconButton({ accessibilityLabel, icon, iconSize = 24, preset = "header", children, style, disabled, accessibilityState, ...props }: IconButtonProps) {
  const { layout, theme, styles } = useThemeContext();
  const large = layout.tier === "xxxl";
  const size = large ? 56 : preset === "remove" ? 26 : touchTarget;
  const base = preset === "header" ? styles.icon : {
    width: size, height: size, alignItems: "center" as const, justifyContent: "center" as const,
    ...(preset === "brand" && { borderRadius: radius.full, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border }),
  };
  return <Pressable {...props} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    {...(disabled !== undefined || accessibilityState ? { accessibilityState: { ...accessibilityState, disabled: !!disabled } } : {})}
    disabled={disabled} style={state => [base, large && { width: 56, height: 56 }, large && preset === "brand" && { backgroundColor: mix(theme.primary, theme.background, 0.1), borderColor: mix(theme.primary, theme.background, 0.22) }, typeof style === "function" ? style(state) : style]}>
    <>{icon ? <Ionicons name={icon} size={iconSize} color={theme.foreground} /> : null}{children}</>
  </Pressable>;
}
