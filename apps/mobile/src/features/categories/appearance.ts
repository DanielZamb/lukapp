import { themes, type ThemeMode } from "../../ui/tokens";
import type { CategoryStyle } from "./model";

export type Hsl = { hue: number; saturation: number; lightness: number };

export function hslToHex({ hue, saturation, lightness }: Hsl) {
  const sat = saturation / 100;
  const light = lightness / 100;
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const value = light - sat * Math.min(light, 1 - light) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

const hsl = (hue: number, saturation: number, lightness: number) => hslToHex({ hue, saturation, lightness });

export const categoryPalette = [
  ...Array.from({ length: 24 }, (_, index) => ({
    id: `h${index * 15}`,
    light: hsl(index * 15, 62, 34),
    dark: hsl(index * 15, 72, 68),
  })),
  { id: "cool-gray", light: hsl(215, 12, 38), dark: hsl(215, 12, 68) },
  { id: "warm-gray", light: hsl(35, 12, 38), dark: hsl(35, 14, 68) },
  { id: "brown", light: hsl(25, 45, 32), dark: hsl(25, 45, 62) },
  { id: "olive", light: hsl(80, 35, 30), dark: hsl(80, 35, 60) },
];

export const quickEmojis = ["🛒", "🍔", "🚌", "🏠", "💊", "🎮", "🛍️", "✨"];

const storedHex = /^#[0-9a-f]{6}$/i;

/** A typed or pasted colour as the stored form `#RRGGBB`, or null when it is not six hex digits. */
export function parseHexColor(text: string): string | null {
  const digits = text.trim().match(/^#?([0-9a-f]{6})$/i)?.[1];
  return digits ? `#${digits.toUpperCase()}` : null;
}

export function isCustomColor(color: string | undefined): color is string {
  return !!color && storedHex.test(color);
}

/** A palette id follows the theme; an exact `#RRGGBB` is the same in both themes; anything else falls back to the tone. */
export function categoryColor(style: CategoryStyle, mode: ThemeMode = "light") {
  if (isCustomColor(style.color)) return style.color;
  return categoryPalette.find((entry) => entry.id === style.color)?.[mode] ?? themes[mode][style.tone];
}

export function hexToHsl(hex: string): Hsl {
  const [r, g, b] = channels(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  const hue = delta === 0 ? 0
    : max === r ? 60 * (((g - b) / delta + 6) % 6)
      : max === g ? 60 * ((b - r) / delta + 2)
        : 60 * ((r - g) / delta + 4);
  return { hue: Math.round(hue) % 360, saturation: Math.round(saturation * 100), lightness: Math.round(lightness * 100) };
}

function channels(hex: string) {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  return [value >> 16, (value >> 8) & 255, value & 255].map((channel) => channel / 255);
}

function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two `#RRGGBB` colours, from 1 to 21. */
export function contrastRatio(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const ink = { dark: "#000000", light: "#FFFFFF" };

/** Text or icon colour drawn on a solid fill of `color`, chosen from the fill's luminance. */
export function readableOn(color: string) {
  return contrastRatio(color, ink.dark) >= contrastRatio(color, ink.light) ? ink.dark : ink.light;
}

/** Border for a category tint on the screen; colours that would vanish into the background get the theme ring. */
export function categoryOutline(color: string, mode: ThemeMode) {
  return contrastRatio(color, themes[mode].background) >= 3 ? color : themes[mode].ring;
}

/** A ring for a track, fill or tint whose colour would vanish into the screen; palette colours need none. */
export function faintEdge(color: string, mode: ThemeMode) {
  const outline = categoryOutline(color, mode);
  return outline === color ? null : { borderWidth: 1, borderColor: outline };
}

/** Text drawn in the category colour on the screen; colours too faint to read fall back to the theme foreground. */
export function categoryInk(color: string, mode: ThemeMode) {
  return contrastRatio(color, themes[mode].background) >= 4.5 ? color : themes[mode].foreground;
}

export function emojiFrom(text: string) {
  return text.match(/(?:\p{Regional_Indicator}{2}|[#*0-9]️?⃣|\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*)/u)?.[0] ?? null;
}
