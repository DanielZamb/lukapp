import type { CategoryStyle } from "./model";

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
  { name: "Education", style: { emoji: "📚", tone: "primary", color: "h240" } },
  { name: "Pets", style: { emoji: "🐾", tone: "primary", color: "h15" } },
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
