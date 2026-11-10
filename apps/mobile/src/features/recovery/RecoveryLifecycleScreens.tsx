import { useMemo } from "react";
import { Text, View } from "react-native";
import { formatDateTime, formatLongDate, useT, type MessageKey, type Translator } from "../../i18n";
import {
  Choice,
  Field,
  Header,
  ListGroup,
  ListRow,
  PrimaryButton,
  Screen,
  SecondaryButton,
  useTheme,
  useUi,
} from "../../ui/core";
import {
  contributionsNewestFirst,
  REASON_LIMIT,
  recoveryMoney,
  type RecoveryContribution,
  type RecoveryPlanView,
} from "./model";
import { createRecoveryStyles } from "./styles";
import type { CorrectionTarget } from "./useRecoveryLifecycle";

const statusLabels: Record<RecoveryContribution["status"], MessageKey> = {
  active: "planning.statusCounted",
  voided: "planning.statusVoided",
  corrected: "planning.statusCorrected",
};

function calendarDate(language: Translator["language"], date: string) {
  return formatLongDate(language, new Date(`${date}T12:00:00Z`), "UTC");
}

function contributionDetail(
  item: RecoveryContribution,
  plans: RecoveryPlanView[],
  { t, language }: Translator,
  timeZone: string,
) {
  const titleOf = (planId: string | undefined) => plans.find((plan) => plan.id === planId)?.title ?? "";
  const source = item.correctsContributionId
    ? plans.find((plan) => plan.contributionHistory.some((entry) => entry.id === item.correctsContributionId))
    : undefined;
  const correction = item.status === "corrected" ? item.correction : undefined;
  return [
    calendarDate(language, item.contributionDate),
    source && t("planning.movedFrom", { plan: source.title }),
    item.status === "voided" && t("planning.voidedDetail"),
    correction && (correction.targetPlanId
      ? t("planning.movedTo", { plan: titleOf(correction.targetPlanId) })
      : t("planning.removedDetail")),
    correction && t("planning.reasonDetail", { reason: correction.reason }),
    correction && t("planning.recordedDetail", { date: formatDateTime(language, correction.recordedAt, timeZone) }),
    correction && item.transferReversed && t("planning.laterReversed"),
  ].filter(Boolean).join("\n");
}

export function ContributionHistory(props: {
  plan: RecoveryPlanView;
  plans: RecoveryPlanView[];
  timeZone: string;
  onPlan: (id: string) => void;
  onFix: (contributionId: string) => void;
}) {
  const ui = useUi();
  const translator = useT();
  const { t } = translator;
  const history = contributionsNewestFirst(props.plan.contributionHistory);
  return (
    <View style={ui.section}>
      <Text style={ui.label}>{t("planning.historyLabel")}</Text>
      {history.length ? (
        <ListGroup>
          {history.map((item) => {
            const target = item.status === "corrected" ? item.correction?.targetPlanId : undefined;
            return (
              <ListRow
                key={item.id}
                title={recoveryMoney({ currency: props.plan.currency, minorUnits: item.amountMinorUnits })}
                value={t(statusLabels[item.status])}
                detail={contributionDetail(item, props.plans, translator, props.timeZone)}
                onPress={item.status === "active" ? () => props.onFix(item.id)
                  : target ? () => props.onPlan(target) : undefined}
              />
            );
          })}
        </ListGroup>
      ) : (
        <Text style={ui.muted}>{t("planning.historyEmpty")}</Text>
      )}
      {history.some((item) => item.status === "active") && <Text style={ui.muted}>{t("planning.historyHint")}</Text>}
    </View>
  );
}

