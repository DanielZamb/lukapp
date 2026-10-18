import { Text, View } from "react-native";
import { Choice, Field, Header, ListGroup, ListRow, PrimaryButton, ProgressBar, Screen, SecondaryButton, useUi } from "../../ui/core";
import { formatMoney } from "../money";
import {
  formatRate,
  INSTALLMENT_COUNTS,
  limitsCopy,
  progressCopy,
  progressRatio,
  suggestionFor,
  type RecoveryCandidate,
  type RecoveryPlace,
  type RecoveryPlanView,
} from "./model";

type MonthCount = (typeof INSTALLMENT_COUNTS)[number];

export function RecoveryBoard(props: {
  currency: string;
  plans: RecoveryPlanView[];
  candidates: RecoveryCandidate[];
  onBack: () => void;
  onPlan: (id: string) => void;
  onStart: (candidate: RecoveryCandidate) => void;
}) {
  const ui = useUi();
  return (
    <Screen>
      <Header title="Savings Recovery" eyebrow="PLANS" onBack={props.onBack} />
      <Text style={ui.muted}>
        Replenish an earlier expense through saving. Recovery does not undo the original expense.
      </Text>
      {props.plans.length ? (
        <View style={ui.section}>
          <Text style={ui.label}>ACTIVE PLANS</Text>
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
        </View>
      ) : (
        <View style={ui.section}>
          <Text style={ui.title}>Start from an expense</Text>
          <Text style={ui.muted}>Choose a posted expense to recover through later transfers into savings.</Text>
        </View>
      )}
      <View style={ui.section}>
        <Text style={ui.label}>EXPENSES TO RECOVER</Text>
        {props.candidates.length ? (
          <ListGroup>
            {props.candidates.map((candidate) => (
              <ListRow
                key={candidate.journalEntryId}
                title={candidate.title}
                detail={`${candidate.accountingDate}${candidate.placeName ? ` · ${candidate.placeName}` : ""}`}
                value={formatMoney({ currency: props.currency, minorUnits: candidate.amountMinorUnits })}
                onPress={() => props.onStart(candidate)}
              />
            ))}
          </ListGroup>
        ) : (
          <Text style={ui.muted}>
            {props.plans.length
              ? "No more posted expenses are waiting to be recovered."
              : "Post an expense from Post money, then start Recovery from here."}
          </Text>
        )}
      </View>
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
  const ui = useUi();
  const limits = limitsCopy(props.currency, props.suggestion);
  const principal = formatMoney({
    currency: props.currency,
    minorUnits: props.candidate.amountMinorUnits,
  });
  return (
    <Screen>
      <Header
        title="Plan the recovery"
        eyebrow={props.candidate.title.toUpperCase()}
        onBack={props.canDismiss ? props.onBack : undefined}
      />
      <View style={ui.section}>
        <Text style={ui.muted}>Amount to replenish</Text>
        <Text style={ui.title}>{principal}</Text>
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
              detail={`${formatMoney({ currency: props.currency, minorUnits: preview.installmentMinorUnits })} each · ${formatMoney({ currency: props.currency, minorUnits: preview.premiumMinorUnits })} extra`}
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
      <Text style={ui.muted}>
        This suggestion does not move money. Activating the plan does not undo the original expense.
      </Text>
      <PrimaryButton
        label={props.busy ? "Activating…" : props.pending ? "Retry activation" : "Activate plan"}
        disabled={!props.canSubmit}
        pending={props.busy}
        onPress={props.onSave}
      />
    </Screen>
  );
}

export function RecoveryPlanScreen(props: {
  plan: RecoveryPlanView;
  onBack: () => void;
  onMove: () => void;
  onFind: () => void;
}) {
  const ui = useUi();
  const due = formatMoney({ currency: props.plan.currency, minorUnits: props.plan.dueMinorUnits });
  const remaining = formatMoney({ currency: props.plan.currency, minorUnits: props.plan.remainingMinorUnits });
  const complete = props.plan.remainingMinorUnits === 0;
  return (
    <Screen>
      <Header title="Savings Recovery" eyebrow={props.plan.title.toUpperCase()} onBack={props.onBack} />
      <View style={ui.section}>
        <Text style={ui.muted}>Recovered so far</Text>
        <Text style={ui.title}>
          {formatMoney({ currency: props.plan.currency, minorUnits: props.plan.recoveredMinorUnits })}
        </Text>
        <ProgressBar value={progressRatio(props.plan)} label={`${props.plan.title} recovery progress`} />
        <Text style={ui.muted}>{progressCopy(props.plan)}</Text>
      </View>
      <ListGroup>
        <ListRow title="Due this month" value={due} />
        <ListRow title="Remaining on the plan" value={remaining} />
        <ListRow title="Destination" value={props.plan.destinationName} />
        <ListRow title="Original plan" value={`${props.plan.installmentCount} months`} />
        <ListRow title="Implied monthly self-charge" value={formatRate(props.plan.impliedAnnualRateBps)} />
      </ListGroup>
      {!complete && (
        <PrimaryButton label="Move money" onPress={props.onMove} />
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
  const ui = useUi();
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
          value={formatMoney({ currency: props.plan.currency, minorUnits: props.plan.dueMinorUnits })}
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
