import type { Theme } from "../../ui/tokens";
import { useReadableLayout } from "../../ui/themeContext";
import type { ReadableLayout } from "../../ui/layout";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../ui/core";
import { font, spacing } from "../../ui/tokens";
import { compactHistoryAmount, historyAmount } from "./listModel";

type Focus = "net" | "out" | "in";

export function CapitalFlow({ out, inn, currency }: { out: number; inn: number; currency: string }) {
  const theme = useTheme();
  const layout = useReadableLayout();
  const styles = useMemo(() => createStyles(theme, layout), [theme, layout]);
  const [focus, setFocus] = useState<Focus | null>(null);
  const net = inn - out;
  function figure(id: Focus, label: string, minorUnits: number) {
    const selected = focus === id;
    const color = id === "in" || (id === "net" && net >= 0) ? theme.primary : theme.foreground;
    return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: selected }}
      onPress={() => setFocus(selected ? null : id)} style={[styles.figure, id !== "net" && styles.side]}>
      <Text style={styles.label}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit={selected} minimumFontScale={0.55}
        style={[styles.amount, (id === "net" || selected) && styles.large, { color }]}>
        {selected ? historyAmount({ currency, minorUnits }) : compactHistoryAmount(minorUnits)}
      </Text>
    </Pressable>;
  }
  return <View style={styles.wrap}>
    {(focus === null || focus === "net") && figure("net", "Net", net)}
    {focus !== "net" && <View style={styles.pair}>
      {(focus === null || focus === "out") && figure("out", "Out", out)}
      {(focus === null || focus === "in") && figure("in", "In", inn)}
    </View>}
  </View>;
}

function createStyles(theme: Theme, layout: ReadableLayout) {
  return StyleSheet.create({
    wrap: { gap: spacing.sm, alignSelf: "stretch" },
    pair: { flexDirection: layout.reflow ? "column" : "row", gap: spacing.lg, alignItems: layout.reflow ? "stretch" : "flex-end" },
    figure: { gap: 2 },
    side: { flex: layout.reflow ? 0 : 1, minWidth: 0 },
    label: { color: theme.mutedForeground, fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
    amount: { fontFamily: font.extrabold, fontSize: 22, lineHeight: 26, letterSpacing: -0.4 },
    large: { fontSize: 36, lineHeight: 40, letterSpacing: -0.8 },
  });
}
