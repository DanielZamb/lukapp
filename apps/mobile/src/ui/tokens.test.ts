import { expect, test } from "vitest";
import { themes } from "./tokens";

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 6) {
    throw new Error(`Expected 6-digit hex, got ${hex}`);
  }
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function channelLuminance(channel: number): number {
  const srgb = channel / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

function contrastRatio(foreground: string, background: string): number {
  const fg = relativeLuminance(foreground);
  const bg = relativeLuminance(background);
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

test("user-approved token pairs meet their documented WCAG contrast ratios", () => {
  const { light, dark } = themes;

  expect(contrastRatio(light.mutedForeground, light.secondary)).toBeGreaterThanOrEqual(
    4.64 - 0.01,
  );
  expect(contrastRatio(light.warning, light.secondary)).toBeGreaterThanOrEqual(4.71 - 0.01);
  expect(contrastRatio(light.ring, light.background)).toBeGreaterThanOrEqual(3.45 - 0.01);
  expect(contrastRatio(dark.primaryForeground, dark.primary)).toBeGreaterThanOrEqual(
    5.2 - 0.01,
  );
});

test.each(["light", "dark"] as const)("%s primary text meets AA on background and secondary", (mode) => {
  const palette = themes[mode];
  expect(contrastRatio(palette.primaryText, palette.background)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(palette.primaryText, palette.secondary)).toBeGreaterThanOrEqual(4.5);
});
