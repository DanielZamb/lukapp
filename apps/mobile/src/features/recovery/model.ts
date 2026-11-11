import type { FunctionReturnType } from "convex/server";
import { formatDayMonth, formatMonthName, type Translator } from "../../i18n";
import type { api } from "../api";
import { formatMoney } from "../money";

type Evaluation = FunctionReturnType<typeof api.savingsRecovery.evaluate>;
export type RecoveryPlanView = Evaluation["plans"][number];
export type RecoveryCandidate = Evaluation["candidates"][number];
export type RecoveryPlace = Evaluation["destinations"][number];
export const INSTALLMENT_COUNTS = [4, 6, 8, 12] as const;
export const DEFAULT_INSTALLMENT_COUNT = 4;

export function recoveryMoney(amount: Parameters<typeof formatMoney>[0]) {
  return formatMoney(amount, { hideZeroDecimals: true });
}

export function recoveryMonthName(month: string, { language }: Pick<Translator, "language">) {
  return formatMonthName(language, new Date(`${month}-01T12:00:00Z`), { timeZone: "UTC", capitalize: false });
}

export function candidateDetail(
  candidate: Pick<RecoveryCandidate, "accountingDate" | "placeName">,
  { t, language }: Pick<Translator, "t" | "language">,
) {
  const date = formatDayMonth(language, new Date(`${candidate.accountingDate}T12:00:00Z`), "UTC");
  return candidate.placeName ? t("recovery.candidateDetail", { date, place: candidate.placeName }) : date;
}

export function plansDoorDetail(
  plans: readonly Pick<RecoveryPlanView, "title" | "remainingMinorUnits" | "status">[],
  { t, tn }: Pick<Translator, "t" | "tn">,
) {
  const activePlans = plans.filter((plan) => plan.status === "active" && plan.remainingMinorUnits > 0);
  if (activePlans.length === 0) return t("recovery.doorRecoveryEmpty");
  if (activePlans.length === 1) return activePlans[0].title;
  return tn("recovery.doorRecoveryPlans", activePlans.length);
}

export function minInstallment(principalMinorUnits: number, installmentCount: number) {
  return Math.floor(principalMinorUnits / installmentCount);
}

export function suggestionFor(
  principalMinorUnits: number,
  installmentCount: number,
  installmentMinorUnits = minInstallment(principalMinorUnits, installmentCount),
) {
  const min = minInstallment(principalMinorUnits, installmentCount);
  const even = installmentMinorUnits * installmentCount;
  const target = even < principalMinorUnits ? principalMinorUnits : even;
  return {
    installmentMinorUnits,
    minInstallmentMinorUnits: min,
    maxInstallmentMinorUnits: principalMinorUnits,
    premiumMinorUnits: target - principalMinorUnits,
    targetMinorUnits: target,
    valid: installmentMinorUnits >= min && installmentMinorUnits <= principalMinorUnits,
  };
}

export function formatRate(bps: number) {
  return `${(bps / 100).toFixed(1)}%`;
}

export function progressRatio(plan: Pick<RecoveryPlanView, "recoveredMinorUnits" | "targetMinorUnits">) {
  return plan.targetMinorUnits === 0 ? 0 : plan.recoveredMinorUnits / plan.targetMinorUnits;
}

export function limitsCopy(
  currency: string,
  suggestion: ReturnType<typeof suggestionFor>,
  t: Translator["t"],
) {
  const min = recoveryMoney({ currency, minorUnits: suggestion.minInstallmentMinorUnits });
  const max = recoveryMoney({ currency, minorUnits: suggestion.maxInstallmentMinorUnits });
  const extra = recoveryMoney({ currency, minorUnits: suggestion.premiumMinorUnits });
  return {
    range: t("recovery.limitsRange", { min, max }),
    extra: suggestion.premiumMinorUnits > 0
      ? t("recovery.limitsExtra", { extra })
      : t("recovery.limitsNoExtra"),
    invalid: t("recovery.limitsInvalid", { min, max }),
  };
}

export function progressCopy(plan: RecoveryPlanView, t: Translator["t"]) {
  const recovered = recoveryMoney({ currency: plan.currency, minorUnits: plan.recoveredMinorUnits });
  const target = recoveryMoney({ currency: plan.currency, minorUnits: plan.targetMinorUnits });
  return plan.status === "suspended"
    ? t("recovery.progressSuspended", { recovered })
    : t("recovery.progress", { recovered, target });
}

export function movedCopy(input: {
  currency: string;
  title: string;
  movedMinorUnits: number;
  countedMinorUnits: number;
  recoveredMinorUnits: number;
  targetMinorUnits: number;
}, t: Translator["t"]) {
  const percent = Math.round(progressRatio({
    recoveredMinorUnits: input.recoveredMinorUnits,
    targetMinorUnits: input.targetMinorUnits,
  }) * 100);
  if (input.movedMinorUnits === input.countedMinorUnits) {
    return t("recovery.movedProgress", { title: input.title, percent });
  }
  const counted = recoveryMoney({ currency: input.currency, minorUnits: input.countedMinorUnits });
  return t("recovery.movedCounted", { counted, title: input.title, percent });
}

export type RecoveryContribution = RecoveryPlanView["contributionHistory"][number];
export const REASON_LIMIT = 1000;

export function isCancellable(plan: Pick<RecoveryPlanView, "canCancel">) {
  return plan.canCancel;
}

export function isEnded(plan: Pick<RecoveryPlanView, "status">) {
  return plan.status === "cancelled" || plan.status === "completed";
}

export function openCancelledPlan(plans: RecoveryPlanView[], sourceJournalEntryId: string) {
  return plans.find((plan) => plan.status === "cancelled" && !plan.replacedByPlanId
    && plan.sourceJournalEntryId === sourceJournalEntryId) ?? null;
}

export function correctionTargets(
  plans: RecoveryPlanView[],
  from: RecoveryPlanView,
  contribution: Pick<RecoveryContribution, "amountMinorUnits" | "contributionDate">,
) {
  return plans.filter((plan) => plan.id !== from.id
    && plan.sourceJournalEntryId !== from.sourceJournalEntryId
    && plan.acceptsContributions
    && plan.destinationFinancialAccountProfileId === from.destinationFinancialAccountProfileId
    && plan.remainingMinorUnits >= contribution.amountMinorUnits
    && plan.activationMonth <= contribution.contributionDate.slice(0, 7));
}

export function contributionsNewestFirst(history: RecoveryContribution[]) {
  return history.slice().sort((a, b) => b.contributionDate.localeCompare(a.contributionDate)
    || b.recordedAt - a.recordedAt || b.id.localeCompare(a.id));
}
