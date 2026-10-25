import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { Pressable, View, type DimensionValue } from "react-native";
import { Text } from "./Text";
import { useThemeContext } from "./themeContext";
import { alpha, mix } from "./design";
import { textTone, type TextTone } from "./typography";
import type { IconName } from "./surfaces";

type Legacy = { legacy?: ReactNode };
export function StatusBadge({ tone, icon, label, legacy = null }: { tone: TextTone; icon: IconName; label: string } & Legacy) {
  const { theme, layout } = useThemeContext();
  if (layout.tier !== "xxxl") return legacy;
  const color = textTone(theme, tone);
  const opacity = tone === "warning" ? 0.07 : tone === "danger" || tone === "primary" ? 0.11 : 0.12;
  return <View accessible accessibilityLabel={label} style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, backgroundColor: tone === "default" || tone === "muted" ? theme.secondary : mix(tone === "primary" ? theme.primary : color, theme.background, opacity) }}><Ionicons name={icon} size={18} color={color} /><Text variant="label" tone={tone} style={{ flexShrink: 1 }}>{label}</Text></View>;
}
export function NoteCard({ tone, icon, title, body, onPress, legacy = null }: { tone: "warning" | "danger" | "neutral"; icon: IconName; title: string; body: string; onPress?: () => void } & Legacy) {
  const { theme, layout } = useThemeContext();
  if (layout.tier !== "xxxl") return legacy;
  const color = tone === "neutral" ? theme.foreground : textTone(theme, tone);
  const style = { padding: 16, gap: 10, borderRadius: 24, borderWidth: 1, backgroundColor: tone === "neutral" ? theme.secondary : mix(color, theme.background, tone === "warning" ? 0.09 : 0.08), borderColor: tone === "neutral" ? theme.border : alpha(color, tone === "warning" ? 0.34 : 0.3) };
  const children = <><View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><Ionicons name={icon} size={22} color={color} /><Text variant="rowTitle" style={{ flex: 1 }}>{title}</Text></View><Text variant="meta" tone="muted">{body}</Text></>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${body}`} onPress={onPress} style={style}>{children}</Pressable> : <View style={style}>{children}</View>;
}
export function InlineNotice({ tone, title, detail, legacy = null }: { tone: "warning" | "danger"; title: string; detail?: string } & Legacy) {
  const { theme, layout } = useThemeContext();
  if (layout.tier !== "xxxl") return legacy;
  return <View accessibilityRole={tone === "danger" ? "alert" : undefined} accessibilityLiveRegion="polite" style={{ gap: 4 }}>
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}><Ionicons name={tone === "danger" ? "alert-circle" : "warning-outline"} size={22} color={textTone(theme, tone)} style={{ marginTop: 3 }} /><Text variant="rowTitle" tone={tone === "danger" ? "danger" : "default"} style={{ flex: 1 }}>{title}</Text></View>
    {detail ? <Text variant="meta" tone="muted" style={{ paddingLeft: 32 }}>{detail}</Text> : null}
  </View>;
}
export function AlertDot({ count, legacy = null }: { count: number } & Legacy) {
  const { theme, layout, mode } = useThemeContext();
  if (layout.tier !== "xxxl" || count <= 0) return legacy;
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: "absolute", top: 7, right: 8, width: 16, height: 16, borderRadius: 999, borderWidth: 2, borderColor: mode === "light" ? "#f7f2fe" : "#21132f", backgroundColor: theme.warning }} />;
}
export function Skeleton({ width, height, onBand = false, legacy = null }: { width: DimensionValue; height: number; onBand?: boolean } & Legacy) {
  const { theme, layout } = useThemeContext();
  if (layout.tier !== "xxxl") return legacy;
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width, height, borderRadius: 12, backgroundColor: mix(onBand ? theme.primaryText : theme.foreground, onBand ? (theme.background === "#ffffff" ? "#f7f2fe" : "#21132f") : theme.background, onBand ? 0.12 : 0.08) }} />;
}
export function CenteredMoment({ icon, tone = "primary", title, body, chip, amount, legacy = null }: { icon: IconName; tone?: "primary" | "positive" | "danger" | "soft"; title: string; body?: string; chip?: ReactNode; amount?: ReactNode } & Legacy) {
  const { theme, layout } = useThemeContext();
  if (layout.tier !== "xxxl") return legacy;
  const size = tone === "danger" ? 88 : 72;
  return <View style={{ flexGrow: 1, justifyContent: "center", alignItems: "stretch", gap: 32 }}>
    <View accessible={false} style={{ alignSelf: "center", width: size, height: size, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: tone === "soft" ? theme.secondary : textTone(theme, tone), ...(tone === "soft" && { borderWidth: 1, borderColor: theme.border }) }}><Ionicons name={icon} size={tone === "danger" ? 44 : 34} color={tone === "soft" ? theme.foreground : tone === "positive" || tone === "danger" ? theme.background : theme.primaryForeground} /></View>
    <Text variant="screen" accessibilityRole="header" style={{ textAlign: "center" }}>{title}</Text>
    {amount ? <View style={{ alignItems: "center" }}>{amount}</View> : null}
    {chip}
    {body ? <Text variant="body" tone="muted" style={{ textAlign: "center" }}>{body}</Text> : null}
  </View>;
}
