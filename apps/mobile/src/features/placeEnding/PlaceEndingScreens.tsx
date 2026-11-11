import { useQuery } from "convex/react";
import { useMemo } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { formatLongDate, useT } from "../../i18n";
import { Choice, Field, Header, ListGroup, ListRow, PrimaryButton, Screen, SecondaryButton, useTheme, useUi } from "../../ui/core";
import { useReadableLayout } from "../../ui/themeContext";
import { font, radius, spacing } from "../../ui/tokens";
import { AmountField } from "../amount/AmountField";
import type { AmountSession } from "../amount/session";
import { api } from "../api";
import { formatMoney } from "../money";
import type { UnresolvedEnding } from "./unresolved";
import {
  answerSpec, answersFor, balanceCase, blockerView, closingLineReview, lineMinorUnits, placeChoice, remainingMinorUnits, signedMoney, situationCopy,
  type Act, type Answer, type BalanceCase, type Blocker, type ChoiceView, type Closure, type CloseReceipt, type LineDraft, type PlaceProfile,
  type UndoSnapshot,
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
    footer: { gap: spacing.sm, paddingHorizontal: layout.pagePadding, paddingVertical: spacing.md,
      borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.background },
    remaining: { ...ui.body, fontFamily: font.semibold },
  }), [theme, ui, layout]);
}

/** What changed under the person's answers, stated before anything else on the step they were returned to. */
function Notice({ lines }: { lines: string[] }) {
  const styles = useStyles();
  if (!lines.length) return null;
  return <View accessibilityLiveRegion="polite" style={styles.warningCard}>
    {lines.map((line) => <Text key={line} accessibilityRole="alert" style={styles.strong}>{line}</Text>)}
  </View>;
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

export function ChooseScreen({ name, notice, onBack, onClose, onUndo }: {
  name: string; notice?: string | null; onBack: () => void; onClose: () => void; onUndo: () => void;
}) {
  const ui = useUi();
  const styles = useStyles();
  const { t } = useT();
  return <Screen>
    <Header title={t("placeEnding.chooseTitle", { name })} eyebrow={t("placeEnding.eyebrow")} onBack={onBack} />
    <Notice lines={notice ? [notice] : []} />
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
  onSelect: (option: PickOption) => void; onBack: () => void;
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
          selected={option.id === selected} onPress={() => onSelect(option)} />)}
      </View>}
  </Screen>;
}

