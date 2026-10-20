import { useMemo } from "react";
import type { Theme } from "../../ui/tokens";
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useEffect, useLayoutEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Header, PrimaryButton, SecondaryButton, useTheme, useUi } from "../../ui/core";
import { font, radius, spacing, touchTarget } from "../../ui/tokens";
import { formatMoney, minorUnitFactor, currencyDisplayPrefix } from "../money";
import { compactAmount, jarPresentation, monthLabel, type BudgetJar } from "./model";
import type { useBudgetEditor } from "./useBudgetEditor";

type BudgetLimitSheetProps = Pick<ReturnType<typeof useBudgetEditor>,
  "minorUnits" | "busy" | "pending" | "editable" | "canSubmit" | "canDismiss" | "error"
> & {
  month: string;
  currency: string;
  jar: BudgetJar;
  color: string;
  previousMonth: string;
  previousSpendMinorUnits: number | undefined;
  onLimit: (minorUnits: number) => void;
  onSave: () => void;
  onDismiss: () => void;
};

export function BudgetLimitSheet(props: BudgetLimitSheetProps) {
  const ui = useUi();
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const sheet = useRef<BottomSheetModal>(null);
  const active = useRef(false);
  useLayoutEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => { sheet.current?.present(); }, []);
  const { over, amount, fill } = jarPresentation({ ...props.jar, limitMinorUnits: props.minorUnits });
  const stepMinorUnits = 100_000 * minorUnitFactor(props.currency);
  const choices = [
    props.jar.limitMinorUnits,
    Math.round(props.jar.limitMinorUnits * 1.2),
    Math.round(props.jar.consumptionMinorUnits / stepMinorUnits) * stepMinorUnits + 2 * stepMinorUnits,
  ].filter((value, index, all) => value > 0 && all.indexOf(value) === index);
  const symbol = currencyDisplayPrefix(props.currency);
  const month = monthLabel(props.month, "month");
  const previousMonth = monthLabel(props.previousMonth, "month");
  return (
    <BottomSheetModal ref={sheet} snapPoints={["88%"]} enableDynamicSizing={false}
      enablePanDownToClose={props.canDismiss} enableContentPanningGesture={props.canDismiss}
      onDismiss={() => { if (active.current) props.onDismiss(); }}
      backgroundStyle={styles.background}
      backdropComponent={(backdrop) => <BottomSheetBackdrop {...backdrop} opacity={0.4}
        appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior={props.canDismiss ? "close" : "none"} />}>
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        <Header eyebrow={month.toUpperCase()} title={props.jar.category.name} titleStyle={styles.title} />
        <Text style={[styles.amount, over && { color: theme.danger }]}>{`${over ? "−" : ""}${symbol}${compactAmount(amount, props.currency)}`}</Text>
        <View accessible accessibilityRole="progressbar" accessibilityLabel={`Remaining in ${props.jar.category.name}`}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(fill * 100),
            text: `${formatMoney({ currency: props.currency, minorUnits: amount })} ${over ? "over" : "left"}` }}
          style={[styles.jar, { backgroundColor: over ? `${theme.danger}33` : `${props.color}22` }]}>
          <View style={[styles.fill, { width: `${fill * 100}%`, backgroundColor: props.color }]} />
        </View>
        <Text style={styles.meta}>Stay under this month</Text>
        <View style={styles.chips}>
          {choices.map((value) => (
            <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Limit ${symbol}${compactAmount(value, props.currency)}`}
              accessibilityState={{ selected: value === props.minorUnits, disabled: !props.editable }}
              disabled={!props.editable} onPress={() => props.onLimit(value)}
              style={[styles.chip, value === props.minorUnits && styles.selectedChip]}>
              <Text style={styles.chipText}>{symbol}{compactAmount(value, props.currency)}</Text>
            </Pressable>
          ))}
        </View>
        {props.minorUnits !== props.jar.limitMinorUnits && <Text style={styles.note}>
          {props.previousSpendMinorUnits === undefined ? `Loading ${previousMonth} spending.`
            : `${previousMonth} ${props.jar.category.name} spent ${symbol}${compactAmount(props.previousSpendMinorUnits, props.currency)}.`}
          {` Saving applies to ${month} and future months.`}
        </Text>}
        {!!props.error && <Text accessibilityRole="alert" style={ui.error}>{props.error}</Text>}
        <PrimaryButton label={props.busy ? "Saving…" : props.pending ? "Retry save" : `Save ${month}`}
          disabled={!props.canSubmit} onPress={props.onSave} />
        {props.canDismiss && <SecondaryButton label="Close" onPress={() => sheet.current?.dismiss()} />}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    background: { backgroundColor: theme.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
    content: { padding: spacing.xxl, paddingBottom: 48, gap: spacing.sm },
    title: { fontSize: 24, fontFamily: font.extrabold },
    amount: { color: theme.foreground, fontSize: 36, fontFamily: font.extrabold },
    jar: { height: 22, borderRadius: radius.full, overflow: "hidden" },
    fill: { height: "100%", borderRadius: radius.full },
    meta: { color: theme.mutedForeground, fontSize: 14, lineHeight: 20, fontFamily: font.regular },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: { maxWidth: "100%", paddingVertical: spacing.sm, minHeight: touchTarget, justifyContent: "center", paddingHorizontal: spacing.lg,
      borderRadius: radius.full, borderWidth: 1, borderColor: theme.border },
    selectedChip: { borderColor: theme.primary, borderWidth: 2 },
    chipText: { flexShrink: 1, color: theme.foreground, fontSize: 14, fontFamily: font.semibold },
    note: { color: theme.mutedForeground, fontSize: 13, lineHeight: 19, fontFamily: font.regular },
  });
}
