import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import { PrimaryButton, Screen, theme } from "../../ui/core";
import { font, fontSize, radius, spacing, touchTarget } from "../../ui/tokens";
import { formatMoney } from "../money";
import type { LevelUnlock } from "./model";

export function LevelUnlocked({ unlock, onHome }: { unlock: LevelUnlock; onHome: () => void }) {
  return <Screen contentStyle={styles.page}>
    <View style={styles.completion}>
      <View style={styles.checkmark}>
        <Ionicons name="checkmark" size={32} color={theme.primaryForeground} />
      </View>
      <Text accessibilityRole="header" style={styles.title}>{unlock.door === "budget" ? "Limit is on" : "A second place"}</Text>
      {unlock.door === "budget" && <View style={[styles.chip, { backgroundColor: `${unlock.color}24`, borderColor: unlock.color }]}>
        <Text style={styles.emoji}>{unlock.emoji}</Text>
        <Text style={styles.chipText}>{unlock.category} · {formatMoney({ currency: unlock.currency, minorUnits: unlock.limitMinorUnits }, { hideZeroDecimals: true })}</Text>
      </View>}
      <Text style={styles.copy}>{unlock.door === "budget"
        ? "Alerts will watch this line. You can add another place whenever money lives in more than one."
        : `${unlock.accountName.trim() || "The new place"} is live. Moving money between places is now a thing, and any category can take a limit.`}</Text>
      <View style={styles.action}><PrimaryButton label="Back to the month" trailingIcon="home-outline" onPress={onHome} /></View>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
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
