import { StyleSheet } from "react-native";
import { font, fontSize, radius, spacing, type Theme } from "../../ui/tokens";

export function createRecoveryStyles(theme: Theme) {
  return StyleSheet.create({
    amountCard: {
      gap: spacing.md,
      padding: spacing.xl,
      backgroundColor: theme.secondary,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: theme.border,
    },
    amount: { fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
    amountEntry: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    amountInput: { flex: 1, minWidth: 0, padding: 0, minHeight: 44 },
    sources: {
      gap: spacing.md,
      padding: spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    legend: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    warning: { color: theme.warning },
    quiet: { color: theme.mutedForeground },
    completion: { justifyContent: "center" },
    completionIcon: {
      alignSelf: "center",
      alignItems: "center",
      justifyContent: "center",
      width: 68,
      height: 68,
      borderRadius: radius.full,
      backgroundColor: theme.primary,
    },
    completionTitle: {
      fontFamily: font.extrabold,
      fontSize: 30,
      lineHeight: 36,
      color: theme.foreground,
      textAlign: "center",
    },
    completionCopy: { fontSize: fontSize.body, lineHeight: 24, textAlign: "center" },
  });
}
