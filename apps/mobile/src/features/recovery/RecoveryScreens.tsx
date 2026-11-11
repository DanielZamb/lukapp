import { useMemo } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Text, View } from "react-native";
import {
  Choice,
  Header,
  ListGroup,
  ListRow,
  PrimaryButton,
  ProgressBar,
  Screen,
  SecondaryButton,
  useTheme,
  useUi,
} from "../../ui/core";
import { formatLongDate, useT } from "../../i18n";
import {
  candidateDetail,
  INSTALLMENT_COUNTS,
  isCancellable,
  isEnded,
  limitsCopy,
  progressCopy,
  progressRatio,
  recoveryMoney,
  recoveryMonthName,
  suggestionFor,
  type RecoveryCandidate,
  type RecoveryPlace,
  type RecoveryPlanView,
} from "./model";
import { ContributionHistory } from "./RecoveryLifecycleScreens";
import { createRecoveryStyles } from "./styles";
import type { UnavailablePlace } from "./useChosenPlace";
import { AmountField } from "../amount/AmountField";
import type { AmountSession } from "../amount/session";

type MonthCount = (typeof INSTALLMENT_COUNTS)[number];

export function RecoveryPlanList(props: {
  plans: RecoveryPlanView[];
  onBack: () => void;
  onPlan: (id: string) => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createRecoveryStyles(theme), [theme]);
  const ui = useUi();
  const { t } = useT();
  const current = props.plans.filter((plan) => !isEnded(plan));
  const past = props.plans.filter(isEnded);
  return (
    <Screen>
      <Header title={t("recovery.title")} eyebrow={t("recovery.listEyebrow")} onBack={props.onBack} />
      {current.length > 0 && (
        <ListGroup>
          {current.map((plan) => (
            <ListRow
              key={plan.id}
              title={plan.title}
              detail={progressCopy(plan, t)}
              value={`${Math.round(progressRatio(plan) * 100)}%`}
              onPress={() => props.onPlan(plan.id)}
            />
          ))}
        </ListGroup>
      )}
      {past.length > 0 && (
        <View style={ui.section}>
          <Text style={ui.label}>{t("planning.pastPlans")}</Text>
          <ListGroup>
            {past.map((plan) => (
              <ListRow
                key={plan.id}
                title={plan.title}
                titleStyle={styles.quiet}
                detail={plan.status === "cancelled"
                  ? t("planning.listCancelledDetail", {
                    amount: recoveryMoney({ currency: plan.currency, minorUnits: plan.recoveredMinorUnits }),
                  })
                  : progressCopy(plan, t)}
                value={plan.status === "cancelled" ? t("planning.statusCancelled") : `${Math.round(progressRatio(plan) * 100)}%`}
                valueStyle={styles.quiet}
                onPress={() => props.onPlan(plan.id)}
              />
            ))}
          </ListGroup>
        </View>
      )}
    </Screen>
  );
}

export function RecoveryCandidates(props: {
  currency: string;
  month: string;
  candidates: RecoveryCandidate[];
  onBack: () => void;
  onStart: (candidate: RecoveryCandidate) => void;
}) {
  const ui = useUi();
  const translator = useT();
  const { t, locale } = translator;
  return (
    <Screen>
      <Header
        title={t("recovery.candidatesTitle")}
        eyebrow={t("recovery.candidatesEyebrow", { month: recoveryMonthName(props.month, translator).toLocaleUpperCase(locale) })}
        onBack={props.onBack}
      />
      <Text style={ui.muted}>{t("recovery.candidatesIntro")}</Text>
      {props.candidates.length ? (
        <ListGroup>
          {props.candidates.map((candidate) => (
            <ListRow
              key={candidate.journalEntryId}
              title={candidate.title}
              detail={candidateDetail(candidate, translator)}
              value={recoveryMoney({ currency: props.currency, minorUnits: candidate.amountMinorUnits })}
              onPress={() => props.onStart(candidate)}
            />
          ))}
        </ListGroup>
      ) : (
        <Text style={ui.muted}>{t("recovery.candidatesEmpty")}</Text>
      )}
    </Screen>
  );
}

