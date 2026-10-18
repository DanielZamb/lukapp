import { StyleSheet } from "react-native";
import { theme } from "../../ui/core";
import { font, radius, spacing, touchTarget } from "../../ui/tokens";

export const setupStyles = StyleSheet.create({
  page: { padding: spacing.xxl, gap: spacing.xxl, paddingBottom: 48 },
  board: { gap: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  label: { fontFamily: font.semibold, fontSize: 14, color: theme.foreground },
  chipText: {
    fontFamily: font.semibold,
    fontSize: 14,
    color: theme.foreground,
  },
  chip: {
    minHeight: touchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.secondary,
  },
  own: { borderStyle: "dashed", backgroundColor: theme.background },
  selected: { borderWidth: 2, borderColor: theme.primary },
  icon: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.full,
    backgroundColor: theme.secondary,
    borderWidth: 1,
    borderColor: theme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: theme.ring,
    backgroundColor: theme.secondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    fontFamily: font.regular,
    fontSize: 16,
    color: theme.foreground,
  },
  searchRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
    paddingVertical: spacing.md,
  },
  searchHeader: {
    backgroundColor: theme.background,
    paddingBottom: spacing.md,
  },
});
