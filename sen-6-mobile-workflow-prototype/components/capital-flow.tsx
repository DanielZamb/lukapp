import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { font, spacing, type Theme } from "../theme/tokens";
import { compactAmount } from "./level-1-door";

type Focus = "net" | "out" | "in" | null;

export function fullAmount(amount: number, symbol: string) {
  const body = Math.abs(amount).toLocaleString("es-CO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${amount < 0 ? "−" : ""}${symbol}${body}`;
}

export function CapitalFlow({
  out,
  inn,
  symbol,
  theme,
}: {
  out: number;
  inn: number;
  symbol: string;
  theme: Theme;
}) {
  const styles = createStyles(theme);
  const [focus, setFocus] = useState<Focus>(null);
  const net = inn - out;

  function toggle(next: Focus) {
    setFocus((current) => (current === next ? null : next));
  }

  function show(id: Focus) {
    return focus == null || focus === id;
  }

  return (
    <View style={styles.wrap}>
      {show("net") && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Net"
          onPress={() => toggle("net")}
          style={styles.netBlock}
        >
          <Text style={styles.muted}>Net</Text>
          <Text
            style={[
              styles.net,
              { color: net >= 0 ? theme.primary : theme.foreground },
            ]}
            numberOfLines={1}
            {...(focus === "net"
              ? { adjustsFontSizeToFit: true, minimumFontScale: 0.55 }
              : {})}
          >
            {focus === "net"
              ? fullAmount(net, symbol)
              : `${net < 0 ? "−" : ""}${symbol}${compactAmount(Math.abs(net))}`}
          </Text>
        </Pressable>
      )}
      {(show("out") || show("in")) && (
        <View style={styles.pair}>
          {show("out") && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Out"
              onPress={() => toggle("out")}
              style={styles.side}
            >
              <Text style={styles.muted}>Out</Text>
              <Text
                style={[styles.out, focus === "out" && styles.solo]}
                numberOfLines={1}
                {...(focus === "out"
                  ? { adjustsFontSizeToFit: true, minimumFontScale: 0.55 }
                  : {})}
              >
                {focus === "out"
                  ? fullAmount(out, symbol)
                  : `${symbol}${compactAmount(out)}`}
              </Text>
            </Pressable>
          )}
          {show("in") && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="In"
              onPress={() => toggle("in")}
              style={styles.side}
            >
              <Text style={styles.muted}>In</Text>
              <Text
                style={[styles.in, focus === "in" && styles.solo]}
                numberOfLines={1}
                {...(focus === "in"
                  ? { adjustsFontSizeToFit: true, minimumFontScale: 0.55 }
                  : {})}
              >
                {focus === "in"
                  ? fullAmount(inn, symbol)
                  : `${symbol}${compactAmount(inn)}`}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: { gap: spacing.sm, alignSelf: "stretch" },
    netBlock: { gap: 2 },
    pair: {
      flexDirection: "row",
      alignItems: "flex-end",
      alignSelf: "stretch",
      gap: spacing.lg,
    },
    side: { flex: 1, minWidth: 0, gap: 2 },
    solo: {
      fontSize: 36,
      lineHeight: 40,
    },
    muted: {
      color: theme.mutedForeground,
      fontSize: 14,
      lineHeight: 20,
      fontFamily: font.regular,
    },
    net: {
      fontSize: 36,
      lineHeight: 40,
      fontFamily: font.extrabold,
      letterSpacing: -0.8,
    },
    out: {
      color: theme.foreground,
      fontSize: 22,
      lineHeight: 26,
      fontFamily: font.extrabold,
      letterSpacing: -0.4,
    },
    in: {
      color: theme.primary,
      fontSize: 22,
      lineHeight: 26,
      fontFamily: font.extrabold,
      letterSpacing: -0.4,
    },
  });