/** The chosen Place that can no longer be used, kept in the list where it was chosen and marked, never sent. */
function UnavailableChoice({ place }: { place: UnavailablePlace }) {
  return <Choice label={place.label} detail={place.detail} selected disabled onPress={() => {}} />;
}

export function RecoveryDraft(props: {
  candidate: RecoveryCandidate;
  currency: string;
  destinations: RecoveryPlace[];
  replacing?: boolean;
  installmentCount: number;
  amount: AmountSession;
  destinationId: string | null;
  unavailable?: UnavailablePlace | null;
  suggestion: ReturnType<typeof suggestionFor>;
  editable: boolean;
  busy: boolean;
  pending: boolean;
  canSubmit: boolean;
  canDismiss: boolean;
  error: string;
  onMonths: (count: MonthCount) => void;
  onAmount: (value: AmountSession) => void;
  onDestination: (id: string) => void;
  onSave: () => void;
  onBack: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createRecoveryStyles(theme), [theme]);
  const ui = useUi();
  const { t, tn, locale } = useT();
  const limits = limitsCopy(props.currency, props.suggestion, t);
  const destinations = props.destinations.filter((place) => place.id !== props.unavailable?.id);
  const limitsHelp = `${limits.range} ${limits.extra}`;
  const principal = recoveryMoney({
    currency: props.currency,
    minorUnits: props.candidate.amountMinorUnits,
  });
  return (
    <Screen>
      <Header
        title={t("recovery.draftTitle")}
        eyebrow={t(props.replacing ? "planning.replacementEyebrow" : "recovery.draftEyebrow",
          { title: props.candidate.title.toLocaleUpperCase(locale) })}
        onBack={props.canDismiss ? props.onBack : undefined}
      />
      {props.replacing && <Text style={ui.muted}>{t("planning.replacementNote")}</Text>}
      <View style={styles.amountCard}>
        <Text style={ui.muted}>{t("recovery.draftPrincipal")}</Text>
        <Text style={[ui.hero, styles.amount]}>{principal}</Text>
      </View>
      <View style={ui.section}>
        <Text style={ui.label}>{t("recovery.draftMonthsLabel")}</Text>
        {INSTALLMENT_COUNTS.map((count) => {
          const preview = count === props.installmentCount
            ? props.suggestion
            : suggestionFor(props.candidate.amountMinorUnits, count);
          return (
            <Choice
              key={count}
              label={tn("recovery.months", count)}
              detail={t("recovery.draftMonthsDetail", {
                installment: recoveryMoney({ currency: props.currency, minorUnits: preview.installmentMinorUnits }),
                extra: recoveryMoney({ currency: props.currency, minorUnits: preview.premiumMinorUnits }),
              })}
              selected={count === props.installmentCount}
              onPress={() => { if (props.editable) props.onMonths(count); }}
            />
          );
        })}
      </View>
      <AmountField
        label={t("recovery.draftMonthly", { currency: props.currency })}
        inputAccessibilityLabel={t("recovery.draftMonthly", { currency: props.currency })}
        session={props.amount}
        onChange={props.onAmount}
        editable={props.editable}
        message={{
          error: props.error || (!props.suggestion.valid ? limits.invalid : undefined),
          helper: !props.error && props.suggestion.valid ? limitsHelp : undefined,
        }}
      />
      {(props.error || !props.suggestion.valid) ? <Text style={ui.muted}>{limitsHelp}</Text> : null}
      {destinations.length === 1 && destinations[0].id === props.destinationId && !props.unavailable ? (
        <ListGroup>
          <ListRow title={t("recovery.destination")} value={destinations[0].name} icon="wallet-outline" />
        </ListGroup>
      ) : (
        <View style={ui.section}>
          <Text style={ui.label}>{t("recovery.destinationLabel")}</Text>
          {destinations.map((place) => (
            <Choice
              key={place.id}
              label={place.name}
              selected={place.id === props.destinationId}
              onPress={() => { if (props.editable) props.onDestination(place.id); }}
            />
          ))}
          {props.unavailable ? <UnavailableChoice place={props.unavailable} />
            : destinations.length ? null : <Text style={ui.muted}>{t("recovery.draftNoDestination")}</Text>}
        </View>
      )}
      <PrimaryButton
        label={props.busy ? t("recovery.draftActivating") : props.pending ? t("recovery.draftRetry") : t("recovery.draftActivate")}
        disabled={!props.canSubmit}
        pending={props.busy}
        onPress={props.onSave}
        trailingIcon="checkmark"
      />
      <Text style={ui.muted}>{t("recovery.draftFootnote")}</Text>
    </Screen>
  );
}

