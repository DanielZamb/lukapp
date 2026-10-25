import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { Pressable, Text as NativeText, View } from "react-native";
import { Text } from "./Text";
import { useThemeContext } from "./themeContext";
import { alpha, mix, resolveColor, type DesignColor } from "./design";
import { font } from "./tokens";
import type { IconName } from "./surfaces";

type Option<V extends string> = { value: V; label: string; disabled?: boolean };
export type ChipOption<V extends string> = Option<V> & { wide?: boolean };
export function chipRows<T extends { wide?: boolean }>(options: readonly T[]) {
  const rows: T[][] = [];
  for (const option of options) {
    const last = rows.at(-1);
    if (!option.wide && last?.length === 1 && !last[0]?.wide) last.push(option);
    else rows.push([option]);
  }
  return rows;
}
export function ChipSet<V extends string>({ options, value, onChange, columns = 2, label, legacy = null }: {
  options: readonly ChipOption<V>[]; value: V; onChange: (value: V) => void; columns?: 2; label?: string; legacy?: ReactNode;
}) {
  const { theme, layout } = useThemeContext();
  if (layout.tier !== "xxxl") return legacy;
  return <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ gap: 8 }}>
    {chipRows(options).map((row, index) => <View key={index} style={{ flexDirection: "row", gap: 8 }}>
      {row.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: option.value === value, disabled: !!option.disabled }} disabled={option.disabled} onPress={() => onChange(option.value)}
        style={{ flex: 1, minWidth: 0, minHeight: 56, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, alignItems: "center", justifyContent: "center", borderWidth: option.value === value ? 2 : 1, borderColor: option.value === value ? theme.primary : theme.border, backgroundColor: option.value === value ? mix(theme.primary, theme.background, 0.1) : theme.secondary, opacity: option.disabled ? 0.45 : 1 }}>
        <Text variant="action" tone={option.value === value ? "primary" : "default"} style={{ textAlign: "center", ...(option.value === value && { fontFamily: font.bold }) }}>{option.label}</Text>
      </Pressable>)}
      {row.length < columns && !row[0]?.wide ? <View style={{ flex: 1 }} /> : null}
    </View>)}
  </View>;
}
export function Segmented<V extends string>({ options, value, onChange, legacy = null }: {
  options: readonly (Option<V> & { icon?: IconName; badge?: number })[]; value: V; onChange: (value: V) => void; legacy?: ReactNode;
}) {
  const { theme, layout } = useThemeContext();
  if (layout.tier !== "xxxl") return legacy;
  return <View accessibilityRole="tablist" style={{ flexDirection: "row", gap: 4, padding: 4, borderRadius: 999, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border }}>
    {options.map(option => <Pressable key={option.value} accessibilityRole="tab" accessibilityLabel={`${option.label}${option.badge !== undefined ? `, ${option.badge}` : ""}`} accessibilityState={{ selected: option.value === value, disabled: !!option.disabled }} disabled={option.disabled} onPress={() => onChange(option.value)}
      style={{ flex: 1, minWidth: 0, minHeight: 56, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, ...(option.value === value && { backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, boxShadow: "0 1px 3px #00000014" }) }}>
      {option.icon ? <Ionicons name={option.icon} size={20} color={option.value === value ? theme.primaryText : theme.mutedForeground} /> : null}
      <Text variant="action" tone={option.value === value ? "primary" : "muted"}>{option.label}</Text>
      {option.badge !== undefined ? <View style={{ minWidth: 26, paddingHorizontal: 8, paddingVertical: 1, borderRadius: 999, backgroundColor: theme.primary }}><Text variant="label" style={{ color: theme.primaryForeground }}>{option.badge}</Text></View> : null}
    </Pressable>)}
  </View>;
}
export function EmojiGrid({ options, value, onChange, columns = 4, legacy = null }: {
  options: readonly { value: string; label: string }[]; value: string; onChange: (value: string) => void; columns?: 4; legacy?: ReactNode;
}) {
  const { theme, layout } = useThemeContext();
  if (layout.tier !== "xxxl") return legacy;
  return <View accessibilityRole="radiogroup" style={{ gap: 8 }}>{Array.from({ length: Math.ceil(options.length / columns) }, (_, row) => <View key={row} style={{ flexDirection: "row", gap: 8 }}>
    {Array.from({ length: columns }, (_, column) => {
      const option = options[row * columns + column];
      return option ? <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: value === option.value }} onPress={() => onChange(option.value)} style={{ flex: 1, minHeight: 60, minWidth: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: value === option.value ? mix(theme.primary, theme.background, 0.1) : theme.secondary, borderWidth: value === option.value ? 2 : 1, borderColor: value === option.value ? theme.primary : theme.border }}><NativeText maxFontSizeMultiplier={1.3} style={{ fontSize: 22, lineHeight: 26 }}>{option.value}</NativeText></Pressable> : <View key={column} style={{ flex: 1 }} />;
    })}
  </View>)}</View>;
}
export function SwatchGrid<V extends string>({ options, value, onChange, columns = 4, legacy = null }: {
  options: readonly (Option<V> & { color: DesignColor })[]; value: V; onChange: (value: V) => void; columns?: 4; legacy?: ReactNode;
}) {
  const { theme, mode, layout } = useThemeContext();
  if (layout.tier !== "xxxl") return legacy;
  return <View accessibilityRole="radiogroup" style={{ gap: 8 }}>{Array.from({ length: Math.ceil(options.length / columns) }, (_, row) => <View key={row} style={{ flexDirection: "row", gap: 8 }}>
    {Array.from({ length: columns }, (_, column) => {
      const option = options[row * columns + column];
      return option ? <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: option.value === value, disabled: !!option.disabled }} disabled={option.disabled} onPress={() => onChange(option.value)} style={{ flex: 1, minHeight: 56, minWidth: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: resolveColor(option.color, mode), ...(option.value === value && { boxShadow: `0 0 0 3px ${theme.background}, 0 0 0 5px ${theme.foreground}` }) }}>
        {option.value === value ? <Ionicons name="checkmark" size={24} color="#ffffff" /> : null}
      </Pressable> : <View key={column} style={{ flex: 1 }} />;
    })}
  </View>)}</View>;
}
