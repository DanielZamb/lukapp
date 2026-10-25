import { useState } from "react";
import { Text as NativeText, View, useWindowDimensions, type StyleProp, type TextStyle, type TextLayoutLine } from "react-native";
import { useThemeContext } from "./themeContext";
import { Text } from "./Text";
import { type TextTone } from "./typography";
import { xxxl } from "./tokens";
import { amountGroups, heroFit } from "./design";

export type MoneyHeroProps = {
  currency: string; amount: string; negative?: boolean; style?: StyleProp<TextStyle>;
  tone?: TextTone; floor?: number; groupSeparator?: string; align?: "start" | "center";
};
export function MoneyHero({ currency, amount, negative = false, style, ...props }: MoneyHeroProps) {
  const { ui, layout } = useThemeContext();
  const label = `${negative ? "−" : ""}${currency} ${amount}`;
  if (layout.tier !== "xxxl") return <NativeText accessibilityLabel={label} style={[ui.hero, style]} adjustsFontSizeToFit numberOfLines={1}>{label}</NativeText>;
  return <LargeMoneyHero currency={currency} amount={amount} negative={negative} style={style} {...props} />;
}
function LargeMoneyHero(props: MoneyHeroProps) {
  const { fontScale } = useWindowDimensions();
  return <MeasuredMoneyHero key={`${props.currency}:${props.amount}:${props.negative}:${fontScale}`} {...props} fontScale={fontScale} />;
}
function MeasuredMoneyHero({ currency, amount, negative, style, tone, floor, groupSeparator = ".", align = "start", fontScale }: MoneyHeroProps & { fontScale: number }) {
  const { ui } = useThemeContext();
  const [width, setWidth] = useState(0);
  const [numberLine, setNumberLine] = useState<TextLayoutLine>();
  const [legacyLine, setLegacyLine] = useState<TextLayoutLine>();
  const signed = `${negative ? "−" : ""}${amount}`;
  const label = `${negative ? "−" : ""}${currency} ${amount}`;
  const target = 44 * Math.min(fontScale, 1.2);
  const legacyFloor = numberLine && legacyLine && numberLine.capHeight > 0
    ? target * legacyLine.capHeight / numberLine.capHeight * Math.min(1, width / legacyLine.width) : target;
  const minimum = Math.max(floor ?? legacyFloor, 28);
  const fit = width > 0 && numberLine ? heroFit({ available: width, measured: numberLine.width, target, floor: minimum }) : { size: target, wrap: false };
  const ratio = fit.size / target;
  const numberStyle: TextStyle = { fontSize: 44 * ratio, lineHeight: 44 * 1.04 * ratio, letterSpacing: -2.2 * ratio, fontVariant: ["tabular-nums"] };
  return <View accessible accessibilityLabel={label} style={{ gap: xxxl.spacing.insideRow, minWidth: 0, ...(align === "center" && { alignSelf: "stretch" }) }} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <Text accessible={false} variant="label" tone="primary" style={align === "center" ? { textAlign: "center" } : undefined}>{currency}</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", ...(align === "center" && { justifyContent: "center" }) }}>
      {(fit.wrap ? amountGroups(signed, groupSeparator) : [signed]).map((part, index) => <Text key={`${signed}:${index}`} accessible={false} variant="hero" tone={tone} numberOfLines={1} style={[style, numberStyle]}>{part}</Text>)}
    </View>
    <View key={`${label}:${fontScale}`} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: "absolute", opacity: 0, width: 10000 }}>
      <Text accessible={false} variant="hero" style={[style, { fontSize: 44, lineHeight: 44 * 1.04, letterSpacing: -2.2, fontVariant: ["tabular-nums"] }]} onTextLayout={event => setNumberLine(event.nativeEvent.lines[0])}>{signed}</Text>
      <NativeText accessible={false} style={[ui.hero, style]} onTextLayout={event => setLegacyLine(event.nativeEvent.lines[0])}>{label}</NativeText>
    </View>
  </View>;
}