export type RecoveryPlanNotice = "cancelled" | "corrected";

export function RecoveryPlanScreen(props: {
  plan: RecoveryPlanView;
  plans: RecoveryPlanView[];
  month: string;
  timeZone: string;
  replacement: RecoveryCandidate | null;
  notice?: RecoveryPlanNotice;
  /** This phone sent a movement for the plan and never learned its outcome. */
  unconfirmedMove?: boolean;
  onBack: () => void;
  onMove: () => void;
  onFind: () => void;
  onCancel: () => void;
  onReplace: () => void;
  onPlan: (id: string) => void;
  onFix: (contributionId: string) => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createRecoveryStyles(theme), [theme]);
  const ui = useUi();
  const translator = useT();
  const { t, tn, language, locale } = translator;
  const { plan } = props;
  const money = (minorUnits: number) => recoveryMoney({ currency: plan.currency, minorUnits });
  const complete = plan.remainingMinorUnits === 0;
  const cancelled = plan.status === "cancelled";
  const replaces = props.plans.find((item) => item.id === plan.replacesPlanId);
  const replacedBy = props.plans.find((item) => item.id === plan.replacedByPlanId);
  return (
    <Screen>
      <Header title={t("recovery.title")} eyebrow={plan.title.toLocaleUpperCase(locale)} onBack={props.onBack} />
      {props.notice && (
        <Text accessibilityRole="alert" style={ui.body}>
          {t(props.notice === "cancelled" ? "planning.cancelledNotice" : "planning.correctedNotice")}
        </Text>
      )}
      {plan.cancellation && (
        <View style={ui.section}>
          <Text style={ui.title}>
            {t("planning.cancelledOn", { date: formatLongDate(language, plan.cancellation.eventTime, props.timeZone) })}
          </Text>
          {plan.cancellation.origin?.kind === "automatic" && (
            <Text style={ui.muted}>
              {t(plan.cancellation.origin.cause.kind === "transfer_reversed"
                ? "planning.cancelledAutomaticallyReversal" : "planning.cancelledAutomaticallyCorrection")}
            </Text>
          )}
          {plan.cancellation.reason && (
            <Text style={ui.muted}>{t("planning.cancelledReason", { reason: plan.cancellation.reason })}</Text>
          )}
        </View>
      )}
      <View style={styles.amountCard}>
        <Text style={ui.muted}>{t("recovery.planRecovered")}</Text>
        <Text style={[ui.hero, styles.amount]}>{money(plan.recoveredMinorUnits)}</Text>
        {!cancelled && <>
          <ProgressBar value={progressRatio(plan)} label={t("recovery.planProgressA11y", { title: plan.title })} />
          <View style={styles.legend}>
            <Text style={ui.muted}>{t("recovery.planPercent", { percent: Math.round(progressRatio(plan) * 100) })}</Text>
            <Text style={ui.muted}>{t("recovery.planLeft", { amount: money(plan.remainingMinorUnits) })}</Text>
          </View>
        </>}
      </View>
      <ListGroup>
        {!cancelled && (
          <ListRow
            title={t("recovery.planDue")}
            value={money(plan.dueMinorUnits)}
            valueStyle={plan.dueMinorUnits > 0 ? styles.warning : undefined}
          />
        )}
        <ListRow title={t("recovery.destination")} value={plan.destinationName} />
        <ListRow title={t("recovery.planOriginal")} value={tn("recovery.months", plan.installmentCount)} />
        {replaces && <ListRow title={t("planning.replaces")} value={replaces.title} onPress={() => props.onPlan(replaces.id)} />}
        {replacedBy && (
          <ListRow title={t("planning.replacedBy")} value={replacedBy.title} onPress={() => props.onPlan(replacedBy.id)} />
        )}
      </ListGroup>
      {plan.status === "suspended" && (
        <Text style={ui.muted}>{t("recovery.planSuspended")}</Text>
      )}
      {props.unconfirmedMove ? <>
        <Text accessibilityRole="alert" style={ui.error}>{t("recovery.moveUncertain")}</Text>
        <PrimaryButton label={t("recovery.moveUnconfirmedOpen")} trailingIcon="refresh" onPress={props.onMove} />
      </> : !complete && plan.status === "active" && plan.acceptsContributions && (
        <PrimaryButton
          label={t("recovery.planMove", { month: recoveryMonthName(props.month, translator) })}
          trailingIcon="swap-horizontal"
          onPress={props.onMove}
        />
      )}
      {cancelled && !plan.replacedByPlanId && (props.replacement ? <>
        <Text style={ui.muted}>{t("planning.replaceOpen", { amount: money(props.replacement.amountMinorUnits) })}</Text>
        <PrimaryButton label={t("planning.replaceAction")} trailingIcon="refresh" onPress={props.onReplace} />
      </> : <Text style={ui.muted}>{t("planning.replaceUnavailable")}</Text>)}
      <SecondaryButton label={t("recovery.planFind")} onPress={props.onFind} />
      {isCancellable(plan) && <SecondaryButton label={t("planning.cancelAction")} tone="danger" onPress={props.onCancel} />}
      <ContributionHistory plan={plan} plans={props.plans} timeZone={props.timeZone} onPlan={props.onPlan} onFix={props.onFix} />
      <Text style={ui.muted}>{t("recovery.planFootnote")}</Text>
    </Screen>
  );
}

