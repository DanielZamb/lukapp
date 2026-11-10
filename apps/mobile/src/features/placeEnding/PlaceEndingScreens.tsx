import { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { formatLongDate, useT } from "../../i18n";
import { Choice, Field, Header, ListGroup, ListRow, PrimaryButton, Screen, SecondaryButton, useTheme, useUi } from "../../ui/core";
import { useReadableLayout } from "../../ui/themeContext";
import { font, radius, spacing, touchTarget } from "../../ui/tokens";
import { AmountField } from "../amount/AmountField";
import type { AmountSession } from "../amount/session";
import { formatMoney } from "../money";
import {
  answerSpec, answersFor, blockerView, lineMinorUnits, remainingMinorUnits, signedMoney, situationCopy,
  type Act, type Answer, type BalanceCase, type Blocker, type Closure, type CloseReceipt, type LineDraft, type UndoTotals,
} from "./model";

type Money = Closure["balance"];
const money = (value: Money) => formatMoney(value, { hideZeroDecimals: true });

function useStyles() {
  const theme = useTheme();
  const ui = useUi();
  const layout = useReadableLayout();
  return useMemo(() => StyleSheet.create({
    card: { gap: spacing.sm, padding: spacing.lg, borderWidth: 1, borderColor: theme.border, borderRadius: radius.lg, backgroundColor: theme.secondary },
    warningCard: { gap: spacing.sm, padding: spacing.lg, borderWidth: 1, borderColor: theme.danger, borderRadius: radius.lg },
    strong: { ...ui.body, fontFamily: font.semibold },
    warning: { ...ui.body, color: theme.danger },
    option: { minHeight: touchTarget, flexDirection: layout.reflow ? "column" : "row", alignItems: layout.reflow ? "flex-start" : "center",
      gap: spacing.sm, paddingVertical: spacing.sm },
    footer: { gap: spacing.sm, paddingHorizontal: layout.pagePadding, paddingVertical: spacing.md,
      borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.background },
    remaining: { ...ui.body, fontFamily: font.semibold },
  }), [theme, ui, layout]);
}

export function LoadingScreen({ onBack }: { onBack?: () => void }) {
  const { t } = useT();
  return <Screen><Header title="" onBack={onBack} /><ActivityIndicator accessibilityLabel={t("placeEnding.loading")} /></Screen>;
}

export function EndedScreen({ title, detail, onBack }: { title: string; detail: string; onBack: () => void }) {
  const ui = useUi();
  const { t } = useT();
  return <Screen>
    <Header title={title} eyebrow={t("placeEnding.eyebrow")} onBack={onBack} />
    <Text style={ui.body}>{detail}</Text>
  </Screen>;
}

export function ChooseScreen({ name, onBack, onClose, onUndo }: {
  name: string; onBack: () => void; onClose: () => void; onUndo: () => void;
}) {
  const ui = useUi();
  const styles = useStyles();
  const { t } = useT();
  return <Screen>
    <Header title={t("placeEnding.chooseTitle", { name })} eyebrow={t("placeEnding.eyebrow")} onBack={onBack} />
    <Text style={ui.body}>{t("placeEnding.chooseIntro")}</Text>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={ui.title}>{t("placeEnding.closeTitle")}</Text>
      <Text style={ui.body}>{t("placeEnding.closeDetail")}</Text>
      <PrimaryButton label={t("placeEnding.closeChoose", { name })} onPress={onClose} />
    </View>
    <View style={styles.warningCard}>
      <Text accessibilityRole="header" style={ui.title}>{t("placeEnding.undoTitle")}</Text>
      <Text style={ui.body}>{t("placeEnding.undoDetail")}</Text>
      <Text style={styles.warning}>{t("placeEnding.undoWarning")}</Text>
      <SecondaryButton tone="danger" label={t("placeEnding.undoChoose", { name })} onPress={onUndo} />
    </View>
  </Screen>;
}

export function BlockersScreen({ act, name, blockers, onBack, onSources, onCloseInstead }: {
  act: Act; name: string; blockers: Blocker[]; onBack: () => void; onSources: () => void; onCloseInstead: () => void;
}) {
  const ui = useUi();
  const styles = useStyles();
  const translator = useT();
  const { t } = translator;
  const views = blockers.map((blocker) => blockerView(blocker, act, translator));
  return <Screen>
    <Header title={t(act === "close" ? "placeEnding.blockedCloseTitle" : "placeEnding.blockedUndoTitle", { name })}
      eyebrow={t("placeEnding.eyebrow")} onBack={onBack} />
    {views.map((view, index) => <View key={`${blockers[index]!.code}-${index}`} style={styles.card}>
      <Text accessibilityRole="header" style={styles.strong}>{view.title}</Text>
      <Text style={ui.body}>{view.detail}</Text>
      {view.action === "sources" && <SecondaryButton label={t("placeEnding.blockSourcesAction")} onPress={onSources} />}
    </View>)}
    {act === "undo" && views.some((view) => view.action === "close") &&
      <PrimaryButton label={t("placeEnding.closeInstead")} onPress={onCloseInstead} />}
    <SecondaryButton label={t("placeEnding.blockersBack")} onPress={onBack} />
  </Screen>;
}

export function DefaultScreen({ act, name, places, selected, onSelect, onContinue, onBack }: {
  act: Act; name: string; places: { id: string; name: string }[]; selected: string | null;
  onSelect: (id: string) => void; onContinue?: () => void; onBack: () => void;
}) {
  const ui = useUi();
  const { t } = useT();
  return <Screen>
    <Header title={t("placeEnding.defaultTitle")} eyebrow={t("placeEnding.eyebrow")} onBack={onBack} />
    <Text style={ui.body}>{t(act === "close" ? "placeEnding.defaultDetailClose" : "placeEnding.defaultDetailUndo", { name })}</Text>
    <View style={ui.section}>
      {places.map((place) => <Choice key={place.id} label={place.name} selected={place.id === selected} onPress={() => onSelect(place.id)} />)}
    </View>
    <PrimaryButton label={t("placeEnding.continue")} disabled={!onContinue} onPress={() => onContinue?.()} />
  </Screen>;
}

export type PickOption = { id: string; label: string; emoji?: string };

export function PickScreen({ kind, answer, options, selected, onSelect, onBack }: {
  kind: "place" | "category"; answer: Answer; options: PickOption[] | undefined; selected: string | null;
  onSelect: (id: string) => void; onBack: () => void;
}) {
  const ui = useUi();
  const { t } = useT();
  const pick = answerSpec(answer).pick;
  return <Screen>
    <Header title={pick ? t(pick) : ""} eyebrow={t("placeEnding.eyebrow")} onBack={onBack} />
    {!options ? <ActivityIndicator accessibilityLabel={t("placeEnding.loading")} />
      : options.length === 0 ? <Text style={ui.body}>{t(kind === "place" ? "placeEnding.pickNoPlaces" : "placeEnding.pickNoCategories")}</Text>
      : <View style={ui.section}>
        {options.map((option) => <Choice key={option.id} label={[option.emoji, option.label].filter(Boolean).join(" ")}
          selected={option.id === selected} onPress={() => onSelect(option.id)} />)}
      </View>}
  </Screen>;
}

export function LinesScreen({ name, situation, balance, lines, adding, editable, targetName, onAnswer, onAdd, onCancelAdd, onPick,
  onAmount, onRemove, onContinue, onBack }: {
  name: string; situation: BalanceCase; balance: Money; lines: LineDraft[]; adding: boolean; editable: boolean;
  targetName: (line: LineDraft) => string | null;
  onAnswer: (answer: Answer) => void; onAdd: () => void; onCancelAdd: () => void; onPick: (lineId: string) => void;
  onAmount: (lineId: string, amount: AmountSession) => void; onRemove: (lineId: string) => void;
  onContinue: () => void; onBack: () => void;
}) {
  const ui = useUi();
  const styles = useStyles();
  const { t } = useT();
  if (situation === "zero") return null;
  const copy = situationCopy[situation];
  const remaining = remainingMinorUnits(balance, lines);
  const ready = lines.length > 0 && remaining === 0 && lines.every((line) => lineMinorUnits(line) !== null
    && (answerSpec(line.answer).kind === "adjustment" || line.target !== null));
  const magnitude = { currency: balance.currency, minorUnits: Math.abs(balance.minorUnits) };
  const footer = <View style={styles.footer}>
    <Text accessibilityRole="summary" accessibilityLiveRegion="polite" style={styles.remaining}>
      {remaining < 0 ? t("placeEnding.remainingOver", { amount: money({ currency: balance.currency, minorUnits: -remaining }) })
        : t("placeEnding.remaining", { amount: money({ currency: balance.currency, minorUnits: remaining }) })}
    </Text>
    <PrimaryButton label={t("placeEnding.review")} disabled={!ready} onPress={onContinue} />
  </View>;
  return <Screen footer={footer}>
    <Header title={t(copy.title)} eyebrow={t("placeEnding.eyebrow")} onBack={onBack} />
    <Text style={ui.body}>{t(copy.intro, { name, amount: money(magnitude) })}</Text>
    {lines.map((line) => {
      const spec = answerSpec(line.answer);
      const label = t(spec.label);
      return <View key={line.id} style={styles.card}>
        <Text style={styles.strong}>{label}</Text>
        {spec.kind !== "adjustment" && <ListGroup>
          <ListRow title={t(spec.kind === "transfer" ? "placeEnding.linePlace" : "placeEnding.lineCategory")}
            value={targetName(line) ?? t("placeEnding.lineChoose")} onPress={editable ? () => onPick(line.id) : undefined} />
        </ListGroup>}
        <AmountField label={t("placeEnding.lineAmount")} inputAccessibilityLabel={t("placeEnding.lineAmountA11y", { answer: label })}
          session={line.amount} editable={editable} onChange={(amount) => onAmount(line.id, amount)}
          message={{ error: line.amount.editor.kind === "complete" && line.amount.review === null && lineMinorUnits(line) === null
            ? t("placeEnding.lineAmountPositive") : undefined }} />
        <SecondaryButton label={t("placeEnding.removeLine")} accessibilityLabel={t("placeEnding.removeLineA11y", { answer: label })}
          disabled={!editable} onPress={() => onRemove(line.id)} />
      </View>;
    })}
    {adding ? <View style={ui.section}>
      {lines.length > 0 && <Text style={styles.strong}>{t("placeEnding.addTitle")}</Text>}
      {answersFor[situation].map((answer) => {
        const spec = answerSpec(answer);
        return <Pressable key={answer} accessibilityRole="button" accessibilityLabel={t(spec.label)} disabled={!editable}
          onPress={() => onAnswer(answer)} style={styles.card}>
          <Text style={styles.strong}>{t(spec.label)}</Text>
          <Text style={ui.muted}>{t(spec.detail)}</Text>
        </Pressable>;
      })}
      {lines.length > 0 && <SecondaryButton label={t("placeEnding.addCancel")} onPress={onCancelAdd} />}
    </View> : <SecondaryButton label={t("placeEnding.addLine")} disabled={!editable} onPress={onAdd} />}
  </Screen>;
}

function useLineLabel() {
  const { t } = useT();
  return (line: LineDraft, target: string | null) => t(answerSpec(line.answer).review, { target: target ?? "" });
}

export function ReviewScreen({ name, balance, lines, targetName, accountingDate, replacementName, busy, uncertain, error,
  onBack, onConfirm }: {
  name: string; balance: Money; lines: LineDraft[]; targetName: (line: LineDraft) => string | null; accountingDate: string;
  replacementName: string | null; busy: boolean; uncertain: boolean; error: string;
  onBack?: () => void; onConfirm: () => void;
}) {
  const ui = useUi();
  const styles = useStyles();
  const { t, language } = useT();
  const lineLabel = useLineLabel();
  const date = formatLongDate(language, Date.parse(`${accountingDate}T12:00:00Z`), "UTC");
  return <Screen>
    <Header title={t("placeEnding.reviewTitle", { name })} eyebrow={t("placeEnding.eyebrow")} onBack={onBack} />
    {lines.length === 0 ? <Text style={ui.body}>{t("placeEnding.reviewZero", { name, amount: money(balance) })}</Text> : <>
      <Text style={ui.body}>{t("placeEnding.reviewDated", { date })}</Text>
      <ListGroup>
        {lines.map((line) => <ListRow key={line.id} title={lineLabel(line, targetName(line))}
          value={money({ currency: balance.currency, minorUnits: lineMinorUnits(line) ?? 0 })} />)}
      </ListGroup>
    </>}
    {replacementName && <Text style={ui.body}>{t("placeEnding.reviewDefault", { place: replacementName })}</Text>}
    <Text style={styles.strong}>{t("placeEnding.reviewForGood", { name })}</Text>
    {busy && <ActivityIndicator accessibilityLabel={t("placeEnding.closing")} />}
    {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
    <PrimaryButton label={uncertain ? t("placeEnding.closeRetry") : t("placeEnding.closeConfirm", { name })}
      trailingIcon={uncertain ? "refresh" : "checkmark"} pending={busy} onPress={onConfirm} />
  </Screen>;
}

export function ReceiptScreen({ name, receipt, onDone }: { name: string; receipt: CloseReceipt; onDone: () => void }) {
  const ui = useUi();
  const { t } = useT();
  const { entries } = receipt.ending;
  return <Screen>
    <Header title={t("placeEnding.receiptTitle", { name })} eyebrow={t("placeEnding.eyebrow")} />
    {entries.length === 0 ? <Text style={ui.body}>{t("placeEnding.receiptNothing")}</Text> : <>
      <Text style={ui.body}>{t("placeEnding.receiptRecorded")}</Text>
      <ListGroup>
        {entries.map((entry) => <ListRow key={entry.id} title={entry.description} detail={entry.accountingDate} value={money(entry.amount)} />)}
      </ListGroup>
    </>}
    <Text style={ui.muted}>{t("placeEnding.receiptWhere")}</Text>
    <PrimaryButton label={t("placeEnding.receiptDone")} trailingIcon="checkmark" onPress={onDone} />
  </Screen>;
}

export function UndoConfirmScreen({ name, balance, totals, settled, failed, replacementName, typed, editable, onTyped, onRetryPreview,
  busy, uncertain, error, canConfirm, onConfirm, onBack }: {
  name: string; balance: Money; totals: UndoTotals | null; settled: boolean; failed: boolean; replacementName: string | null;
  typed: string; editable: boolean; onTyped: (value: string) => void; onRetryPreview: () => void;
  busy: boolean; uncertain: boolean; error: string; canConfirm: boolean; onConfirm: () => void; onBack?: () => void;
}) {
  const ui = useUi();
  const styles = useStyles();
  const { t, tn } = useT();
  const exact = !!totals?.complete;
  const counted = (count: number) => exact ? undefined : { count: t("placeEnding.atLeast", { count }) };
  return <Screen>
    <Header title={t("placeEnding.undoConfirmTitle", { name })} eyebrow={t("placeEnding.eyebrow")} onBack={onBack} />
    <Text style={styles.warning}>{t("placeEnding.undoWarning")}</Text>
    {!totals ? <ActivityIndicator accessibilityLabel={t("placeEnding.undoLoading")} /> : <View style={styles.card}>
      <Text style={styles.strong}>{tn("placeEnding.undoEntries", totals.entries, counted(totals.entries))}</Text>
      {totals.lockedMonthEntries > 0 && <Text style={ui.body}>{tn("placeEnding.undoLocked", totals.lockedMonthEntries, counted(totals.lockedMonthEntries))}</Text>}
      {totals.otherPlaces.length > 0 ? <>
        <Text style={ui.body}>{t("placeEnding.undoOthersTitle")}</Text>
        <ListGroup>
          {totals.otherPlaces.map((place) => <ListRow key={place.id} title={place.name} value={signedMoney(place.change)} />)}
        </ListGroup>
      </> : exact ? <Text style={ui.body}>{t("placeEnding.undoNoOthers")}</Text> : null}
      {!exact && totals.otherPlaces.length > 0 && <Text style={ui.muted}>{t("placeEnding.undoOthersPartial")}</Text>}
      {(totals.expenseChange.minorUnits !== 0 || totals.incomeChange.minorUnits !== 0) &&
        <Text style={ui.body}>{t("placeEnding.undoMonth", { expense: signedMoney(totals.expenseChange), income: signedMoney(totals.incomeChange) })}</Text>}
      {totals.expenseChange.minorUnits < 0 && <Text style={ui.body}>{t("placeEnding.undoBudget")}</Text>}
      {!settled && !failed && <Text style={ui.muted}>{t("placeEnding.undoLoading")}</Text>}
    </View>}
    {failed && <>
      <Text accessibilityRole="alert" style={ui.error}>{t("placeEnding.undoPreviewFailed")}</Text>
      <SecondaryButton label={t("placeEnding.undoPreviewRetry")} onPress={onRetryPreview} />
    </>}
    <Text style={ui.body}>{t("placeEnding.undoZero", { name, amount: money({ currency: balance.currency, minorUnits: 0 }) })}</Text>
    {replacementName && <Text style={ui.body}>{t("placeEnding.reviewDefault", { place: replacementName })}</Text>}
    <Text style={ui.muted}>{t("placeEnding.undoAfter", { name })}</Text>
    <Field label={t("placeEnding.undoTypeLabel", { name })} accessibilityLabel={t("placeEnding.undoTypeA11y")} value={typed}
      editable={editable} onChangeText={onTyped} autoCapitalize="none" autoCorrect={false} />
    {busy && <ActivityIndicator accessibilityLabel={t("placeEnding.undoStarting")} />}
    {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
    <PrimaryButton label={uncertain ? t("placeEnding.undoRetry") : t("placeEnding.undoConfirm", { name })}
      trailingIcon={uncertain ? "refresh" : "arrow-undo"} pending={busy} disabled={!canConfirm} onPress={onConfirm} />
  </Screen>;
}
