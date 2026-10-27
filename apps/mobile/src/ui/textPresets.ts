import type { TextStyle } from "react-native";
import type { LayoutTier } from "./layout";
import { font } from "./tokens";
import { textSpecs, type TextVariant, type TextSpec } from "./typography";

type PresetSpec = { legacy: TextStyle; xxxl: TextVariant | TextSpec; system?: true };
export const textPresets = {
  sheetTitle: { legacy: { fontFamily: font.extrabold, fontSize: 28, lineHeight: 34, letterSpacing: -0.6 }, xxxl: "screen" },
  badge: { legacy: { fontFamily: font.bold, fontSize: 11 }, xxxl: { ...textSpecs.xxxl.label, maxScale: 1.3 } },
  flowAmount: { legacy: { fontFamily: font.extrabold, fontSize: 22, lineHeight: 26, letterSpacing: -0.4 }, xxxl: "money" },
  flowFocus: { legacy: { fontFamily: font.extrabold, fontSize: 36, lineHeight: 40, letterSpacing: -0.8 }, xxxl: "hero" },
  barAmount: { legacy: { fontFamily: font.bold, fontSize: 12 }, xxxl: "money" },
  composeLabel: { legacy: { fontFamily: font.medium, fontSize: 13 }, xxxl: "label" },
  rowMeta: { legacy: { fontFamily: font.regular, fontSize: 13 }, xxxl: "meta" },
  batchAmount: { legacy: { fontFamily: font.semibold, fontSize: 15, fontVariant: ["tabular-nums"] }, xxxl: "money" },
  batchNet: { legacy: { fontFamily: font.extrabold, fontSize: 32 }, xxxl: "hero" },
  impactAmount: { legacy: { fontFamily: font.extrabold, fontSize: 36 }, xxxl: "hero" },
  amountCurrency: { legacy: { fontFamily: font.semibold, fontSize: 28 }, xxxl: "label" },
  amountInput: { legacy: { fontFamily: font.extrabold, fontSize: 44 }, xxxl: "hero" },
  rowName: { legacy: { fontFamily: font.semibold, fontSize: 16 }, xxxl: "rowTitle" },
  rowSubtitle: { legacy: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 }, xxxl: "meta" },
  rowMoney: { legacy: { fontFamily: font.semibold, fontSize: 14 }, xxxl: "money" },
  detailAmount: { legacy: { fontFamily: font.extrabold, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 }, xxxl: "detailName" },
  footnote: { legacy: { fontFamily: font.regular, fontSize: 13, lineHeight: 19 }, xxxl: "meta" },
  systemFootnote: { legacy: { fontSize: 13, lineHeight: 19 }, xxxl: "meta", system: true },
  filterSort: { legacy: { fontFamily: font.bold, fontSize: 14 }, xxxl: "action" },
  body: { legacy: { fontFamily: font.regular, fontSize: 16 }, xxxl: "body" },
  bodyCopy: { legacy: { fontFamily: font.regular, fontSize: 16, lineHeight: 24 }, xxxl: "body" },
  bodyStrong: { legacy: { fontFamily: font.bold, fontSize: 16 }, xxxl: "rowTitle" },
  action: { legacy: { fontFamily: font.bold, fontSize: 17 }, xxxl: "action" },
  caption: { legacy: { fontFamily: font.regular, fontSize: 12 }, xxxl: "meta" },
  captionMedium: { legacy: { fontFamily: font.medium, fontSize: 12 }, xxxl: "label" },
  captionStrong: { legacy: { fontFamily: font.bold, fontSize: 12 }, xxxl: "label" },
  captionLine: { legacy: { fontFamily: font.regular, fontSize: 12, lineHeight: 16 }, xxxl: "meta" },
  rowTitle: { legacy: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22 }, xxxl: "rowTitle" },
  money: { legacy: { fontFamily: font.semibold, fontSize: 14, lineHeight: 20 }, xxxl: "money" },
  fieldLabel: { legacy: { fontFamily: font.semibold, fontSize: 14 }, xxxl: "label" },
  sectionTitle: { legacy: { fontFamily: font.extrabold, fontSize: 24 }, xxxl: "section" },
  budgetInput: { legacy: { fontFamily: font.extrabold, fontSize: 44, letterSpacing: -1.2 }, xxxl: "hero" },
  detailName: { legacy: { fontFamily: font.extrabold, fontSize: 30, lineHeight: 36 }, xxxl: "detailName" },
  healthTitle: { legacy: { fontFamily: font.extrabold, fontSize: 28, lineHeight: 33 }, xxxl: "screen" },
  monthTitle: { legacy: { fontFamily: font.extrabold, fontSize: 28, lineHeight: 34 }, xxxl: "screen" },
  monthCount: { legacy: { fontFamily: font.extrabold, fontSize: 64, lineHeight: 68, letterSpacing: -2 }, xxxl: "hero" },
  draftAmount: { legacy: { fontFamily: font.extrabold, fontSize: 38, lineHeight: 43, letterSpacing: -0.8 }, xxxl: "hero" },
  draftBody: { legacy: { fontFamily: font.regular, fontSize: 15, lineHeight: 22 }, xxxl: "body" },
  warningBody: { legacy: { fontFamily: font.regular, fontSize: 18, lineHeight: 27 }, xxxl: "body" },
  composeSelected: { legacy: { fontFamily: font.bold, fontSize: 13 }, xxxl: "label" },
  segmentLabel: { legacy: { fontFamily: font.medium, fontSize: 16 }, xxxl: "action" },
  completionAmount: { legacy: { fontFamily: font.extrabold, fontSize: 32, lineHeight: 52 }, xxxl: "hero" },
  startingAmount: { legacy: { fontFamily: font.extrabold, fontSize: 40, lineHeight: 48, letterSpacing: -1 }, xxxl: "hero" },
  placeHeroEmoji: { legacy: { fontSize: 40, lineHeight: 48 }, xxxl: { fontSize: 40, lineHeight: 48, maxScale: 1.3 } },
  placeLookEmoji: { legacy: { fontSize: 32, lineHeight: 38 }, xxxl: { fontSize: 32, lineHeight: 38, maxScale: 1.3 } },
  tileEmoji: { legacy: { fontSize: 22, lineHeight: 26 }, xxxl: { fontSize: 22, lineHeight: 26, maxScale: 1.3 } },
  nativeInput: { legacy: {}, xxxl: "body", system: true },
  system: { legacy: {}, xxxl: "body", system: true },
  emoji16: { legacy: { fontSize: 16 }, xxxl: { fontSize: 16, maxScale: 1.3 } },
  emoji17: { legacy: { fontSize: 17 }, xxxl: { fontSize: 17, maxScale: 1.3 } },
  emoji18: { legacy: { fontSize: 18 }, xxxl: { fontSize: 18, maxScale: 1.3 } },
  emoji21: { legacy: { fontSize: 21 }, xxxl: { fontSize: 21, maxScale: 1.3 } },
  emoji22: { legacy: { fontSize: 22 }, xxxl: { fontSize: 22, maxScale: 1.3 } },
  emoji26: { legacy: { fontSize: 26 }, xxxl: { fontSize: 26, maxScale: 1.3 } },
  emoji28: { legacy: { fontSize: 28 }, xxxl: { fontSize: 28, maxScale: 1.3 } },
} satisfies Record<string, PresetSpec>;

export type TextPreset = keyof typeof textPresets;

export function textPresetSpec(tier: LayoutTier, preset: TextPreset): TextStyle & { maxScale?: number } {
  const entry: PresetSpec = textPresets[preset];
  if (tier !== "xxxl") return entry.legacy;
  const spec = typeof entry.xxxl === "string" ? textSpecs.xxxl[entry.xxxl] : entry.xxxl;
  const { fontFamily, ...systemSpec } = spec;
  return { ...(entry.system ? systemSpec : spec), ...(entry.legacy.fontVariant && { fontVariant: entry.legacy.fontVariant }) };
}