export function RecoveryMoveScreen(props: {
  plan: RecoveryPlanView;
  sources: RecoveryPlace[];
  sourceId: string | null;
  unavailable?: UnavailablePlace | null;
  amount: AmountSession;
  editable: boolean;
  busy: boolean;
  pending: boolean;
  canSubmit: boolean;
  canDismiss: boolean;
  error: string;
  onSource: (id: string) => void;
  onAmount: (value: AmountSession) => void;
  submit: () => Promise<void>;
  onBack: () => void;
}) {
  const theme = useTheme();
  const styles = useMemo(() => createRecoveryStyles(theme), [theme]);
  const ui = useUi();
  const { t } = useT();
  const places = props.sources.filter((place) => place.id !== props.plan.destinationFinancialAccountProfileId
    && place.id !== props.unavailable?.id);
  return (
    <Screen>
      <Header
        title={t("recovery.moveTitle")}
        eyebrow={t("recovery.moveEyebrow")}
        onBack={props.canDismiss ? props.onBack : undefined}
      />
      <View style={styles.amountCard}>
        <Text style={ui.muted}>{t("recovery.moveAmount")}</Text>
        <View style={styles.amountEntry}>
          <Text style={[ui.hero, styles.amount]}>{props.plan.currency}</Text>
          <View style={styles.amountInput}>
            <AmountField
              inputAccessibilityLabel={t("recovery.moveAmountA11y", { currency: props.plan.currency })}
              session={props.amount}
              onChange={props.onAmount}
              editable={props.editable}
              inputStyle={[ui.hero, styles.amount]}
            />
          </View>
        </View>
        {props.error ? <Text accessibilityRole="alert" style={ui.error}>{props.error}</Text> : null}
      </View>
      <ListGroup>
        {places.length === 1 && places[0].id === props.sourceId && !props.unavailable ? (
          <ListRow title={t("recovery.moveFrom")} value={places[0].name} icon="arrow-up-circle-outline" />
        ) : (
          <View>
            <ListRow title={t("recovery.moveFrom")} icon="arrow-up-circle-outline" />
            <View style={styles.sources}>
              {places.map((place) => (
                <Choice
                  key={place.id}
                  label={place.name}
                  selected={place.id === props.sourceId}
                  onPress={() => { if (props.editable) props.onSource(place.id); }}
                />
              ))}
              {props.unavailable ? <UnavailableChoice place={props.unavailable} />
                : places.length ? null : <Text style={ui.muted}>{t("recovery.moveNoSource")}</Text>}
            </View>
          </View>
        )}
        <ListRow title={t("recovery.moveTo")} value={props.plan.destinationName} icon="arrow-down-circle-outline" />
        <ListRow title={t("recovery.moveCountsToward")} value={props.plan.title} icon="trending-up-outline" />
      </ListGroup>
      <PrimaryButton
        label={props.busy ? t("recovery.moveBusy") : props.pending ? t("recovery.moveRetry") : t("recovery.moveSubmit")}
        disabled={!props.canSubmit || (places.length === 0 && !props.pending)}
        pending={props.busy}
        onPress={() => { void props.submit(); }}
        trailingIcon="checkmark"
      />
      <Text style={ui.muted}>{t("recovery.moveFootnote")}</Text>
    </Screen>
  );
}

