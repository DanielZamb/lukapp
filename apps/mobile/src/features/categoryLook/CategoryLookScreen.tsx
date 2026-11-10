import type { Theme } from "../../ui/tokens";
import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Header, PrimaryButton, SecondaryButton, Screen, useTheme, useThemeMode, useUi } from "../../ui/core";
import { categoryColor, categoryOutline, faintEdge } from "../categories/appearance";
import { font, fontSize, radius, spacing, touchTarget } from "../../ui/tokens";
import { useT } from "../../i18n";
import { formatMoney } from "../money";
import { remaining, remainingFill } from "../overview/model";
import type { CategoryLookData } from "./model";

export function CategoryLookScreen({ data, onBack, onSetLimit, onEdit }: {
  data: CategoryLookData | null | undefined;
  onBack: () => void; onSetLimit: () => void;
  onEdit?: () => void;
}) {
  const ui = useUi();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const mode = useThemeMode();
  const { t } = useT();
  const color = data ? categoryColor(data.style, mode) : theme.primary;
  const left = data ? remaining(data) : null;
  const money = (minorUnits: number) => formatMoney({ currency: data?.currency ?? "COP", minorUnits }, { hideZeroDecimals: true });
  return (
    <Screen contentStyle={styles.page}>
      <Header title={data?.name ?? t("categories.pickerTitle")} eyebrow={t("categories.lookEyebrow")} onBack={onBack} />
      {data === undefined ? <ActivityIndicator accessibilityLabel={t("categories.lookLoading")} />
        : data === null ? <Text style={ui.muted}>{t("categories.lookGone")}</Text> : <>
          <View style={styles.openAmount}>
            <View style={[styles.lookChip, { backgroundColor: `${color}24`, borderColor: categoryOutline(color, mode) }]}>
              <Text style={styles.emoji}>{data.style.emoji}</Text>
              <Text style={styles.chipText}>{data.name}</Text>
            </View>
            <Text style={styles.muted}>{t("categories.lookOutThisMonth")}</Text>
            <Text adjustsFontSizeToFit numberOfLines={1} style={[ui.hero, styles.hero]}>{money(data.spendMinorUnits)}</Text>
            {data.limitMinorUnits !== null && left !== null && <View style={styles.jarBlock}>
              <View accessibilityRole="progressbar" accessibilityLabel={t("categories.lookJarA11y")}
                accessibilityValue={{ min: 0, max: 100, now: Math.round(remainingFill(data) * 100) }}
                style={[styles.jar, { backgroundColor: left < 0 ? `${theme.danger}33` : `${color}22` }, left >= 0 && faintEdge(color, mode)]}>
                <View style={[styles.jarFill, { width: `${remainingFill(data) * 100}%`, backgroundColor: color }, faintEdge(color, mode)]} />
              </View>
              <Text style={styles.jarHint}>{left < 0
                ? t("categories.lookOver", { limit: money(data.limitMinorUnits) })
                : t("categories.lookLeft", { amount: money(left) })}</Text>
            </View>}
          </View>
          <View style={styles.group}>
            {data.recent.length === 0 ? <View style={styles.row}>
              <Text style={styles.muted}>{t("categories.lookEmpty")}</Text>
            </View> : data.recent.map((item, index) => <View key={item.id}
              style={[styles.row, index < data.recent.length - 1 && styles.rowBorder]}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{item.description}</Text>
                <Text style={styles.muted}>{item.date}</Text>
              </View>
              <Text style={styles.rowValue}>−{money(item.minorUnits)}</Text>
            </View>)}
          </View>
          <PrimaryButton label={data.limitMinorUnits === null ? t("categories.lookSetLimit") : t("categories.lookChangeLimit")}
            trailingIcon="flag-outline" onPress={onSetLimit} />
          {onEdit && <SecondaryButton label={t("categories.lookEdit")} onPress={onEdit} />}
        </>}
    </Screen>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
  page: { gap: spacing.xl, paddingTop: spacing.md, paddingBottom: 132 },
  openAmount: { gap: spacing.sm, paddingVertical: spacing.md },
  lookChip: { alignSelf: "flex-start", minHeight: touchTarget, flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.lg, borderRadius: radius.full, borderWidth: 2 },
  emoji: { fontSize: 18 },
  chipText: { color: theme.foreground, fontSize: 14, fontFamily: font.semibold },
  muted: { color: theme.mutedForeground, fontSize: 14, lineHeight: 20, fontFamily: font.regular },
  hero: { letterSpacing: -1.2 },
  jarBlock: { gap: spacing.sm, paddingTop: spacing.sm },
  jar: { height: 22, borderRadius: radius.full, overflow: "hidden" },
  jarFill: { height: "100%", borderRadius: radius.full },
  jarHint: { color: theme.mutedForeground, fontSize: fontSize.label, lineHeight: 16, fontFamily: font.regular },
  group: { borderRadius: radius.lg, backgroundColor: theme.secondary, borderWidth: 1, borderColor: theme.border, overflow: "hidden" },
  row: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
  rowCopy: { flex: 1, gap: spacing.xs },
  rowTitle: { color: theme.foreground, fontSize: fontSize.body, fontFamily: font.semibold },
  rowValue: { maxWidth: "42%", color: theme.foreground, fontSize: 14, fontFamily: font.semibold, textAlign: "right" },
  });
}
