import type { Theme } from "../../ui/tokens";
import { useMemo } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton, Screen, useTheme, useThemeMode } from "../../ui/core";
import { categoryOutline } from "../categories/appearance";
import { font, fontSize, radius, spacing, touchTarget } from "../../ui/tokens";
import { formatMoney } from "../money";
import { useT } from "../../i18n";
import type { LevelUnlock } from "./model";

export function LevelUnlocked({ unlock, onHome }: { unlock: LevelUnlock; onHome: () => void }) {
  const theme = useTheme();
  const mode = useThemeMode();
  const { t } = useT();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return <Screen contentStyle={styles.page}>
    <View style={styles.completion}>
      <View style={styles.checkmark}>
        <Ionicons name="checkmark" size={32} color={theme.primaryForeground} />
      </View>
      <Text accessibilityRole="header" style={styles.title}>{unlock.door === "budget" ? t("home.levelLimitTitle") : t("home.levelPlaceTitle")}</Text>
      {unlock.door === "budget" && <View style={[styles.chip, { backgroundColor: `${unlock.color}24`, borderColor: categoryOutline(unlock.color, mode) }]}>
        <Text style={styles.emoji}>{unlock.emoji}</Text>
        <Text style={styles.chipText}>{unlock.category} · {unlock.limitMinorUnits === 0 ? t("budget.spendNothing")
          : formatMoney({ currency: unlock.currency, minorUnits: unlock.limitMinorUnits }, { hideZeroDecimals: true })}</Text>
      </View>}
      <Text style={styles.copy}>{unlock.door === "budget"
        ? t("home.levelLimitBody")
        : t("home.levelPlaceBody", { name: unlock.accountName?.trim() || t("home.levelNewPlace") })}</Text>
      <View style={styles.action}><PrimaryButton label={t("home.levelHome")} trailingIcon="home-outline" onPress={onHome} /></View>
    </View>
  </Screen>;
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
  page: { justifyContent: "center" },
  completion: { flex: 1, minHeight: 560, justifyContent: "center", alignItems: "center", gap: spacing.xl },
  checkmark: { width: 68, height: 68, borderRadius: radius.full, alignItems: "center", justifyContent: "center", backgroundColor: theme.primary },
  title: { color: theme.foreground, fontSize: 30, lineHeight: 36, fontFamily: font.extrabold, textAlign: "center" },
  chip: { minHeight: touchTarget, flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 2, maxWidth: "100%" },
  emoji: { fontSize: 18 },
  chipText: { flexShrink: 1, color: theme.foreground, fontSize: 14, fontFamily: font.semibold },
  copy: { maxWidth: 340, color: theme.mutedForeground, fontSize: fontSize.body, lineHeight: 24, fontFamily: font.regular, textAlign: "center" },
  action: { alignSelf: "stretch" },
  });
}
