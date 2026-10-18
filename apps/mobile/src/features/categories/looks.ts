import type { CategoryStyle } from "./model";
import type { ThemeMode } from "../../ui/tokens";

function hslToHex(hue: number, saturation: number, lightness: number) {
  const sat = saturation / 100;
  const light = lightness / 100;
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const value =
      light -
      sat *
        Math.min(light, 1 - light) *
        Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export const categoryPalette = [
  ...Array.from({ length: 24 }, (_, index) => ({
    id: `h${index * 15}`,
    light: hslToHex(index * 15, 62, 34),
    dark: hslToHex(index * 15, 72, 68),
  })),
  {
    id: "cool-gray",
    light: hslToHex(215, 12, 38),
    dark: hslToHex(215, 12, 68),
  },
  { id: "warm-gray", light: hslToHex(35, 12, 38), dark: hslToHex(35, 14, 68) },
  { id: "brown", light: hslToHex(25, 45, 32), dark: hslToHex(25, 45, 62) },
  { id: "olive", light: hslToHex(80, 35, 30), dark: hslToHex(80, 35, 60) },
];
export function categoryColor(style: CategoryStyle, mode: ThemeMode = "light") {
  return categoryPalette.find((entry) => entry.id === style.color)?.[mode];
}
export const fallbackLook: CategoryStyle = {
  emoji: "✨",
  tone: "primary",
  color: "h270",
};
export const starterCategories = [
  { name: "Food", style: { emoji: "🛒", tone: "primary", color: "h150" } },
  { name: "Transport", style: { emoji: "🚌", tone: "primary", color: "h210" } },
  { name: "Dining", style: { emoji: "🍔", tone: "primary", color: "h30" } },
  { name: "Home", style: { emoji: "🏠", tone: "primary", color: "h270" } },
  { name: "Health", style: { emoji: "💊", tone: "primary", color: "h345" } },
  { name: "Fun", style: { emoji: "🎮", tone: "primary", color: "h45" } },
  { name: "Shopping", style: { emoji: "🛍️", tone: "primary", color: "h180" } },
  {
    name: "Bills",
    style: { emoji: "🧾", tone: "primary", color: "cool-gray" },
  },
  { name: "Family", style: { emoji: "👪", tone: "primary", color: "h195" } },
  {
    name: "Other",
    style: { emoji: "✨", tone: "primary", color: "warm-gray" },
  },
] satisfies { name: string; style: CategoryStyle }[];
export const quickEmojis = ["🛒", "🍔", "🚌", "🏠", "💊", "🎮", "🛍️", "✨"];

export function emojiFrom(text: string) {
  const trimmed = text.trim();
  if (
    !/\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/u.test(
      trimmed,
    )
  )
    return null;
  if (typeof Intl.Segmenter === "function") {
    for (const part of new Intl.Segmenter(undefined, {
      granularity: "grapheme",
    }).segment(trimmed)) {
      if (
        /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u.test(
          part.segment,
        )
      )
        return part.segment;
    }
  }
  return trimmed;
}
