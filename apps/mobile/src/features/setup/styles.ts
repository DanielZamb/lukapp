import { StyleSheet } from "react-native";
import { useMemo } from "react";
import { useReadableLayout, useTheme } from "../../ui/themeContext";
import type { ReadableLayout } from "../../ui/layout";
import type { Theme } from "../../ui/tokens";
import { font, radius, spacing, touchTarget } from "../../ui/tokens";

export function useSetupStyles() {
  const theme = useTheme();
  const layout = useReadableLayout();
  return useMemo(() => createSetupStyles(theme, layout), [theme, layout]);
}

function createSetupStyles(theme: Theme, layout: ReadableLayout) {
  return StyleSheet.create({
    page: { padding: layout.pagePadding, gap: spacing.xxl, paddingBottom: 48 },
    board: { gap: spacing.md },
    row: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    label: { fontFamily: font.semibold, fontSize: 14, color: theme.foreground },
    chipText: {
      flexShrink: 1,
      fontFamily: font.semibold,
      fontSize: 14,
      color: theme.foreground,
    },
    chip: {
      maxWidth: "100%",
      minHeight: touchTarget,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
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
}