/** The phone's saved Recovery requests can't be read, so nothing new is sent until they can. */
export function RecoveryUnreadable({ onRetry, onBack }: { onRetry: () => void; onBack: () => void }) {
  const ui = useUi();
  const { t, locale } = useT();
  return (
    <Screen>
      <Header title={t("recovery.unreadableTitle")} eyebrow={t("recovery.title").toLocaleUpperCase(locale)} onBack={onBack} />
      <Text style={ui.body}>{t("recovery.unreadableBody")}</Text>
      <PrimaryButton label={t("recovery.unreadableRetry")} trailingIcon="refresh" onPress={onRetry} />
    </Screen>
  );
}

export function RecoveryMoved(props: {
  title: string;
  detail: string;
  onViewPlan: () => void;
  onHome: () => void;
}) {
  const ui = useUi();
  const theme = useTheme();
  const styles = useMemo(() => createRecoveryStyles(theme), [theme]);
  const { t } = useT();
  return (
    <Screen contentStyle={styles.completion}>
      <View style={styles.completionIcon}>
        <Ionicons name="checkmark" size={32} color={theme.primaryForeground} />
      </View>
      <Text accessibilityRole="header" style={styles.completionTitle}>{props.title}</Text>
      <Text style={[ui.muted, styles.completionCopy]}>{props.detail}</Text>
      <PrimaryButton label={t("recovery.movedViewPlan")} trailingIcon="trending-up-outline" onPress={props.onViewPlan} />
      <SecondaryButton label={t("recovery.backHome")} onPress={props.onHome} />
    </Screen>
  );
}

export function RecoveryActivated(props: {
  title: string;
  currency: string;
  installmentMinorUnits: number;
  activationMonth: string;
  onViewPlans: () => void;
  onHome: () => void;
}) {
  const ui = useUi();
  const theme = useTheme();
  const styles = useMemo(() => createRecoveryStyles(theme), [theme]);
  const translator = useT();
  const { t } = translator;
  return (
    <Screen contentStyle={styles.completion}>
      <View style={styles.completionIcon}>
        <Ionicons name="checkmark" size={32} color={theme.primaryForeground} />
      </View>
      <Text accessibilityRole="header" style={styles.completionTitle}>{t("recovery.activatedTitle")}</Text>
      <Text style={[ui.muted, styles.completionCopy]}>
        {t("recovery.activatedDetail", {
          title: props.title,
          amount: recoveryMoney({ currency: props.currency, minorUnits: props.installmentMinorUnits }),
          month: recoveryMonthName(props.activationMonth, translator),
        })}
      </Text>
      <PrimaryButton label={t("recovery.activatedViewPlans")} trailingIcon="layers-outline" onPress={props.onViewPlans} />
      <SecondaryButton label={t("recovery.backHome")} onPress={props.onHome} />
    </Screen>
  );
}
