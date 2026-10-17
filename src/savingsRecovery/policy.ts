import type { RecoverySuggestion } from "./types";

export class RecoveryError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export const INSTALLMENT_COUNTS = [4, 6, 8, 12] as const;
export const DEFAULT_INSTALLMENT_COUNT = 6;

export function requireMonth(month: string) {
  if (!/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new RecoveryError("month_invalid");
}

export function currentRecoveryMonth(now: number) {
  return new Date(now).toISOString().slice(0, 7);
}

export function requireIdempotencyKey(key: string) {
  if (!key.trim() || key.length > 200) throw new RecoveryError("idempotency_key_invalid");
}

export function requirePositiveAmount(minorUnits: number) {
  if (!Number.isSafeInteger(minorUnits) || minorUnits <= 0)
    throw new RecoveryError("amount_must_be_positive");
  return minorUnits;
}

export function minInstallment(principalMinorUnits: number, installmentCount: number) {
  return Math.ceil(principalMinorUnits / installmentCount);
}

function paymentFromMonthlyRate(principal: number, monthlyRate: number, count: number) {
  if (monthlyRate === 0) return principal / count;
  const growth = (1 + monthlyRate) ** count;
  return (principal * monthlyRate * growth) / (growth - 1);
}

export function impliedAnnualRateBps(
  principalMinorUnits: number,
  installmentCount: number,
  installmentMinorUnits: number,
) {
  const target = installmentMinorUnits * installmentCount;
  if (target === principalMinorUnits) return 0;
  let low = 0;
  let high = 10;
  for (let step = 0; step < 64; step += 1) {
    const mid = (low + high) / 2;
    if (paymentFromMonthlyRate(principalMinorUnits, mid, installmentCount) > installmentMinorUnits)
      high = mid;
    else low = mid;
  }
  return Math.round(12 * ((low + high) / 2) * 10_000);
}

export function suggestContribution(input: {
  principalMinorUnits: number;
  installmentCount: number;
  installmentMinorUnits?: number;
}): RecoverySuggestion {
  const principal = requirePositiveAmount(input.principalMinorUnits);
  if (!Number.isSafeInteger(input.installmentCount) ||
    !INSTALLMENT_COUNTS.includes(input.installmentCount as (typeof INSTALLMENT_COUNTS)[number]))
    throw new RecoveryError("installment_count_invalid");
  const min = minInstallment(principal, input.installmentCount);
  const installment = input.installmentMinorUnits ?? min;
  requirePositiveAmount(installment);
  if (installment < min) throw new RecoveryError("installment_below_minimum");
  if (installment > principal) throw new RecoveryError("installment_above_principal");
  const target = installment * input.installmentCount;
  return {
    principalMinorUnits: principal,
    installmentCount: input.installmentCount,
    installmentMinorUnits: installment,
    minInstallmentMinorUnits: min,
    maxInstallmentMinorUnits: principal,
    impliedAnnualRateBps: impliedAnnualRateBps(principal, input.installmentCount, installment),
    premiumMinorUnits: target - principal,
    targetMinorUnits: target,
  };
}