export function RecoveryCancelScreen(props: {
  plan: RecoveryPlanView;
  reason: string;
  error: string;
  editable: boolean;
  busy: boolean;
  pending: boolean;
  canSubmit: boolean;
  canDismiss: boolean;
  onReason: (value: string) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createRecoveryStyles(theme), [theme]);
  const ui = useUi();
  const { t } = useT();
  const recovered = recoveryMoney({ currency: props.plan.currency, minorUnits: props.plan.recoveredMinorUnits });
  return (
    <Screen>
      <Header
        title={t("planning.cancelTitle")}
        eyebrow={props.plan.title.toUpperCase()}
        onBack={props.canDismiss ? props.onBack : undefined}
      />
      <View style={styles.amountCard}>
        <Text style={ui.muted}>{t("planning.cancelKeptLabel")}</Text>
        <Text style={[ui.hero, styles.amount]}>{recovered}</Text>
        <Text style={ui.body}>{t("planning.cancelKept", { amount: recovered, place: props.plan.destinationName })}</Text>
      </View>
      <Text style={ui.body}>{t("planning.cancelNoMove")}</Text>
      <Text style={ui.body}>{t("planning.cancelRelease")}</Text>
      <Text style={ui.body}>{t("planning.cancelFrozen")}</Text>
      <Field
        label={t("planning.cancelReason")}
        accessibilityLabel={t("planning.cancelReasonA11y")}
        placeholder={t("planning.cancelReasonPlaceholder")}
        value={props.reason}
        onChangeText={props.onReason}
        editable={props.editable}
        multiline
        maxLength={REASON_LIMIT}
      />
      {props.error ? <Text accessibilityRole="alert" style={ui.error}>{props.error}</Text> : null}
      <PrimaryButton
        label={props.busy ? t("planning.cancelBusy") : props.pending ? t("planning.cancelRetry") : t("planning.cancelConfirm")}
        disabled={!props.canSubmit}
        pending={props.busy}
        onPress={props.onConfirm}
        trailingIcon="close-circle-outline"
      />
      {props.canDismiss && <SecondaryButton label={t("planning.cancelKeep")} onPress={props.onBack} />}
    </Screen>
  );
}

export function RecoveryCorrectScreen(props: {
  plan: RecoveryPlanView;
  contribution: RecoveryContribution;
  targets: RecoveryPlanView[];
  target: CorrectionTarget | null;
  reason: string;
  error: string;
  editable: boolean;
  busy: boolean;
  pending: boolean;
  canSubmit: boolean;
  canDismiss: boolean;
  onTarget: (target: CorrectionTarget) => void;
  onReason: (value: string) => void;
  onSave: () => void;
  onBack: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createRecoveryStyles(theme), [theme]);
  const ui = useUi();
  const { t, language } = useT();
  const money = (minorUnits: number) => recoveryMoney({ currency: props.plan.currency, minorUnits });
  const date = calendarDate(language, props.contribution.contributionDate);
  const choose = (target: CorrectionTarget) => { if (props.editable) props.onTarget(target); };
  return (
    <Screen>
      <Header
        title={t("planning.fixTitle")}
        eyebrow={props.plan.title.toUpperCase()}
        onBack={props.canDismiss ? props.onBack : undefined}
      />
      <View style={styles.amountCard}>
        <Text style={[ui.hero, styles.amount]}>{money(props.contribution.amountMinorUnits)}</Text>
        <Text style={ui.muted}>{t("planning.fixCountsToward", { date, plan: props.plan.title })}</Text>
      </View>
      <Text style={ui.body}>{t("planning.fixExplain")}</Text>
      <View style={ui.section}>
        <Text style={ui.label}>{t("planning.fixTargetLabel")}</Text>
        <Choice
          label={t("planning.fixRemove")}
          detail={t("planning.fixRemoveDetail", { place: props.plan.destinationName })}
          selected={props.target?.kind === "remove"}
          onPress={() => choose({ kind: "remove" })}
        />
        {props.targets.map((plan) => (
          <Choice
            key={plan.id}
            label={plan.title}
            detail={t("planning.fixTargetDetail", { amount: money(plan.remainingMinorUnits) })}
            selected={props.target?.kind === "plan" && props.target.planId === plan.id}
            onPress={() => choose({ kind: "plan", planId: plan.id })}
          />
        ))}
        {props.targets.length === 0 && <Text style={ui.muted}>{t("planning.fixNoTargets", { date })}</Text>}
      </View>
      <Field
        label={t("planning.fixReason")}
        accessibilityLabel={t("planning.fixReasonA11y")}
        placeholder={t("planning.fixReasonPlaceholder")}
        value={props.reason}
        onChangeText={props.onReason}
        editable={props.editable}
        multiline
        maxLength={REASON_LIMIT}
        helperText={t("planning.fixReasonRequired")}
      />
      {props.error ? <Text accessibilityRole="alert" style={ui.error}>{props.error}</Text> : null}
      <PrimaryButton
        label={props.busy ? t("planning.fixBusy") : props.pending ? t("planning.fixRetry") : t("planning.fixSave")}
        disabled={!props.canSubmit}
        pending={props.busy}
        onPress={props.onSave}
        trailingIcon="checkmark"
      />
      <Text style={ui.muted}>{t("planning.fixFootnote")}</Text>
    </Screen>
  );
}
