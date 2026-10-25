import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, PropsWithChildren, ReactNode } from "react";
import { Image, Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { EmojiText, Text } from "./Text";
import { useThemeContext } from "./themeContext";
import { alpha, mix, resolveColor, type DesignColor } from "./design";
import { xxxl } from "./tokens";
import { textTone, type TextTone } from "./typography";

export type IconName = ComponentProps<typeof Ionicons>["name"];
type Legacy = { legacy?: ReactNode };
type BrandBandProps = { watermark?: boolean } & (
  PropsWithChildren<{ header?: never; hero?: never; chip?: never; legacy?: never }> |
  { children?: never; header: { logo: ReactNode; eyebrow?: string; actions?: ReactNode }; hero: { label: string; content: ReactNode }; chip?: ReactNode; legacy?: ReactNode }
);
export function BrandBand(props: BrandBandProps) {
  const { watermark = true } = props;
  const { layout, mode, theme } = useThemeContext();
  if (layout.tier !== "xxxl") return props.header ? props.legacy ?? null : props.children;
  const colors = xxxl.colors[mode];
  return <View style={{ marginHorizontal: -16, marginTop: -12, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 24, gap: 20, backgroundColor: colors.band, borderBottomWidth: 1, borderBottomColor: colors.bandBorder, overflow: "hidden" }}>
    {watermark ? <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: "absolute", right: -74, bottom: -64, width: 260, opacity: colors.watermarkOpacity }}><Image source={require("../../assets/brand/symbol-color.png")} resizeMode="contain" style={{ width: 260, height: 278, tintColor: theme.primaryText }} /></View> : null}
    {props.header ? <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><View style={{ flex: 1, minWidth: 0, gap: 6 }}>{props.header.logo}{props.header.eyebrow ? <Text variant="eyebrow" tone="muted">{props.header.eyebrow}</Text> : null}</View>{props.header.actions}</View>
      <View style={{ gap: 8 }}><Text variant="meta" tone="muted">{props.hero.label}</Text>{props.hero.content}</View>
      {props.chip}
    </> : props.children}
  </View>;
}
export function BrandBandChip({ label, icon = "wallet-outline", onPress, legacy = null }: { label: string; icon?: IconName; onPress: () => void } & Legacy) {
  const { theme, layout } = useThemeContext();
  if (layout.tier !== "xxxl") return legacy;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: alpha(theme.primary, 0.22), backgroundColor: mix(theme.primary, theme.background, 0.1) }}>
    <Ionicons accessible={false} name={icon} size={22} color={theme.primaryText} /><Text variant="rowTitle" style={{ flex: 1 }}>{label}</Text><Ionicons accessible={false} name="chevron-forward" size={20} color={theme.primaryText} />
  </Pressable>;
}
export type TintCardProps = PropsWithChildren<({ tone?: "brand"; color?: never } | { tone: "category"; color: DesignColor }) & { focused?: boolean; style?: StyleProp<ViewStyle> }>;
export function TintCard({ children, tone = "brand", color, focused, style }: TintCardProps) {
  const { layout, mode, theme } = useThemeContext();
  if (layout.tier !== "xxxl") return children;
  const colors = xxxl.colors[mode];
  const category = color ? resolveColor(color, mode) : theme.primary;
  return <View style={[{ padding: focused ? 15 : 16, borderRadius: 24, gap: 12, borderWidth: focused ? 2 : 1, borderColor: focused ? theme.primary : tone === "category" ? alpha(category, 0.3) : colors.tintBorder, backgroundColor: tone === "category" ? mix(category, theme.background, colors.categoryMix) : colors.tint,
    ...(focused && { boxShadow: `0 0 0 4px ${alpha(theme.primary, 0.14)}` }) }, style]}>{children}</View>;
}
export function EmojiTile({ emoji, color, size = 48, legacy = null }: { emoji: string; color: DesignColor; size?: 36 | 48 | 64 } & Legacy) {
  const { layout, mode, theme } = useThemeContext();
  if (layout.tier !== "xxxl") return legacy;
  const tint = resolveColor(color, mode);
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={tileStyle(size, tint, theme.background)}>
    <EmojiText size={size === 36 ? 16 : size === 64 ? 30 : 22} lineHeight={size === 36 ? 20 : size === 64 ? 36 : 26}>{emoji}</EmojiText>
  </View>;
}
function tileStyle(size: 36 | 48 | 64, color: string, background: string): ViewStyle {
  return { width: size, height: size, flexShrink: 0, borderRadius: size === 36 ? 12 : size === 64 ? 18 : 14, alignItems: "center", justifyContent: "center", backgroundColor: mix(color, background, 0.15), borderWidth: 1, borderColor: alpha(color, 0.32) };
}
export function IconTile({ icon, tone = "primary", size = 48, legacy = null }: { icon: IconName; tone?: TextTone | "neutral"; size?: 36 | 48 | 64 } & Legacy) {
  const { theme, layout, mode } = useThemeContext();
  if (layout.tier !== "xxxl") return legacy;
  const color = tone === "neutral" ? mode === "light" ? "#71717a" : "#a1a1aa" : textTone(theme, tone);
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={tileStyle(size, color, theme.background)}><Ionicons name={icon} size={size === 36 ? 18 : 24} color={tone === "neutral" ? theme.foreground : color} /></View>;
}
export function ShareBar({ value, color, legacy = null }: { value: number; color: DesignColor } & Legacy) {
  return <ProgressTrack value={value} color={color} size={8} legacy={legacy} />;
}
export function ProgressJar({ value, color, over = false, size = 14, legacy = null }: { value: number; color: DesignColor; over?: boolean; size?: 14 | 22 } & Legacy) {
  return <ProgressTrack value={value} color={color} over={over} size={size} legacy={legacy} />;
}
function ProgressTrack({ value, color, over, size, legacy }: { value: number; color: DesignColor; over?: boolean; size: number } & Legacy) {
  const { theme, mode, layout } = useThemeContext();
  if (layout.tier !== "xxxl") return legacy;
  const fill = over ? theme.danger : resolveColor(color, mode);
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height: size, borderRadius: 999, overflow: "hidden", backgroundColor: mix(fill, theme.background, over ? 0.18 : 0.16) }}>
    <View style={{ height: "100%", borderRadius: 999, width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`, backgroundColor: fill }} />
  </View>;
}
export function LookChip({ emoji, color, label, legacy = null }: { emoji: string; color: DesignColor; label: string } & Legacy) {
  const { layout, mode, theme } = useThemeContext();
  if (layout.tier !== "xxxl") return legacy;
  const tint = resolveColor(color, mode);
  return <View style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, paddingVertical: 8, paddingHorizontal: 18, borderRadius: 999, backgroundColor: mix(tint, theme.background, 0.12), borderWidth: 2, borderColor: tint }}>
    <EmojiText size={22} lineHeight={26}>{emoji}</EmojiText><Text variant="rowTitle" style={{ flexShrink: 1 }}>{label}</Text>
  </View>;
}
