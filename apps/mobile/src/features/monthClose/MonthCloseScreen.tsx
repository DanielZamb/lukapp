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
import { useT } from "../../i18n";
import { formatMoney } from "../money";
import {
  candidatesDetail,
  closedTitle,
  confirmDetail,
  draftsDetail,
  footerLabel,
  lockActionLabel,
  monthLabel,
  reviewEyebrow,
  type MonthCloseReadiness,
} from "./model";
import type { MonthClosePhase } from "./useMonthClose";

export function MonthCloseScreen({
  readiness,
  intakeWarning,
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
  intakeWarning?: string;
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
  const translator = useT();
  const { t, tn, language } = translator;
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
            {closedTitle(phase.period, translator)}
          </Text>
          <Text style={styles.completionCopy}>{t("review.closedDetail")}</Text>
          <PrimaryButton
            label={t("review.closeViewOverview", { month: monthLabel(phase.period, language) })}
            trailingIcon="pie-chart-outline"
            onPress={onOverview}
          />
          <SecondaryButton label={t("review.closeBackHome")} onPress={onHome} />
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
      monthLabel: monthLabel(phase.period, language),
    };
    return (
      <Screen>
        <Header
          title={footerLabel(display.period, translator)}
          eyebrow={reviewEyebrow(readiness, translator)}
          onBack={locking ? undefined : onBack}
        />
        {phase.kind === "failed" ? (
          <Text accessibilityRole="alert" style={ui.error}>
            {phase.message}
          </Text>
        ) : null}
        {intakeWarning ? <Text accessibilityRole="alert" style={ui.error}>{t("review.closeIntakeWarning", { warning: intakeWarning })}</Text> : null}
        <Text style={ui.body}>{confirmDetail(display, translator)}</Text>
        <PrimaryButton
          label={
            locking
              ? t("review.closeCompleting")
              : phase.kind === "failed"
                ? t("review.closeRetry")
                : lockActionLabel(display.period, translator)
          }
          trailingIcon="lock-closed-outline"
          pending={locking}
          disabled={locking}
          onPress={onConfirm}
        />
        {phase.kind === "confirm" ? (
          <SecondaryButton label={t("review.closeKeepReviewing")} onPress={onCancel} />
        ) : null}
      </Screen>
    );
  }
  if (readiness.periodStatus === "mismatch")
    return (
      <Screen>
        <Header title={footerLabel(readiness.period, translator)} onBack={onBack} />
        <Text accessibilityRole="alert" style={ui.error}>
          {t("review.closeMismatch")}
        </Text>
      </Screen>
    );
  return (
    <Screen>
      <Header
        title={footerLabel(readiness.period, translator)}
        eyebrow={reviewEyebrow(readiness, translator)}
        onBack={onBack}
      />
      {intakeWarning ? <Text accessibilityRole="alert" style={ui.error}>{t("review.closeIntakeWarning", { warning: intakeWarning })}</Text> : null}
      <View style={styles.amountCard}>
        <Text style={ui.muted}>{t("review.closeSpending", { month: readiness.monthLabel })}</Text>
        <Text style={styles.detailAmount}>
          {formatMoney({
            currency: summary.currency,
            minorUnits: summary.spendMinorUnits,
          })}
        </Text>
        <Text style={ui.muted}>{t("review.closeLocksNote")}</Text>
      </View>
      <ListGroup>
        {readiness.blocked ? (
          <ListRow
            title={t("review.closeDraftReview")}
            detail={draftsDetail(readiness.draftCount, translator)}
            value={t("review.closeRequired")}
            onPress={onReviewDrafts}
          />
        ) : null}
        <ListRow
          title={t("review.closeCandidates")}
          detail={candidatesDetail(readiness.candidateCount, translator)}
          value={readiness.candidateCount ? t("review.closeWarns") : t("review.closeDone")}
          valueStyle={{
            color: readiness.candidateCount ? theme.warning : theme.positive,
          }}
          onPress={readiness.candidateCount ? onReviewDrafts : undefined}
        />
        <ListRow
          title={t("review.closeBalances")}
          detail={tn("review.closeAccountsChecked", summary.accountCount)}
          value={t("review.closeReviewed")}
          valueStyle={{ color: theme.positive }}
          onPress={onAccountBalances}
        />
        <ListRow
          title={t("review.closeRecovery")}
          detail={
            summary.recoveryDueMinorUnits > 0
              ? t("review.closeRecoveryDue", { amount: formatMoney({
                  currency: summary.currency,
                  minorUnits: summary.recoveryDueMinorUnits,
                }) })
              : t("review.closeRecoveryNone")
          }
          value={t("review.closeReview")}
          onPress={onRecovery}
        />
      </ListGroup>
      <PrimaryButton
        label={
          readiness.blocked
            ? t("review.closeReviewDraftsFirst")
            : lockActionLabel(readiness.period, translator)
        }
        trailingIcon={
          readiness.blocked ? "document-text-outline" : "lock-closed-outline"
        }
        onPress={readiness.blocked ? onReviewDrafts : onRequest}
      />
      <Text style={styles.footnote}>{t("review.closeFootnote")}</Text>
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