export function LinesScreen({ name, situation, balance, lines, adding, editable, choiceOf, notice, blocked, onAnswer, onAdd, onCancelAdd, onPick,
  onAmount, onRemove, onContinue, onBack }: {
  name: string; situation: BalanceCase; balance: Money; lines: LineDraft[]; adding: boolean; editable: boolean;
  choiceOf: (line: LineDraft) => ChoiceView | null; notice: string[]; blocked: boolean;
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
  const ready = !blocked && lines.length > 0 && remaining === 0 && lines.every((line) => lineMinorUnits(line) !== null
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
    <Notice lines={notice} />
    <Text style={ui.body}>{t(copy.intro, { name, amount: money(magnitude) })}</Text>
    {lines.map((line) => {
      const spec = answerSpec(line.answer);
      const label = t(spec.label);
      const choice = choiceOf(line);
      return <View key={line.id} style={styles.card}>
        <Text style={styles.strong}>{label}</Text>
        {spec.kind !== "adjustment" && <ListGroup>
          <ListRow title={t(spec.kind === "transfer" ? "placeEnding.linePlace" : "placeEnding.lineCategory")}
            value={choice?.label ?? t("placeEnding.lineChoose")} tone={choice?.unavailable ? "warning" : undefined}
            detail={choice?.unavailable ? t("placeEnding.lineChooseAgain") : undefined}
            onPress={editable ? () => onPick(line.id) : undefined} />
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

export function ReviewScreen({ name, balance, lines, choiceOf, accountingDate, notice, replacement, unavailable, onRepick, onRepickDefault,
  busy, uncertain, error, canConfirm, onBack, onConfirm }: {
  name: string; balance: Money; lines: LineDraft[]; choiceOf: (line: LineDraft) => ChoiceView | null; accountingDate: string;
  notice: string[]; replacement: ChoiceView | null; unavailable: boolean; onRepick: (lineId: string) => void; onRepickDefault: () => void;
  busy: boolean; uncertain: boolean; error: string; canConfirm: boolean; onBack?: () => void; onConfirm: () => void;
}) {
  const ui = useUi();
  const styles = useStyles();
  const { t, language } = useT();
  const lineLabel = useLineLabel();
  const date = formatLongDate(language, Date.parse(`${accountingDate}T12:00:00Z`), "UTC");
  return <Screen>
    <Header title={t("placeEnding.reviewTitle", { name })} eyebrow={t("placeEnding.eyebrow")} onBack={onBack} />
    <Notice lines={notice} />
    {lines.length === 0 ? <Text style={ui.body}>{t("placeEnding.reviewZero", { name, amount: money(balance) })}</Text> : <>
      <Text style={ui.body}>{t("placeEnding.reviewDated", { date })}</Text>
      <ListGroup>
        {lines.map((line) => {
          const choice = choiceOf(line);
          return <ListRow key={line.id} title={lineLabel(line, choice?.label ?? null)} tone={choice?.unavailable ? "warning" : undefined}
            detail={choice?.unavailable ? t("placeEnding.lineChooseAgain") : undefined}
            onPress={choice?.unavailable && !uncertain ? () => onRepick(line.id) : undefined}
            value={money({ currency: balance.currency, minorUnits: lineMinorUnits(line) ?? 0 })} />;
        })}
      </ListGroup>
    </>}
    <DefaultLine replacement={replacement} uncertain={uncertain} onRepick={onRepickDefault} />
    <Text style={styles.strong}>{t("placeEnding.reviewForGood", { name })}</Text>
    {unavailable && !uncertain && <Text accessibilityRole="alert" style={ui.error}>{t("placeEnding.reviewUnavailable")}</Text>}
    {busy && <ActivityIndicator accessibilityLabel={t("placeEnding.closing")} />}
    {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
    <PrimaryButton label={uncertain ? t("placeEnding.closeRetry") : t("placeEnding.closeConfirm", { name })}
      trailingIcon={uncertain ? "refresh" : "checkmark"} pending={busy} disabled={!canConfirm} onPress={onConfirm} />
  </Screen>;
}

/** The new Default Place both confirmations name; one that can no longer be the default is marked and chosen again. */
function DefaultLine({ replacement, uncertain, onRepick }: { replacement: ChoiceView | null; uncertain: boolean; onRepick: () => void }) {
  const ui = useUi();
  const { t } = useT();
  if (!replacement) return null;
  if (!replacement.unavailable) return <Text style={ui.body}>{t("placeEnding.reviewDefault", { place: replacement.label })}</Text>;
  return <ListGroup>
    <ListRow title={t("placeEnding.reviewDefaultUnavailable", { place: replacement.label })} tone="warning"
      detail={t("placeEnding.reviewDefaultChoose")} onPress={uncertain ? undefined : onRepick} />
  </ListGroup>;
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

export function UndoConfirmScreen({ name, balance, snapshot, changed, replacement, onRepickDefault, typed, editable, onTyped,
  busy, uncertain, error, canConfirm, onConfirm, onBack }: {
  name: string; balance: Money; snapshot: UndoSnapshot | null; changed: boolean; replacement: ChoiceView | null; onRepickDefault: () => void;
  typed: string; editable: boolean; onTyped: (value: string) => void;
  busy: boolean; uncertain: boolean; error: string; canConfirm: boolean; onConfirm: () => void; onBack?: () => void;
}) {
  const ui = useUi();
  const styles = useStyles();
  const { t, tn } = useT();
  return <Screen>
    <Header title={t("placeEnding.undoConfirmTitle", { name })} eyebrow={t("placeEnding.eyebrow")} onBack={onBack} />
    <Notice lines={changed ? [t("placeEnding.undoChanged")] : []} />
    <Text style={styles.warning}>{t("placeEnding.undoWarning")}</Text>
    {!snapshot ? <ActivityIndicator accessibilityLabel={t("placeEnding.undoLoading")} /> : <View style={styles.card}>
      <Text style={styles.strong}>{tn("placeEnding.undoEntries", snapshot.entriesToReverse)}</Text>
      {snapshot.lockedMonthEntries > 0 && <Text style={ui.body}>{tn("placeEnding.undoLocked", snapshot.lockedMonthEntries)}</Text>}
      {snapshot.earlierOpenMonthEntries > 0 && <Text style={ui.body}>{tn("placeEnding.undoEarlierOpen", snapshot.earlierOpenMonthEntries)}</Text>}
      {snapshot.lockedMonthEntries + snapshot.earlierOpenMonthEntries > 0 && <Text style={ui.body}>{t("placeEnding.undoEarlierKept")}</Text>}
      {snapshot.otherPlaces.length > 0 ? <>
        <Text style={ui.body}>{t("placeEnding.undoOthersTitle")}</Text>
        <ListGroup>
          {snapshot.otherPlaces.map((place) => <ListRow key={place.financialAccountProfileId} title={place.name} value={signedMoney(place.balanceChange)} />)}
        </ListGroup>
      </> : <Text style={ui.body}>{t("placeEnding.undoNoOthers")}</Text>}
      {(snapshot.currentMonthExpenseChange.minorUnits !== 0 || snapshot.currentMonthIncomeChange.minorUnits !== 0) &&
        <Text style={ui.body}>{t("placeEnding.undoMonth", { expense: signedMoney(snapshot.currentMonthExpenseChange),
          income: signedMoney(snapshot.currentMonthIncomeChange) })}</Text>}
      {snapshot.currentMonthExpenseChange.minorUnits < 0 && <Text style={ui.body}>{t("placeEnding.undoBudget")}</Text>}
    </View>}
    <Text style={ui.body}>{t("placeEnding.undoZero", { name, amount: money({ currency: balance.currency, minorUnits: 0 }) })}</Text>
    <DefaultLine replacement={replacement} uncertain={uncertain} onRepick={onRepickDefault} />
    <Text style={ui.muted}>{t("placeEnding.undoAfter", { name })}</Text>
    <Field label={t("placeEnding.undoTypeLabel", { name })} accessibilityLabel={t("placeEnding.undoTypeA11y")} value={typed}
      editable={editable} onChangeText={onTyped} autoCapitalize="none" autoCorrect={false} />
    {busy && <ActivityIndicator accessibilityLabel={t("placeEnding.undoStarting")} />}
    {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
    <PrimaryButton label={uncertain ? t("placeEnding.undoRetry") : t("placeEnding.undoConfirm", { name })}
      trailingIcon={uncertain ? "refresh" : "arrow-undo"} pending={busy} disabled={!canConfirm} onPress={onConfirm} />
  </Screen>;
}

/**
 * What an unconfirmed Close or Undo contained, from the stored request and today's names. Nothing but the request is
 * stored, so a category deleted since reads as unavailable.
 */
export function UnresolvedSummary({ ending, workspaceId, nature, places }: {
  ending: UnresolvedEnding; workspaceId: string; nature: Closure["nature"]; places: readonly Pick<PlaceProfile, "id" | "name" | "status">[];
}) {
  const ui = useUi();
  const { t, language } = useT();
  const close = ending.act === "close" ? ending.request : null;
  const categories = useQuery(api.accounting.listUserCategories, close?.lines.some((line) => line.kind === "expense") ? { workspaceId } : "skip");
  const replacement = ending.request.replacementDefaultFinancialAccountProfileId;
  const situation = close ? balanceCase({ nature, balance: close.reviewedBalance }) : "zero";
  const target = (line: NonNullable<typeof close>["lines"][number]) => line.kind === "transfer" ? placeChoice(line.otherFinancialAccountProfileId, places, t).label
    : line.kind === "expense" ? categories?.find((category) => category.id === line.userCategoryId)?.name ?? t("categories.unavailableCategory") : "";
  return <>
    {close && (close.lines.length === 0
      ? <Text style={ui.body}>{t("placeEnding.reviewZero", { name: placeChoice(close.financialAccountProfileId, places, t).label, amount: money(close.reviewedBalance) })}</Text>
      : <>
        <Text style={ui.body}>{t("placeEnding.unresolvedDated", { date: formatLongDate(language, Date.parse(`${close.reviewedAccountingDate}T12:00:00Z`), "UTC") })}</Text>
        <ListGroup>
          {close.lines.map((line, index) => <ListRow key={index} title={t(closingLineReview(line.kind, situation), { target: target(line) })} value={money(line.amount)} />)}
        </ListGroup>
      </>)}
    {replacement && <Text style={ui.body}>{t("placeEnding.reviewDefault", { place: placeChoice(replacement, places, t).label })}</Text>}
  </>;
}

export function UnresolvedScreen({ ending, name, workspaceId, nature, places, busy, error, onSend, onBack }: {
  ending: UnresolvedEnding; name: string; workspaceId: string; nature: Closure["nature"];
  places: readonly Pick<PlaceProfile, "id" | "name" | "status">[]; busy: boolean; error: string; onSend: () => void; onBack?: () => void;
}) {
  const ui = useUi();
  const { t } = useT();
  const close = ending.act === "close";
  return <Screen>
    <Header title={t(close ? "placeEnding.unresolvedCloseTitle" : "placeEnding.unresolvedUndoTitle", { name })} eyebrow={t("placeEnding.eyebrow")} onBack={onBack} />
    <Text style={ui.body}>{t(close ? "placeEnding.unresolvedCloseBody" : "placeEnding.unresolvedUndoBody")}</Text>
    <UnresolvedSummary ending={ending} workspaceId={workspaceId} nature={nature} places={places} />
    {busy && <ActivityIndicator accessibilityLabel={t(close ? "placeEnding.closing" : "placeEnding.undoStarting")} />}
    {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
    <PrimaryButton label={t("placeEnding.unresolvedSend")} trailingIcon="refresh" pending={busy} onPress={onSend} />
  </Screen>;
}

export function UnreadableScreen({ onRetry, onBack }: { onRetry: () => void; onBack: () => void }) {
  const ui = useUi();
  const { t } = useT();
  return <Screen>
    <Header title={t("placeEnding.unreadableTitle")} eyebrow={t("placeEnding.eyebrow")} onBack={onBack} />
    <Text style={ui.body}>{t("placeEnding.unreadableBody")}</Text>
    <PrimaryButton label={t("placeEnding.unreadableRetry")} trailingIcon="refresh" onPress={onRetry} />
  </Screen>;
}
