import type { ComponentPropsWithRef } from "react";
import { Text as NativeText } from "react-native";
import { useTheme, useTier } from "./themeContext";
import { textSpecs, textStyle, textTone, type TextTone, type TextVariant } from "./typography";

export type TextProps = ComponentPropsWithRef<typeof NativeText> & { variant?: TextVariant; tone?: TextTone };

export function Text({ variant = "body", tone = "default", style, ...props }: TextProps) {
  const tier = useTier();
  const theme = useTheme();
  return <NativeText {...props} allowFontScaling maxFontSizeMultiplier={textSpecs[tier][variant].maxScale}
    style={[textStyle(tier, variant), { color: textTone(theme, tone) }, style]} />;
}
