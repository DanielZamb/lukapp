import type { ComponentPropsWithRef, ReactNode } from "react";
import { StyleSheet, Text as NativeText } from "react-native";
import { useNativeTextMetrics, useTheme, useTier } from "./themeContext";
import { textSpecs, textStyle, textTone, type TextTone, type TextVariant } from "./typography";

import { cappedNativeStyle } from "./nativeText";

export type TextProps = ComponentPropsWithRef<typeof NativeText> & { variant?: TextVariant; tone?: TextTone };

export function Text({ variant = "body", tone = "default", style, ...props }: TextProps) {
  const tier = useTier();
  const theme = useTheme();
  const metrics = useNativeTextMetrics();
  const nativeStyle = tier === "xxxl" && metrics.nonlinearAndroid
    ? cappedNativeStyle(StyleSheet.flatten([textStyle(tier, variant), style]), metrics.fontScale, textSpecs[tier][variant].maxScale) : null;
  return <NativeText {...props} allowFontScaling maxFontSizeMultiplier={textSpecs[tier][variant].maxScale}
    style={[textStyle(tier, variant), { color: textTone(theme, tone) }, style, ...(nativeStyle ? [nativeStyle] : [])]} />;
}

export function EmojiText({ children, size, lineHeight }: { children: ReactNode; size: number; lineHeight: number }) {
  const metrics = useNativeTextMetrics();
  const style = { fontSize: size, lineHeight };
  return <NativeText allowFontScaling maxFontSizeMultiplier={1.3} style={[style, ...(metrics.nonlinearAndroid ? [cappedNativeStyle(style, metrics.fontScale, 1.3)] : [])]}>{children}</NativeText>;
}
