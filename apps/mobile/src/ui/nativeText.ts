import type { TextStyle } from "react-native";

const sp = [8, 10, 12, 14, 18, 20, 24, 30, 100];
const curves = [
  { scale: 1, dp: sp },
  { scale: 1.05, dp: [8.4, 10.5, 12.6, 14.8, 18.6, 20.6, 24.4, 30, 100] },
  { scale: 1.1, dp: [8.8, 11, 13.2, 15.6, 19.2, 21.2, 24.8, 30, 100] },
  { scale: 1.15, dp: [9.2, 11.5, 13.8, 16.4, 19.8, 21.8, 25.2, 30, 100] },
  { scale: 1.2, dp: [9.6, 12, 14.4, 17.2, 20.4, 22.4, 25.6, 30, 100] },
  { scale: 1.3, dp: [10.4, 13, 15.6, 18.8, 21.6, 23.6, 26.4, 30, 100] },
  { scale: 1.5, dp: [12, 15, 18, 22, 24, 26, 28, 30, 100] },
  { scale: 1.8, dp: [14.4, 18, 21.6, 24.4, 27.6, 30.8, 32.8, 34.8, 100] },
  { scale: 2, dp: [16, 20, 24, 26, 30, 34, 36, 38, 100] },
];
function lookup(value: number, dp: readonly number[]) {
  const firstSp = sp[0] ?? 8;
  if (value <= firstSp) return value * (dp[0] ?? firstSp) / firstSp;
  for (let i = 1; i < sp.length; i++) {
    const lowerSp = sp[i - 1], upperSp = sp[i], lowerDp = dp[i - 1], upperDp = dp[i];
    if (lowerSp !== undefined && upperSp !== undefined && lowerDp !== undefined && upperDp !== undefined && value <= upperSp) return lowerDp + (value - lowerSp) * (upperDp - lowerDp) / (upperSp - lowerSp);
  }
  return value;
}
export function androidScaledSize(value: number, scale: number) {
  const sign = value < 0 ? -1 : 1;
  const absolute = Math.abs(value);
  if (scale <= 1 || scale > 2) return value * scale;
  for (let i = 1; i < curves.length; i++) {
    const lower = curves[i - 1], upper = curves[i];
    if (lower && upper && scale <= upper.scale) {
      const fraction = (scale - lower.scale) / (upper.scale - lower.scale);
      return sign * (lookup(absolute, lower.dp) * (1 - fraction) + lookup(absolute, upper.dp) * fraction);
    }
  }
  return value * scale;
}
function nativeInputForDp(target: number, scale: number, cap?: number) {
  const sign = target < 0 ? -1 : 1;
  const absolute = Math.abs(target);
  let lower = 0, upper = Math.max(absolute, 100);
  for (let i = 0; i < 40; i++) {
    const middle = (lower + upper) / 2;
    const actual = cap ? Math.min(androidScaledSize(middle, scale), middle * cap) : androidScaledSize(middle, scale);
    if (actual < absolute) lower = middle; else upper = middle;
  }
  return sign * (lower + upper) / 2;
}
// RN caps min(AOSP(sp), sp × cap); the design caps the multiplier before conversion.
// AOSP curves: https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/content/res/FontScaleConverterFactory.java
export function cappedNativeStyle(style: TextStyle, scale: number, cap?: number): TextStyle {
  if (!cap || scale <= cap) return {};
  return {
    ...(style.fontSize !== undefined && { fontSize: nativeInputForDp(style.fontSize * cap, scale, cap) }),
    ...(style.lineHeight !== undefined && { lineHeight: nativeInputForDp(style.lineHeight * cap, scale) }),
    ...(style.letterSpacing !== undefined && { letterSpacing: nativeInputForDp(style.letterSpacing * cap, scale) }),
  };
}

/**
 * A text style drawn for `effective`, a text size above the phone's own, with font scaling off: each length is the
 * size the phone would have produced at that setting, so the app's own text size and the phone's give the same result.
 */
export function appScaledStyle(style: TextStyle, effective: number, nonlinear: boolean, cap?: number): TextStyle {
  const scaled = (value: number) => cap && effective > cap ? value * cap : nonlinear ? androidScaledSize(value, effective) : value * effective;
  return {
    fontSize: scaled(style.fontSize ?? 14),
    ...(style.lineHeight !== undefined && { lineHeight: scaled(style.lineHeight) }),
    ...(style.letterSpacing !== undefined && { letterSpacing: scaled(style.letterSpacing) }),
  };
}
