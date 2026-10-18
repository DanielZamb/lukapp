import type { Theme } from "../../ui/tokens";
import { useMemo } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import {
  Header,
  ListGroup,
  ListRow,
  PrimaryButton,
  Screen,
  SecondaryButton,
  useTheme,
  useUi,
} from "../../ui/core";
import { font, fontSize, radius, spacing } from "../../ui/tokens";
import { formatMoney } from "../money";
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
  summary,
  phase,
  onBack,
  onReviewDrafts,
  onAccountBalances,
  onOverview,
  onRecovery,
  onHome,
  onRequest,
  onCancel,
  onConfirm,
}: {
  readiness: MonthCloseReadiness;
  summary: {
    currency: string;
    spendMinorUnits: number;
    accountCount: number;
    recoveryDueMinorUnits: number;
  };
  phase: MonthClosePhase;
  onBack: () => void;
  onReviewDrafts: () => void;
  onAccountBalances: () => void;
  onOverview: () => void;
  onRecovery: () => void;
  onHome: () => void;
  onRequest: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const theme = useTheme();
  const ui = useUi();
  const styles = useMemo(() => createStyles(theme), [theme]);
  if (phase.kind === "closed")
    return (
      <Screen contentStyle={styles.completionContent}>
        <View style={styles.completion}>
          <View style={styles.completionIcon}>
            <Ionicons
              name="lock-closed"
              size={28}
              color={theme.primaryForeground}
            />
          </View>
          <Text accessibilityRole="header" style={styles.completionTitle}>
            {closedTitle(phase.period)}
          </Text>
          <Text style={styles.completionCopy}>{closedDetail()}</Text>
          <PrimaryButton
            label={`View ${monthLabel(phase.period)} overview`}
            trailingIcon="pie-chart-outline"
            onPress={onOverview}
          />
          <SecondaryButton label="Back home" onPress={onHome} />
        </View>
      </Screen>
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
          eyebrow={reviewEyebrow(readiness)}
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
        <Header title={`Complete ${readiness.monthLabel}`} onBack={onBack} />
        <Text accessibilityRole="alert" style={ui.error}>
          {mismatchDetail()}
        </Text>
      </Screen>
    );
  return (
    <Screen>
      <Header
        title={`Complete ${readiness.monthLabel}`}
        eyebrow={reviewEyebrow(readiness)}
        onBack={onBack}
      />
      <View style={styles.amountCard}>
        <Text style={ui.muted}>{readiness.monthLabel} spending</Text>
        <Text style={styles.detailAmount}>
          {formatMoney({
            currency: summary.currency,
            minorUnits: summary.spendMinorUnits,
          })}
        </Text>
        <Text style={ui.muted}>
          This review locks the month; it does not move money or change balances.
        </Text>
      </View>
      <ListGroup>
        {readiness.blocked ? (
          <ListRow
            title="Draft review"
            detail={draftsDetail(readiness.draftCount)}
            value="Required"
            onPress={onReviewDrafts}
          />
        ) : null}
        <ListRow
          title="Notification Candidates"
          detail={candidatesDetail(readiness.candidateCount)}
          value={readiness.candidateCount ? "Warns" : "Done"}
          valueStyle={{
            color: readiness.candidateCount ? theme.warning : theme.positive,
          }}
          onPress={readiness.candidateCount ? onReviewDrafts : undefined}
        />
        <ListRow
          title="Account balances"
          detail={`${summary.accountCount} Financial Accounts checked`}
          value="Reviewed"
          valueStyle={{ color: theme.positive }}
          onPress={onAccountBalances}
        />
        <ListRow
          title="Savings recovery"
          detail={
            summary.recoveryDueMinorUnits > 0
              ? `${formatMoney({
                  currency: summary.currency,
                  minorUnits: summary.recoveryDueMinorUnits,
                })} due this month`
              : "Nothing due this month"
          }
          value="Review"
          onPress={onRecovery}
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
      <Text style={styles.footnote}>
        Remaining Candidates warn. They do not block Month Close. If recovery is
        not funded, the close records a planning shortfall; it never fabricates a
        transfer.
      </Text>
    </Screen>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
  amountCard: {
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: theme.secondary,
    borderWidth: 1,
    borderColor: theme.border,
  },
  detailAmount: {
    color: theme.foreground,
    fontSize: 30,
    lineHeight: 36,
    fontFamily: font.extrabold,
    letterSpacing: -0.6,
  },
  footnote: {
    color: theme.mutedForeground,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: font.regular,
    textAlign: "center",
  },
  completionContent: { justifyContent: "center" },
  completion: { alignItems: "center", gap: spacing.xl },
  completionIcon: {
    width: 68,
    height: 68,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.primary,
  },
  completionTitle: {
    color: theme.foreground,
    fontSize: 30,
    lineHeight: 36,
    fontFamily: font.extrabold,
    textAlign: "center",
  },
  completionCopy: {
    maxWidth: 340,
    color: theme.mutedForeground,
    fontSize: fontSize.body,
    lineHeight: 24,
    fontFamily: font.regular,
    textAlign: "center",
  },
  });
}

