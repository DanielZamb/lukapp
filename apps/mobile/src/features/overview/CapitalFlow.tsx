import type { Theme } from "../../ui/tokens";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../ui/core";
import { font, spacing, touchTarget } from "../../ui/tokens";
import { fullAmount, symbolAmount } from "./amounts";

type Focus = "net" | "out" | "in";

export function CapitalFlow({ outMinorUnits, inMinorUnits, symbol }: {
  outMinorUnits: number; inMinorUnits: number; symbol: string;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [focus, setFocus] = useState<Focus | null>(null);
  const net = inMinorUnits - outMinorUnits;
  function amount(id: Focus, label: string, value: number, color: string) {
    const focused = focus === id;
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label}
        accessibilityState={{ expanded: focused }}
        onPress={() => setFocus((current) => current === id ? null : id)}
        style={id === "net" ? styles.netBlock : styles.side}>
        <Text style={styles.muted}>{label}</Text>
        <Text style={[styles.amount, { color }, (id === "net" || focused) && styles.large]}
          numberOfLines={1} adjustsFontSizeToFit={focused} minimumFontScale={0.55}>
          {focused ? fullAmount(value, symbol) : symbolAmount(value, symbol, "compact")}
        </Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.wrap}>
      {(focus === null || focus === "net") && amount("net", "Net", net, net >= 0 ? theme.primary : theme.foreground)}
      {focus !== "net" && (
        <View style={styles.pair}>
          {(focus === null || focus === "out") && amount("out", "Out", outMinorUnits, theme.foreground)}
          {(focus === null || focus === "in") && amount("in", "In", inMinorUnits, theme.primary)}
        </View>
      )}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
  wrap: { gap: spacing.sm, alignSelf: "stretch" },
  netBlock: { gap: 2, minHeight: touchTarget },
  pair: { flexDirection: "row", alignItems: "flex-end", alignSelf: "stretch", gap: spacing.lg },
  side: { flex: 1, minWidth: 0, gap: 2, minHeight: touchTarget },
  muted: { color: theme.mutedForeground, fontSize: 14, lineHeight: 20, fontFamily: font.regular },
  amount: { fontSize: 22, lineHeight: 26, fontFamily: font.extrabold, letterSpacing: -0.4 },
  large: { fontSize: 36, lineHeight: 40, fontFamily: font.extrabold, letterSpacing: -0.8 },
  });
}
