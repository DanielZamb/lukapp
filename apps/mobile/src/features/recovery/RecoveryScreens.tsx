import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import {
  Choice,
  Field,
  Header,
  ListGroup,
  ListRow,
  PrimaryButton,
  ProgressBar,
  Screen,
  SecondaryButton,
  theme,
  ui,
} from "../../ui/core";
import { font, fontSize, radius, spacing } from "../../ui/tokens";
import {
  candidateDetail,
  INSTALLMENT_COUNTS,
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

type MonthCount = (typeof INSTALLMENT_COUNTS)[number];

export function RecoveryPlanList(props: {
  plans: RecoveryPlanView[];
  onBack: () => void;
  onPlan: (id: string) => void;
}) {
  return (
    <Screen>
      <Header title="Savings recovery" eyebrow="PLANS" onBack={props.onBack} />
      <ListGroup>
        {props.plans.map((plan) => (
          <ListRow
            key={plan.id}
            title={plan.title}
            detail={progressCopy(plan)}
            value={`${Math.round(progressRatio(plan) * 100)}%`}
            onPress={() => props.onPlan(plan.id)}
          />
        ))}
      </ListGroup>
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
  return (
    <Screen>
      <Header
        title="Expenses to recover"
        eyebrow={`${recoveryMonthName(props.month).toUpperCase()} CLOSE`}
        onBack={props.onBack}
      />
      <Text style={ui.muted}>
        Choose an expense you want to replenish through future saving. The expense stays posted as it happened.
      </Text>
      {props.candidates.length ? (
        <ListGroup>
          {props.candidates.map((candidate) => (
            <ListRow
              key={candidate.journalEntryId}
              title={candidate.title}
              detail={candidateDetail(candidate)}
              value={recoveryMoney({ currency: props.currency, minorUnits: candidate.amountMinorUnits })}
              onPress={() => props.onStart(candidate)}
            />
          ))}
        </ListGroup>
      ) : (
        <Text style={ui.muted}>No posted expenses are waiting to be recovered.</Text>
      )}
    </Screen>
  );
}

export function RecoveryDraft(props: {
  candidate: RecoveryCandidate;
  currency: string;
  destinations: RecoveryPlace[];
  installmentCount: number;
  amount: string;
  destinationId: string | null;
  suggestion: ReturnType<typeof suggestionFor>;
  editable: boolean;
  busy: boolean;
  pending: boolean;
  canSubmit: boolean;
  canDismiss: boolean;
  error: string;
  onMonths: (count: MonthCount) => void;
  onAmount: (value: string) => void;
  onDestination: (id: string) => void;
  onSave: () => void;
  onBack: () => void;
}) {
  const limits = limitsCopy(props.currency, props.suggestion);
  const principal = recoveryMoney({
    currency: props.currency,
    minorUnits: props.candidate.amountMinorUnits,
  });
  return (
    <Screen>
      <Header
        title="Plan the recovery"
        eyebrow={`${props.candidate.title.toUpperCase()} · DRAFT`}
        onBack={props.canDismiss ? props.onBack : undefined}
      />
      <View style={styles.amountCard}>
        <Text style={ui.muted}>Amount to replenish</Text>
        <Text style={[ui.hero, styles.amount]}>{principal}</Text>
      </View>
      <View style={ui.section}>
        <Text style={ui.label}>MONTHS</Text>
        {INSTALLMENT_COUNTS.map((count) => {
          const preview = count === props.installmentCount
            ? props.suggestion
            : suggestionFor(props.candidate.amountMinorUnits, count);
          return (
            <Choice
              key={count}
              label={`${count} months`}
              detail={`${recoveryMoney({ currency: props.currency, minorUnits: preview.installmentMinorUnits })} each · ${recoveryMoney({ currency: props.currency, minorUnits: preview.premiumMinorUnits })} extra saving`}
              selected={count === props.installmentCount}
              onPress={() => { if (props.editable) props.onMonths(count); }}
            />
          );
        })}
      </View>
      <Field
        label={`Monthly amount in ${props.currency}`}
        accessibilityLabel={`Monthly amount in ${props.currency}`}
        keyboardType="decimal-pad"
        value={props.amount}
        onChangeText={props.onAmount}
        editable={props.editable}
        invalid={!props.suggestion.valid}
        error={props.error || (!props.suggestion.valid ? limits.invalid : undefined)}
        helperText={!props.error && props.suggestion.valid ? `${limits.range} ${limits.extra}` : undefined}
      />
      {(props.error || !props.suggestion.valid) ? <Text style={ui.muted}>{`${limits.range} ${limits.extra}`}</Text> : null}
      {props.destinations.length === 1 ? (
        <ListGroup>
          <ListRow title="Destination" value={props.destinations[0].name} icon="wallet-outline" />
        </ListGroup>
      ) : (
        <View style={ui.section}>
          <Text style={ui.label}>DESTINATION</Text>
          {props.destinations.length ? props.destinations.map((place) => (
            <Choice
              key={place.id}
              label={place.name}
              selected={place.id === props.destinationId}
              onPress={() => { if (props.editable) props.onDestination(place.id); }}
            />
          )) : (
            <Text style={ui.muted}>Add a savings place from Overview before you can start Recovery.</Text>
          )}
        </View>
      )}
      <PrimaryButton
        label={props.busy ? "Activating…" : props.pending ? "Retry activation" : "Activate plan"}
        disabled={!props.canSubmit}
        pending={props.busy}
        onPress={props.onSave}
        trailingIcon="checkmark"
      />
      <Text style={ui.muted}>
        Activation fixes this schedule. Future changes cancel and replace the plan; completed saving stays in history.
      </Text>
    </Screen>
  );
}

export function RecoveryPlanScreen(props: {
  plan: RecoveryPlanView;
  month: string;
  onBack: () => void;
  onMove: () => void;
  onFind: () => void;
}) {
  const due = recoveryMoney({ currency: props.plan.currency, minorUnits: props.plan.dueMinorUnits });
  const remaining = recoveryMoney({ currency: props.plan.currency, minorUnits: props.plan.remainingMinorUnits });
  const complete = props.plan.remainingMinorUnits === 0;
  return (
    <Screen>
      <Header title="Savings recovery" eyebrow={props.plan.title.toUpperCase()} onBack={props.onBack} />
      <View style={styles.amountCard}>
        <Text style={ui.muted}>Recovered so far</Text>
        <Text style={[ui.hero, styles.amount]}>
          {recoveryMoney({ currency: props.plan.currency, minorUnits: props.plan.recoveredMinorUnits })}
        </Text>
        <ProgressBar value={progressRatio(props.plan)} label={`${props.plan.title} recovery progress`} />
        <View style={styles.legend}>
          <Text style={ui.muted}>{Math.round(progressRatio(props.plan) * 100)}% complete</Text>
          <Text style={ui.muted}>{remaining} left</Text>
        </View>
      </View>
      <ListGroup>
        <ListRow
          title="Due this month"
          value={due}
          valueStyle={props.plan.dueMinorUnits > 0 ? styles.warning : undefined}
        />
        <ListRow title="Destination" value={props.plan.destinationName} />
        <ListRow title="Original plan" value={`${props.plan.installmentCount} months`} />
      </ListGroup>
      {!complete && (
        <PrimaryButton
          label={`Move money for ${recoveryMonthName(props.month)}`}
          trailingIcon="swap-horizontal"
          onPress={props.onMove}
        />
      )}
      <SecondaryButton label="Find another expense" onPress={props.onFind} />
      <Text style={ui.muted}>
        Recovery is a saving plan. It does not undo the original expense or create money you owe yourself.
      </Text>
    </Screen>
  );
}

export function RecoveryMoveScreen(props: {
  plan: RecoveryPlanView;
  sources: RecoveryPlace[];
  sourceId: string | null;
  amount: string;
  editable: boolean;
  busy: boolean;
  pending: boolean;
  canSubmit: boolean;
  canDismiss: boolean;
  error: string;
  onSource: (id: string) => void;
  onAmount: (value: string) => void;
  submit: () => Promise<void>;
  onBack: () => void;
}) {
  const places = props.sources.filter((place) => place.id !== props.plan.destinationFinancialAccountProfileId);
  return (
    <Screen>
      <Header
        title="Move money"
        eyebrow="RECOVERY CONTRIBUTION"
        onBack={props.canDismiss ? props.onBack : undefined}
      />
      <ListGroup>
        <ListRow title="To" value={props.plan.destinationName} />
        <ListRow title="Counts toward" value={props.plan.title} />
        <ListRow
          title="Due this month"
          value={recoveryMoney({ currency: props.plan.currency, minorUnits: props.plan.dueMinorUnits })}
        />
      </ListGroup>
      <View style={ui.section}>
        <Text style={ui.label}>FROM</Text>
        {places.length ? places.map((place) => (
          <Choice
            key={place.id}
            label={place.name}
            selected={place.id === props.sourceId}
            onPress={() => { if (props.editable) props.onSource(place.id); }}
          />
        )) : (
          <Text style={ui.muted}>Add another place before you can move money into this destination.</Text>
        )}
      </View>
      <Field
        label={`Amount in ${props.plan.currency}`}
        accessibilityLabel={`Amount in ${props.plan.currency}`}
        keyboardType="decimal-pad"
        value={props.amount}
        onChangeText={props.onAmount}
        editable={props.editable}
        error={props.error}
      />
      <Text style={ui.muted}>
        Progress changes only after this real account-to-account transfer posts.
      </Text>
      <PrimaryButton
        label={props.busy ? "Moving…" : props.pending ? "Retry transfer" : "Post transfer"}
        disabled={!props.canSubmit || places.length === 0}
        pending={props.busy}
        onPress={() => { void props.submit(); }}
      />
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
  return (
    <Screen contentStyle={styles.completion}>
      <View style={styles.completionIcon}>
        <Ionicons name="checkmark" size={32} color={theme.primaryForeground} />
      </View>
      <Text accessibilityRole="header" style={styles.completionTitle}>Recovery plan active</Text>
      <Text style={[ui.muted, styles.completionCopy]}>
        {`${props.title} will begin with a ${recoveryMoney({ currency: props.currency, minorUnits: props.installmentMinorUnits })} contribution in ${recoveryMonthName(props.activationMonth)}.`}
      </Text>
      <PrimaryButton label="View Plans" trailingIcon="layers-outline" onPress={props.onViewPlans} />
      <SecondaryButton label="Back home" onPress={props.onHome} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  amountCard: {
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: theme.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.border,
  },
  amount: { fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  warning: { color: theme.warning },
  completion: { justifyContent: "center" },
  completionIcon: {
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    width: 68,
    height: 68,
    borderRadius: radius.full,
    backgroundColor: theme.primary,
  },
  completionTitle: {
    fontFamily: font.extrabold,
    fontSize: 30,
    lineHeight: 36,
    color: theme.foreground,
    textAlign: "center",
  },
  completionCopy: { fontSize: fontSize.body, lineHeight: 24, textAlign: "center" },
});
