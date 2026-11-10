import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Theme } from "../../ui/tokens";
import { useReadableLayout } from "../../ui/themeContext";
import type { ReadableLayout } from "../../ui/layout";
import { Header, PrimaryButton, Screen, SecondaryButton, useUi, useTheme, useThemeMode } from "../../ui/core";
import { categoryOutline } from "../categories/appearance";
import { font, fontSize, radius, spacing } from "../../ui/tokens";
import { useT } from "../../i18n";
import { formatMoney } from "../money";
import { compactAmount, jarPresentation, monthInSentence, monthLabel, nextAction, type BudgetJar } from "./model";

export type BoardNotice = { kind: "saved" } | { kind: "removed"; name: string } | null;

export type BudgetBoardProps = {
  month: string;
  currency: string;
  jars: BudgetJar[];
  categoryColors: ReadonlyMap<string, string>;
  notice: BoardNotice;
  canAdd: boolean;
  onBack: () => void;
  onAdd: () => void;
  onEdit: (jar: BudgetJar) => void;
};

function boardStyles(theme: Theme, layout: ReadableLayout) {
  return StyleSheet.create({
    page: { gap: spacing.xl, paddingTop: spacing.md },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    jar: {
      width: layout.reflow ? "100%" : "48%", minHeight: 132, padding: spacing.md, borderRadius: radius.md,
      borderWidth: 2, overflow: "hidden", justifyContent: "flex-end", gap: spacing.xs,
    },
    fill: { position: "absolute", left: 0, right: 0, bottom: 0 },
    emoji: { fontSize: 28 },
    name: { fontSize: fontSize.body, fontFamily: font.semibold, color: theme.foreground },
    amount: { fontSize: fontSize.label, fontFamily: font.bold },
    tag: { fontSize: fontSize.label, fontFamily: font.semibold, color: theme.mutedForeground },
    pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  });
}

export function BudgetBoard(props: BudgetBoardProps) {
  const ui = useUi();
  const theme = useTheme();
  const layout = useReadableLayout();
  const styles = useMemo(() => boardStyles(theme, layout), [theme, layout]);
  const translator = useT();
  const { t, language } = translator;
  const action = nextAction(props.jars, props.month, translator);
  return (
    <Screen contentStyle={styles.page}>
      <Header title={t("budget.boardTitle")} eyebrow={monthLabel(props.month, "month", language).toLocaleUpperCase(translator.locale)} onBack={props.onBack} />
      <PrimaryButton label={action.label} onPress={() => action.kind === "edit" ? props.onEdit(action.jar) : props.onAdd()} />
      {props.notice && <Text accessibilityRole="alert" style={ui.body}>
        {props.notice.kind === "saved" ? t("budget.saved")
          : t("budget.removedNotice", { name: props.notice.name, month: monthInSentence(props.month, language) })}
      </Text>}
      <View style={styles.grid}>
        {props.jars.map((jar) => (
          <Jar key={jar.category.id} jar={jar} currency={props.currency}
            color={props.categoryColors.get(jar.category.id) ?? theme.primary} onPress={() => props.onEdit(jar)} />
        ))}
      </View>
      {props.jars.length > 0 && props.canAdd && <SecondaryButton label={t("budget.setAnother")} onPress={props.onAdd} />}
    </Screen>
  );
}

function Jar({ jar, currency, color, onPress }: { jar: BudgetJar; currency: string; color: string; onPress: () => void }) {
  const theme = useTheme();
  const mode = useThemeMode();
  const layout = useReadableLayout();
  const styles = useMemo(() => boardStyles(theme, layout), [theme, layout]);
  const { t, language } = useT();
  const { status, spendNothing, amount, fill } = jarPresentation(jar);
  const over = status === "over";
  const value = formatMoney({ currency, minorUnits: amount });
  const limit = formatMoney({ currency, minorUnits: jar.limitMinorUnits });
  const spent = formatMoney({ currency, minorUnits: jar.consumptionMinorUnits });
  const name = jar.category.name;
  const label = spendNothing ? t(over ? "budget.jarA11ySpendNothingOver" : "budget.jarA11ySpendNothing", { name, amount: value })
    : t(over ? "budget.jarA11yOver" : "budget.jarA11yLeft", { name, amount: value, limit, spent });
  return (
    <Pressable accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress} style={({ pressed }) => [styles.jar, {
        borderColor: over ? theme.danger : categoryOutline(color, mode),
        backgroundColor: over ? `${theme.danger}18` : theme.secondary,
      }, pressed && styles.pressed]}>
      {status === "left" && <View pointerEvents="none" style={[styles.fill, { height: `${fill * 100}%`, backgroundColor: `${color}66` }]} />}
      <Text style={styles.emoji}>{jar.category.emoji}</Text>
      <Text style={styles.name}>{name}</Text>
      {spendNothing && <Text style={styles.tag}>{t("budget.spendNothing")}</Text>}
      <Text style={[styles.amount, { color: over ? theme.danger : theme.foreground }]}>
        {status === "clear" ? t("budget.nothingSpent")
          : t(over ? "budget.jarOver" : "budget.jarLeft", { amount: compactAmount(amount, currency, language) })}
      </Text>
    </Pressable>
  );
}
