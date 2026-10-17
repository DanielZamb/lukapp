import type { FunctionReturnType } from "convex/server";
import type { api } from "../api";
import { formatMoney } from "../money";

type Evaluation = FunctionReturnType<typeof api.savingsRecovery.evaluate>;
export type RecoveryPlanView = Evaluation["plans"][number];
export type RecoveryCandidate = Evaluation["candidates"][number];
export type RecoveryPlace = Evaluation["destinations"][number];
export const INSTALLMENT_COUNTS = [4, 6, 8, 12] as const;
export const DEFAULT_INSTALLMENT_COUNT = 6;

export function minInstallment(principalMinorUnits: number, installmentCount: number) {
  return Math.ceil(principalMinorUnits / installmentCount);
}

export function suggestionFor(
  principalMinorUnits: number,
  installmentCount: number,
  installmentMinorUnits = minInstallment(principalMinorUnits, installmentCount),
) {
  const min = minInstallment(principalMinorUnits, installmentCount);
  const target = installmentMinorUnits * installmentCount;
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

export function progressRatio(plan: Pick<RecoveryPlanView, "recoveredMinorUnits" | "principalMinorUnits">) {
  return plan.principalMinorUnits === 0 ? 0 : plan.recoveredMinorUnits / plan.principalMinorUnits;
}

export function limitsCopy(
  currency: string,
  suggestion: ReturnType<typeof suggestionFor>,
) {
  const min = formatMoney({ currency, minorUnits: suggestion.minInstallmentMinorUnits });
  const max = formatMoney({ currency, minorUnits: suggestion.maxInstallmentMinorUnits });
  const extra = formatMoney({ currency, minorUnits: suggestion.premiumMinorUnits });
  return {
    range: `Each month must be at least ${min} and at most ${max}.`,
    extra: suggestion.premiumMinorUnits > 0
      ? `This schedule saves ${extra} extra.`
      : "This schedule replenishes the expense with no extra.",
    invalid: `Enter a monthly amount between ${min} and ${max}.`,
  };
}

export function progressCopy(plan: RecoveryPlanView) {
  const recovered = formatMoney({ currency: plan.currency, minorUnits: plan.recoveredMinorUnits });
  const principal = formatMoney({ currency: plan.currency, minorUnits: plan.principalMinorUnits });
  return `${recovered} of ${principal} moved back to savings`;
}
