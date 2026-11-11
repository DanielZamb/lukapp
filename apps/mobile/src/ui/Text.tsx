import type { ComponentPropsWithRef, ReactNode } from "react";
import { StyleSheet, Text as NativeText } from "react-native";
import { useNativeTextMetrics, useTheme, useTier } from "./themeContext";
import { textSpecs, textStyle, textTone, type TextTone, type TextVariant } from "./typography";

import { textPresetSpec, type TextPreset } from "./textPresets";
import { useTextReflow, type TextReflow } from "./reflow";
import { cappedNativeStyle } from "./nativeText";

export type TextProps = ComponentPropsWithRef<typeof NativeText> & ({ variant?: TextVariant; preset?: never } | { preset: TextPreset; variant?: never }) & { tone?: TextTone; reflow?: TextReflow };

export function Text({ variant = "body", preset, tone, reflow, style, ...props }: TextProps) {
  const tier = useTier();
  const theme = useTheme();
  const metrics = useNativeTextMetrics();
  const flow = useTextReflow(reflow);
  const { maxScale, ...presetStyle } = preset ? textPresetSpec(tier, preset) : textSpecs[tier][variant];
  const base = preset ? presetStyle : textStyle(tier, variant);
  const color = tone !== undefined || !preset ? { color: textTone(theme, tone ?? "default") } : undefined;
  const combined = reflow ? [base, color, style, flow.style] : [base, color, style];
  const nativeStyle = tier === "xxxl" && metrics.nonlinearAndroid
    ? cappedNativeStyle(StyleSheet.flatten(combined), metrics.fontScale, maxScale) : null;
  return <NativeText {...props} {...(reflow === "unclamp" || reflow === "trail" ? { numberOfLines: flow.numberOfLines } : {})}
    allowFontScaling maxFontSizeMultiplier={maxScale}
    style={[...combined, ...(nativeStyle ? [nativeStyle] : [])]} />;
}

export function EmojiText({ children, size, lineHeight }: { children: ReactNode; size: number; lineHeight: number }) {
  const metrics = useNativeTextMetrics();
  const style = { fontSize: size, lineHeight };
  return <NativeText allowFontScaling maxFontSizeMultiplier={1.3} style={[style, ...(metrics.nonlinearAndroid ? [cappedNativeStyle(style, metrics.fontScale, 1.3)] : [])]}>{children}</NativeText>;
}
