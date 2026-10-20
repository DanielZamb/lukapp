import { useMemo } from "react";
import type { Theme } from "../../ui/tokens";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Header, PrimaryButton, Screen, useTheme, useUi } from "../../ui/core";
import { font, fontSize, radius, spacing, touchTarget } from "../../ui/tokens";
import { formatMoney, parseMoney } from "../money";
import { jarPresentation, type BudgetCategory } from "./model";
import type { useBudgetEditor } from "./useBudgetEditor";

type Props = Pick<ReturnType<typeof useBudgetEditor>,
  "amount" | "editable" | "busy" | "pending" | "canSubmit" | "canDismiss" | "error" | "onAmount"> & {
  category: BudgetCategory;
  currency: string;
  spentMinorUnits: number;
  color: string;
  onSave: () => void;
  onBack: () => void;
};

export function limitSuggestions(spentMinorUnits: number) {
  const step = 20_000_000;
  const around = Math.max(step, Math.round(spentMinorUnits / step) * step);
  return [around - step, around, around + step, around + step * 2].filter((value) => value > 0);
}

export function BudgetComposer(props: Props) {
  const theme = useTheme();
  const ui = useUi();
  const styles = useMemo(() => createStyles(theme), [theme]);
  let limit = 0;
  try { limit = parseMoney(props.amount); } catch { /* Incomplete input stays editable. */ }
  const { over, fill } = jarPresentation({ category: props.category, limitMinorUnits: limit, consumptionMinorUnits: props.spentMinorUnits });
  const money = (minorUnits: number) => formatMoney({ currency: props.currency, minorUnits }, { hideZeroDecimals: true });
  return (
    <Screen contentStyle={styles.page}>
      <Header eyebrow="BUDGET" title={`Limit for ${props.category.name}`} onBack={props.canDismiss ? props.onBack : undefined} />
      <View style={[styles.spentChip, { backgroundColor: `${props.color}24`, borderColor: props.color }]}>
        <Text style={styles.emoji}>{props.category.emoji}</Text>
        <Text style={styles.chipText}>{money(props.spentMinorUnits)} out this month</Text>
      </View>
      <View style={styles.board}>
        <Text style={styles.label}>Stay under</Text>
        <TextInput accessibilityLabel="Monthly limit" keyboardType="decimal-pad" placeholder="0"
          placeholderTextColor={theme.mutedForeground} value={props.amount} onChangeText={props.onAmount}
          editable={props.editable} style={styles.amount} />
        <View accessibilityRole="progressbar" accessibilityLabel="Remaining jar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(fill * 100), text: `${money(limit - props.spentMinorUnits)} remaining` }}
          style={[styles.jar, { backgroundColor: over ? `${theme.danger}33` : `${props.color}22` }]}>
          <View style={{ height: "100%", width: `${fill * 100}%`, backgroundColor: props.color, borderRadius: radius.full }} />
        </View>
        <Text style={styles.hint}>{over ? "This jar is already empty." : "What is still in the jar. Spent eats it."}</Text>
      </View>
      <View style={styles.suggestions}>
        {limitSuggestions(props.spentMinorUnits).map((value) => (
          <Pressable key={value} accessibilityRole="button" accessibilityLabel={money(value)}
            accessibilityState={{ selected: limit === value, disabled: !props.editable }} disabled={!props.editable}
            onPress={() => props.onAmount(new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value / 100))}
            style={[styles.chip, limit === value && styles.selected]}>
            <Text style={styles.chipText}>{money(value)}</Text>
          </Pressable>
        ))}
      </View>
      {!!props.error && <Text accessibilityRole="alert" style={ui.error}>{props.error}</Text>}
      <PrimaryButton label={props.busy ? "Saving…" : props.pending ? "Retry save" : "Save this limit"}
        trailingIcon="checkmark" disabled={!props.canSubmit} pending={props.busy} onPress={props.onSave} />
    </Screen>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    page: { gap: spacing.xl, paddingTop: spacing.md },
    board: { gap: spacing.md },
    label: { color: theme.foreground, fontSize: 14, fontFamily: font.semibold },
    amount: {
      minHeight: 88, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1,
      borderColor: theme.ring, color: theme.foreground, backgroundColor: theme.secondary,
      fontSize: fontSize.hero, fontFamily: font.extrabold, letterSpacing: -1.2,
    },
    jar: { height: 22, borderRadius: radius.full, overflow: "hidden" },
    hint: { color: theme.mutedForeground, fontSize: fontSize.label, lineHeight: 16, fontFamily: font.regular },
    suggestions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: {
      maxWidth: "100%", paddingVertical: spacing.sm,
      minHeight: touchTarget, justifyContent: "center", paddingHorizontal: spacing.lg,
      borderRadius: radius.full, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.secondary,
    },
    selected: { borderColor: theme.primary, borderWidth: 2 },
    chipText: { flexShrink: 1, color: theme.foreground, fontSize: 14, fontFamily: font.semibold },
    spentChip: {
      alignSelf: "flex-start", minHeight: touchTarget, flexDirection: "row", alignItems: "center",
      gap: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.full, borderWidth: 2,
    },
    emoji: { fontSize: 18 },
  });
}
