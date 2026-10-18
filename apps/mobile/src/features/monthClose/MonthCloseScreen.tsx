import { Text } from "react-native";
import { ConfirmationScreen, Header, ListGroup, ListRow, PrimaryButton, Screen, SecondaryButton, useUi } from "../../ui/core";
import {
  candidatesDetail,
  closedDetail,
  closedTitle,
  confirmDetail,
  draftsDetail,
  lockActionLabel,
  mismatchDetail,
  monthLabel,
  reviewEyebrow,
  type MonthCloseReadiness,
} from "./model";
import type { MonthClosePhase } from "./useMonthClose";

export function MonthCloseScreen({
  readiness,
  phase,
  onBack,
  onReviewDrafts,
  onRequest,
  onCancel,
  onConfirm,
}: {
  readiness: MonthCloseReadiness;
  phase: MonthClosePhase;
  onBack: () => void;
  onReviewDrafts: () => void;
  onRequest: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ui = useUi();
  if (phase.kind === "closed")
    return (
      <ConfirmationScreen
        title={closedTitle(phase.period)}
        detail={closedDetail()}
        buttonLabel="Back to Drafts"
        onContinue={onReviewDrafts}
      />
    );
  const locking = phase.kind === "locking";
  const confirming =
    phase.kind === "confirm" || locking || phase.kind === "failed";
  if (confirming) {
    const display = {
      ...readiness,
      period: phase.period,
      monthLabel: monthLabel(phase.period),
    };
    return (
      <Screen>
        <Header
          title={`Complete ${display.monthLabel}`}
          eyebrow={reviewEyebrow(readiness.blocked)}
          onBack={locking ? undefined : onBack}
        />
        {phase.kind === "failed" ? (
          <Text accessibilityRole="alert" style={ui.error}>
            {phase.message}
          </Text>
        ) : null}
        <Text style={ui.body}>{confirmDetail(display)}</Text>
        <PrimaryButton
          label={
            locking
              ? "Completing…"
              : phase.kind === "failed"
                ? "Retry close"
                : lockActionLabel(display.period)
          }
          trailingIcon="lock-closed-outline"
          pending={locking}
          disabled={locking}
          onPress={onConfirm}
        />
        {phase.kind === "confirm" ? (
          <SecondaryButton label="Keep reviewing" onPress={onCancel} />
        ) : null}
      </Screen>
    );
  }
  if (readiness.periodStatus === "mismatch")
    return (
      <Screen>
        <Header
          title={`Complete ${readiness.monthLabel}`}
          onBack={onBack}
        />
        <Text accessibilityRole="alert" style={ui.error}>
          {mismatchDetail()}
        </Text>
      </Screen>
    );
  return (
    <Screen>
      <Header
        title={`Complete ${readiness.monthLabel}`}
        eyebrow={reviewEyebrow(readiness.blocked)}
        onBack={onBack}
      />
      <Text style={ui.muted}>
        This review locks {readiness.monthLabel}. It does not move money or
        change balances.
      </Text>
      <ListGroup>
        <ListRow
          title="Draft review"
          detail={draftsDetail(readiness.draftCount)}
          value={readiness.blocked ? "Required" : "Done"}
          onPress={readiness.blocked ? onReviewDrafts : undefined}
        />
        <ListRow
          title="Candidates"
          detail={candidatesDetail(readiness.candidateCount)}
          value={readiness.candidateCount ? "Later" : "Done"}
        />
      </ListGroup>
      <PrimaryButton
        label={
          readiness.blocked
            ? "Review Drafts first"
            : lockActionLabel(readiness.period)
        }
        trailingIcon={
          readiness.blocked ? "document-text-outline" : "lock-closed-outline"
        }
        onPress={readiness.blocked ? onReviewDrafts : onRequest}
      />
    </Screen>
  );
}

