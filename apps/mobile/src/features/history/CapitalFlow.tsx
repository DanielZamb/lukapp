import type { Theme } from "../../ui/tokens";
import { useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useT } from "../../i18n";
import { FlowSummary, Text, useReflowStyles, useTheme } from "../../ui/core";
import { spacing } from "../../ui/tokens";
import { compactHistoryAmount, historyAmount } from "./listModel";

export type Focus = "net" | "out" | "in";

export function CapitalFlow({ out, inn, currency, focus, onFocus }: { out: number; inn: number; currency: string; focus: Focus | null; onFocus: (focus: Focus | null) => void }) {
  const theme = useTheme();
  const reflow = useReflowStyles();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { t, language } = useT();
  const net = inn - out;
  function figure(id: Focus, label: string, minorUnits: number) {
    const selected = focus === id;
    const color = id === "in" || (id === "net" && net >= 0) ? theme.primary : theme.foreground;
    return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: selected }}
      onPress={() => onFocus(selected ? null : id)} style={[styles.figure, id !== "net" && [styles.side, reflow.flex(1, 0)]]}>
      <Text preset="rowSubtitle" style={styles.label}>{label}</Text>
      <Text preset={id === "net" || selected ? "flowFocus" : "flowAmount"} numberOfLines={1} adjustsFontSizeToFit={selected} minimumFontScale={0.55}
        style={{ color }}>
        {selected ? historyAmount({ currency, minorUnits }) : compactHistoryAmount(minorUnits, currency, language)}
      </Text>
    </Pressable>;
  }
  const legacy = <View style={styles.wrap}>
    {(focus === null || focus === "net") && figure("net", t("review.flowNet"), net)}
    {focus !== "net" && <View style={[styles.pair, reflow.row("flex-end", "stretch")]}>
      {(focus === null || focus === "out") && figure("out", t("review.flowOut"), out)}
      {(focus === null || focus === "in") && figure("in", t("review.flowIn"), inn)}
    </View>}
  </View>;
  return <FlowSummary net={net} out={out} in={inn} currency={currency} legacy={legacy} />;
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    wrap: { gap: spacing.sm, alignSelf: "stretch" },
    pair: { gap: spacing.lg },
    figure: { gap: 2 },
    side: { minWidth: 0 },
    label: { color: theme.mutedForeground },
  });
}
