import { theme } from "../../ui/core";
import type { CategoryStyle } from "./model";

function hslToHex(hue: number, saturation: number, lightness: number) {
  const sat = saturation / 100;
  const light = lightness / 100;
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const value = light - sat * Math.min(light, 1 - light) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export const categoryPalette = [
  ...Array.from({ length: 24 }, (_, index) => ({
    id: `h${index * 15}`,
    light: hslToHex(index * 15, 62, 34),
    dark: hslToHex(index * 15, 72, 68),
  })),
  { id: "cool-gray", light: hslToHex(215, 12, 38), dark: hslToHex(215, 12, 68) },
  { id: "warm-gray", light: hslToHex(35, 12, 38), dark: hslToHex(35, 14, 68) },
  { id: "brown", light: hslToHex(25, 45, 32), dark: hslToHex(25, 45, 62) },
  { id: "olive", light: hslToHex(80, 35, 30), dark: hslToHex(80, 35, 60) },
];

export const quickEmojis = ["🛒", "🍔", "🚌", "🏠", "💊", "🎮", "🛍️", "✨"];

export function categoryColor(style: CategoryStyle) {
  return categoryPalette.find((entry) => entry.id === style.color)?.light ?? theme[style.tone];
}

export function emojiFrom(text: string) {
  return text.match(/(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*)/u)?.[0] ?? null;
}
