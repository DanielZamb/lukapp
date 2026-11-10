import { useMemo, useState } from "react";
import type { Theme } from "../../ui/tokens";
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { useEffect, useLayoutEffect, useRef } from "react";
import { BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import { useT, type MessageKey } from "../../i18n";
import { Header, PrimaryButton, SecondaryButton, useTheme, useThemeMode, useUi } from "../../ui/core";
import { faintEdge } from "../categories/appearance";
import { font, fontSize, radius, spacing, touchTarget } from "../../ui/tokens";
import { formatMoney, minorUnitFactor, currencyDisplayPrefix } from "../money";
import { AmountField } from "../amount/AmountField";
import { amountRefusal } from "../amount/hints";
import type { AmountSession } from "../amount/session";
import { compactAmount, jarPresentation, monthInSentence, monthLabel, type BudgetJar } from "./model";
import type { AmountIssue, useBudgetEditor } from "./useBudgetEditor";

const issueMessage: Record<Exclude<AmountIssue, "zero" | "invalid">, MessageKey> = {
  empty: "lifecycle.limitEmpty",
  notPositive: "lifecycle.limitNotPositive",
  unchanged: "lifecycle.limitUnchanged",
};

type Layer = "spendNothing" | "remove";

type BudgetLimitSheetProps = Pick<ReturnType<typeof useBudgetEditor>,
  "amount" | "amountIssue" | "minorUnits" | "busy" | "pending" | "pendingAct" | "editable" | "canSubmit" | "canSend"
  | "canDismiss" | "error"
> & {
  month: string;
  currency: string;
  jar: BudgetJar;
  color: string;
  previousMonth: string;
  previousSpendMinorUnits: number | undefined;
  onLimit: (minorUnits: number) => void;
  onAmount: (amount: AmountSession) => void;
  onResetAmount: () => void;
  onSave: () => void;
  onSpendNothing: () => void;
  onRemove: () => void;
  onDismiss: () => void;
};

export function BudgetLimitSheet(props: BudgetLimitSheetProps) {
  const ui = useUi();
  const theme = useTheme();
  const mode = useThemeMode();
  const { t, language, locale } = useT();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const sheet = useRef<BottomSheetModal>(null);
  const active = useRef(false);
  const [chosenLayer, setLayer] = useState<Layer | null>(null);
  const layer = props.pendingAct === "spendNothing" || props.pendingAct === "remove" ? props.pendingAct : chosenLayer;
  const issue = props.editable ? props.amountIssue : null;
  const zeroChoice = !layer && issue === "zero";
  const back = useRef(() => {});
  back.current = () => {
    if (!props.canDismiss) return;
    if (layer) setLayer(null);
    else if (zeroChoice) props.onResetAmount();
    else sheet.current?.dismiss();
  };
  useLayoutEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => { sheet.current?.present(); }, []);
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      back.current();
      return true;
    });
    return () => subscription.remove();
  }, []);
  const name = props.jar.category.name;
  const spendNothingJar = props.jar.limitMinorUnits === 0;
  const preview = jarPresentation({ ...props.jar,
    limitMinorUnits: issue === null || issue === "unchanged" ? props.minorUnits : props.jar.limitMinorUnits });
  const stepMinorUnits = 100_000 * minorUnitFactor(props.currency);
  const spendingChoice = Math.round(props.jar.consumptionMinorUnits / stepMinorUnits) * stepMinorUnits + 2 * stepMinorUnits;
  const choices = (spendNothingJar ? [spendingChoice]
    : [props.jar.limitMinorUnits, Math.round(props.jar.limitMinorUnits * 1.2), spendingChoice])
    .filter((value, index, all) => value > 0 && all.indexOf(value) === index);
  const symbol = currencyDisplayPrefix(props.currency);
  const month = monthInSentence(props.month, language);
  const previousMonth = monthInSentence(props.previousMonth, language);
  const compact = (minorUnits: number) => `${symbol}${compactAmount(minorUnits, props.currency, language)}`;
  const fieldMessage = issue === null || issue === "zero" ? null
    : issue === "unchanged" ? { helper: t(issueMessage.unchanged) }
    : issue === "empty" && spendNothingJar ? { helper: t("budget.spendNothingCurrent", { name }) }
    : issue === "invalid" ? { error: amountRefusal(props.amount, t) }
    : { error: t(issueMessage[issue]) };
  const status = preview.status === "over" ? t("budget.jarOver", { amount: formatMoney({ currency: props.currency, minorUnits: preview.amount }) })
    : preview.status === "clear" ? t("budget.nothingSpent")
    : t("budget.jarLeft", { amount: formatMoney({ currency: props.currency, minorUnits: preview.amount }) });
  const error = !!props.error && <Text accessibilityRole="alert" style={ui.error}>{props.error}</Text>;
  const header = <Header eyebrow={monthLabel(props.month, "month", language).toLocaleUpperCase(locale)}
    title={layer === "spendNothing" ? t("budget.spendNothingTitle", { name })
      : layer === "remove" ? t("budget.removeTitle", { name }) : name}
    titleStyle={styles.title} />;
  const cancelLayer = props.canDismiss && <SecondaryButton label={t("common.cancel")} onPress={() => setLayer(null)} />;
  return (
    <BottomSheetModal ref={sheet} snapPoints={["88%"]} enableDynamicSizing={false}
      enablePanDownToClose={props.canDismiss} enableContentPanningGesture={props.canDismiss}
      onDismiss={() => { if (active.current) props.onDismiss(); }}
      backgroundStyle={styles.background}
      backdropComponent={(backdrop) => <BottomSheetBackdrop {...backdrop} opacity={0.4}
        appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior={props.canDismiss ? "close" : "none"} />}>
      <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        {header}
        {layer === "spendNothing" ? <>
          <Text style={ui.body}>{t("budget.spendNothingEffect", { name })}</Text>
          {error}
          <PrimaryButton label={props.busy ? t("budget.saving") : props.pending ? t("budget.retry") : t("budget.spendNothingConfirm")}
            disabled={!props.canSend("spendNothing")} onPress={props.onSpendNothing} />
          {cancelLayer}
        </> : layer === "remove" ? <>
          <Text style={ui.body}>{t("budget.removeEffect", { month })}</Text>
          {error}
          <PrimaryButton label={props.busy ? t("budget.removing") : props.pending ? t("budget.retry") : t("budget.removeLimit")}
            disabled={!props.canSend("remove")} onPress={props.onRemove} />
          {cancelLayer}
        </> : <>
          {preview.spendNothing && <Text style={styles.label}>{t("budget.spendNothing")}</Text>}
          <Text style={[styles.amount, preview.status === "over" && { color: theme.danger }]}>
            {preview.status === "over" ? `−${compact(preview.amount)}` : preview.status === "clear" ? t("budget.nothingSpent") : compact(preview.amount)}
          </Text>
          <View accessible accessibilityRole="progressbar" accessibilityLabel={t("budget.sheetJarA11y", { name })}
            accessibilityValue={{ min: 0, max: 100, now: Math.round(preview.fill * 100), text: status }}
            style={[styles.jar, { backgroundColor: preview.status === "over" ? `${theme.danger}33` : `${props.color}22` },
              preview.status !== "over" && faintEdge(props.color, mode)]}>
            <View style={[styles.fill, { width: `${preview.fill * 100}%`, backgroundColor: props.color }, faintEdge(props.color, mode)]} />
          </View>
          <Text style={styles.meta}>{t("budget.stayUnderThisMonth")}</Text>
          <AmountField label={t("lifecycle.limitLabel")} InputComponent={BottomSheetTextInput}
            inputAccessibilityLabel={t("lifecycle.limitInputA11y", { currency: props.currency })}
            placeholder="0" session={props.amount} editable={props.editable} onChange={props.onAmount}
            message={fieldMessage ?? undefined} inputStyle={styles.input} />
          {zeroChoice ? <View style={styles.panel}>
            <Text style={styles.panelTitle}>{t("budget.zeroTitle")}</Text>
            <Text style={styles.meta}>{spendNothingJar ? t("budget.zeroAlreadySpendNothing", { name }) : t("budget.zeroBody")}</Text>
            {!spendNothingJar && <Option label={t("budget.spendNothingOption")} effect={t("budget.spendNothingEffect", { name })}
              styles={styles} onPress={() => setLayer("spendNothing")} />}
            <Option label={t("budget.removeLimit")} effect={t("budget.removeEffect", { month })}
              styles={styles} onPress={() => setLayer("remove")} />
          </View> : <>
            <Text style={styles.meta}>{t("lifecycle.limitShortcuts")}</Text>
            <View style={styles.chips}>
              {choices.map((value) => (
                <Pressable key={value} accessibilityRole="button" accessibilityLabel={t("budget.shortcutA11y", { amount: compact(value) })}
                  accessibilityState={{ selected: value === props.minorUnits, disabled: !props.editable }}
                  disabled={!props.editable} onPress={() => props.onLimit(value)}
                  style={[styles.chip, value === props.minorUnits && styles.selectedChip]}>
                  <Text style={styles.chipText}>{compact(value)}</Text>
                </Pressable>
              ))}
              {!spendNothingJar && <Pressable accessibilityRole="button" accessibilityLabel={t("budget.spendNothing")}
                accessibilityState={{ disabled: !props.editable }} disabled={!props.editable}
                onPress={() => setLayer("spendNothing")} style={styles.chip}>
                <Text style={styles.chipText}>{t("budget.spendNothing")}</Text>
              </Pressable>}
            </View>
          </>}
          {!issue && props.minorUnits !== props.jar.limitMinorUnits && <Text style={styles.note}>
            {props.previousSpendMinorUnits === undefined ? t("budget.noteLoading", { previousMonth, month })
              : t("budget.notePrevious", { previousMonth, month, name, amount: compact(props.previousSpendMinorUnits) })}
          </Text>}
          {error}
          <PrimaryButton label={props.busy ? t("budget.saving") : props.pending ? t("budget.retrySave") : t("budget.saveMonth", { month })}
            disabled={!props.canSubmit} onPress={props.onSave} />
          {props.canDismiss && <SecondaryButton label={t("common.close")} onPress={() => sheet.current?.dismiss()} />}
          {props.editable && !zeroChoice && <Pressable accessibilityRole="button" accessibilityLabel={t("budget.removeLimit")}
            onPress={() => setLayer("remove")} style={styles.quiet}>
            <Text style={styles.quietText}>{t("budget.removeLimit")}</Text>
          </Pressable>}
        </>}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

function Option({ label, effect, styles, onPress }: {
  label: string; effect: string; styles: ReturnType<typeof createStyles>; onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={effect} onPress={onPress}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
      <Text style={styles.chipText}>{label}</Text>
      <Text style={styles.note}>{effect}</Text>
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    background: { backgroundColor: theme.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl },
    content: { padding: spacing.xxl, paddingBottom: 48, gap: spacing.sm },
    title: { fontSize: 24, fontFamily: font.extrabold },
    label: { color: theme.mutedForeground, fontSize: fontSize.label, fontFamily: font.semibold },
    amount: { color: theme.foreground, fontSize: 36, fontFamily: font.extrabold },
    jar: { height: 22, borderRadius: radius.full, overflow: "hidden" },
    fill: { height: "100%", borderRadius: radius.full },
    meta: { color: theme.mutedForeground, fontSize: 14, lineHeight: 20, fontFamily: font.regular },
    input: { fontSize: fontSize.title, fontFamily: font.bold },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: { maxWidth: "100%", paddingVertical: spacing.sm, minHeight: touchTarget, justifyContent: "center", paddingHorizontal: spacing.lg,
      borderRadius: radius.full, borderWidth: 1, borderColor: theme.border },
    selectedChip: { borderColor: theme.primary, borderWidth: 2 },
    chipText: { flexShrink: 1, color: theme.foreground, fontSize: 14, fontFamily: font.semibold },
    note: { color: theme.mutedForeground, fontSize: 13, lineHeight: 19, fontFamily: font.regular },
    panel: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: theme.border },
    panelTitle: { color: theme.foreground, fontSize: fontSize.body, fontFamily: font.bold },
    option: { minHeight: touchTarget, gap: spacing.xs, padding: spacing.md, borderRadius: radius.md,
      borderWidth: 1, borderColor: theme.border, backgroundColor: theme.secondary },
    pressed: { opacity: 0.72 },
    quiet: { minHeight: touchTarget, alignSelf: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
    quietText: { color: theme.mutedForeground, fontSize: 14, fontFamily: font.semibold, textDecorationLine: "underline" },
  });
}
