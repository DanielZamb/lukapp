import type { TextStyle } from "react-native";
import type { LayoutTier } from "./layout";
import { font, type Theme } from "./tokens";

export type TextSpec = Pick<TextStyle, "fontFamily" | "fontSize" | "lineHeight" | "letterSpacing"> & { maxScale?: number };

const defaultText = {
  hero: { fontFamily: font.extrabold, fontSize: 44, lineHeight: 52 },
  screen: { fontFamily: font.extrabold, fontSize: 32, lineHeight: 37, letterSpacing: -0.7 },
  detailName: { fontFamily: font.extrabold, fontSize: 30, lineHeight: 36 },
  section: { fontFamily: font.bold, fontSize: 20 },
  money: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20 },
  rowTitle: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: font.regular, fontSize: 16 },
  action: { fontFamily: font.bold, fontSize: 17 },
  meta: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: font.bold, fontSize: 12, letterSpacing: 1 },
} satisfies Record<string, TextSpec>;

export type TextVariant = keyof typeof defaultText;
export type TextTone = "default" | "muted" | "primary" | "positive" | "warning" | "danger";

const xxxlText = {
  hero: { fontFamily: font.semibold, fontSize: 44, lineHeight: 44 * 1.04, letterSpacing: -0.05 * 44, maxScale: 1.2 },
  screen: { fontFamily: font.semibold, fontSize: 32, lineHeight: 32 * 1.1, letterSpacing: -0.045 * 32, maxScale: 1.25 },
  detailName: { fontFamily: font.semibold, fontSize: 30, lineHeight: 30 * 1.12, letterSpacing: -0.04 * 30, maxScale: 1.25 },
  section: { fontFamily: font.semibold, fontSize: 20, lineHeight: 20 * 1.25, letterSpacing: -0.025 * 20, maxScale: 1.35 },
  money: { fontFamily: font.semibold, fontSize: 18, lineHeight: 18 * 1.2, letterSpacing: -0.035 * 18, maxScale: 1.5 },
  rowTitle: { fontFamily: font.semibold, fontSize: 16, lineHeight: 16 * 1.3, letterSpacing: -0.02 * 16, maxScale: 1.5 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 16 * 1.45, letterSpacing: -0.01 * 16 },
  action: { fontFamily: font.semibold, fontSize: 17, lineHeight: 17 * 1.25, letterSpacing: -0.015 * 17, maxScale: 1.4 },
  meta: { fontFamily: font.regular, fontSize: 14, lineHeight: 14 * 1.4, letterSpacing: 0 },
  label: { fontFamily: font.medium, fontSize: 12, lineHeight: 12 * 1.35, letterSpacing: 0 },
} satisfies Record<TextVariant, TextSpec>;

export const textSpecs: Record<LayoutTier, Record<TextVariant, TextSpec>> = {
  default: defaultText,
  reflow: defaultText,
  xxxl: xxxlText,
};

export function textStyle(tier: LayoutTier, variant: TextVariant): TextStyle {
  const { maxScale: _maxScale, ...style } = textSpecs[tier][variant];
  return style;
}

export function textTone(theme: Theme, tone: TextTone) {
  const colors = { default: theme.foreground, muted: theme.mutedForeground, primary: theme.primaryText, positive: theme.positive, warning: theme.warning, danger: theme.danger };
  return colors[tone];
}
