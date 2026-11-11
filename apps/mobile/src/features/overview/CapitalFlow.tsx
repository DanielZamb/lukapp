import { Pressable, StyleSheet, View } from "react-native";
import { useT } from "../../i18n";
import { FlowSummary, ReflowRow, Text, useReflowStyles, useTheme } from "../../ui/core";
import { spacing, touchTarget } from "../../ui/tokens";
import { fullAmount, symbolAmount } from "./amounts";

export type FlowFocus = "net" | "out" | "in" | null;

export function CapitalFlow({ outMinorUnits, inMinorUnits, symbol, currency, focus, onFocus }: {
  outMinorUnits: number; inMinorUnits: number; symbol: string; currency: string;
  focus: FlowFocus; onFocus: (focus: FlowFocus) => void;
}) {
  const theme = useTheme();
  const reflow = useReflowStyles();
  const { t, language } = useT();
  const net = inMinorUnits - outMinorUnits;
  function amount(id: Exclude<FlowFocus, null>, label: string, value: number, color: string) {
    const focused = focus === id;
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label}
        accessibilityState={{ expanded: focused }}
        onPress={() => onFocus(focus === id ? null : id)}
        style={id === "net" ? styles.netBlock : [styles.netBlock, { minWidth: 0 }, reflow.flex(1, 0)]}>
        <Text variant="meta" tone="muted">{label}</Text>
        <Text preset={id === "net" || focused ? "flowFocus" : "flowAmount"} style={{ color }}
          numberOfLines={1} adjustsFontSizeToFit={focused} minimumFontScale={0.55}>
          {focused ? fullAmount(value, symbol, currency) : symbolAmount(value, symbol, "compact", currency, language)}
        </Text>
      </Pressable>
    );
  }
  return (
    <FlowSummary net={net} out={outMinorUnits} in={inMinorUnits} currency={currency} legacy={<View style={styles.wrap}>
      {(focus === null || focus === "net") && amount("net", t("review.flowNet"), net, net >= 0 ? theme.primary : theme.foreground)}
      {focus !== "net" && (
        <ReflowRow align="flex-end" reflowAlign="stretch" gap={spacing.lg} style={{ alignSelf: "stretch" }}>
          {(focus === null || focus === "out") && amount("out", t("review.flowOut"), outMinorUnits, theme.foreground)}
          {(focus === null || focus === "in") && amount("in", t("review.flowIn"), inMinorUnits, theme.primary)}
        </ReflowRow>
      )}
    </View>} />
  );
}

const styles = StyleSheet.create({
    wrap: { gap: spacing.sm, alignSelf: "stretch" },
    netBlock: { gap: 2, minHeight: touchTarget },
});
