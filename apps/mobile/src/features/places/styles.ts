import { StyleSheet } from "react-native";
import { useMemo } from "react";
import { useTheme, useUi } from "../../ui/core";
import { font, radius, spacing, touchTarget } from "../../ui/tokens";

export function usePlaceStyles() {
  const theme = useTheme();
  const ui = useUi();
  return useMemo(() => StyleSheet.create({
  page: { gap: spacing.xl, paddingTop: spacing.md, paddingBottom: 132 },
  pageTitle: { fontSize: 32, lineHeight: 37, fontFamily: font.extrabold, letterSpacing: -0.7 },
  hero: { gap: spacing.sm, paddingVertical: spacing.md },
  amount: { ...ui.hero, letterSpacing: -1.2, width: "100%" },
  muted: { ...ui.muted, fontSize: 14, lineHeight: 20 },
  heroEmoji: { fontSize: 40, lineHeight: 48 },
  detailAmount: { ...ui.hero, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  group: { borderWidth: 1, borderColor: theme.border, borderRadius: radius.lg, backgroundColor: theme.secondary, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border, minHeight: 70, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  placeButton: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: touchTarget },
  glyph: { fontSize: 22 },
  placeGlyph: { width: 32, fontSize: 22, textAlign: "center" },
  lookGlyph: { fontSize: 32, lineHeight: 38 },
  name: { ...ui.body, fontFamily: font.semibold, flex: 1 },
  value: { ...ui.body, fontSize: 14, fontFamily: font.semibold, maxWidth: "42%", textAlign: "right" },
  icon: { minWidth: touchTarget, minHeight: touchTarget, alignItems: "center", justifyContent: "center",
    borderRadius: radius.full, backgroundColor: theme.background },
  sheetSurface: { backgroundColor: theme.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    borderWidth: 1, borderColor: theme.border },
  sheetBody: { paddingHorizontal: spacing.xxl, paddingTop: spacing.sm, paddingBottom: 44, gap: spacing.md },
  sheetTitle: { ...ui.title, fontSize: 28, lineHeight: 34, fontFamily: font.extrabold, letterSpacing: -0.6 },
  field: { gap: spacing.sm },
  fieldLabel: { ...ui.body, fontSize: 14, fontFamily: font.semibold },
  input: { ...ui.input, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.ring,
    borderRadius: radius.md, paddingHorizontal: spacing.lg, minHeight: 56 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: { minHeight: touchTarget, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.secondary, borderRadius: radius.full },
  selected: { borderColor: theme.primary, borderWidth: 2 },
  chipText: { ...ui.body, fontSize: 14, fontFamily: font.semibold },
  emojiChip: { width: touchTarget, height: touchTarget, alignItems: "center", justifyContent: "center", borderWidth: 1,
    borderColor: theme.border, borderRadius: radius.full, backgroundColor: theme.secondary },
  look: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: touchTarget },
  }), [theme, ui]);
}
