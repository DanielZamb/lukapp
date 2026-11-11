import type { CategoryStyle } from "./model";

export const fallbackLook: CategoryStyle = {
  emoji: "✨",
  tone: "primary",
  color: "h270",
};
export const starterCategories = [
  { key: "groceries", name: "Food", style: { emoji: "🛒", tone: "primary", color: "h150" } },
  { key: "transport", name: "Transport", style: { emoji: "🚌", tone: "primary", color: "h210" } },
  { key: "dining", name: "Dining", style: { emoji: "🍔", tone: "primary", color: "h30" } },
  { key: "home", name: "Home", style: { emoji: "🏠", tone: "primary", color: "h270" } },
  { key: "health", name: "Health", style: { emoji: "💊", tone: "primary", color: "h345" } },
  { key: "fun", name: "Fun", style: { emoji: "🎮", tone: "primary", color: "h45" } },
  { key: "shopping", name: "Shopping", style: { emoji: "🛍️", tone: "primary", color: "h180" } },
  {
    key: "bills", name: "Bills",
    style: { emoji: "🧾", tone: "primary", color: "cool-gray" },
  },
  { key: "family", name: "Family", style: { emoji: "👪", tone: "primary", color: "h195" } },
  { key: "education", name: "Education", style: { emoji: "📚", tone: "primary", color: "h240" } },
  { key: "pets", name: "Pets", style: { emoji: "🐾", tone: "primary", color: "h15" } },
  {
    key: "other", name: "Other",
    style: { emoji: "✨", tone: "primary", color: "warm-gray" },
  },
] satisfies { key: string; name: string; style: CategoryStyle }[];
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
