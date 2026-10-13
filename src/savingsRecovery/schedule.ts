import { nextPeriod, periodFromAccountingDate, firstDayOf } from "../accounting/period";
import { minor, RecoveryError, total } from "./amounts";
import type { FrozenCommitment, PlanTerms } from "./types";

export function freezeSchedule(terms: PlanTerms, activatedOn: string, activatedAt: number): FrozenCommitment {
  const principalMinor = total(terms.sources.map(source => source.principalMinor));
  minor(principalMinor, true);
  const amount = minor(terms.installmentAmountMinor, true);
  const count = terms.installmentCount;
  if (!Number.isInteger(count) || count < 1 || count > 600) throw new RecoveryError("recovery_installment_count_invalid");
  const goal = minor(Number(BigInt(count) * BigInt(amount)));
  if (goal < principalMinor) throw new RecoveryError("recovery_installment_below_principal");
  const presentValue = (rate: number) => rate === 0 ? goal : amount * -Math.expm1(-count * Math.log1p(rate)) / rate;
  let low = 0;
  let high = amount / principalMinor;
  for (let step = 0; step < 100; step++) {
    const middle = (low + high) / 2;
    if (presentValue(middle) > principalMinor) low = middle;
    else high = middle;
  }
  const impliedMonthlyRate = goal === principalMinor ? 0 : (low + high) / 2;
  let period = periodFromAccountingDate(activatedOn);
  let recovered = 0;
  const schedule = [];
  for (let index = 0; index < count; index++) {
    const remainingCount = count - index - 1;
    const balance = impliedMonthlyRate === 0 ? remainingCount * amount :
      amount * -Math.expm1(-remainingCount * Math.log1p(impliedMonthlyRate)) / impliedMonthlyRate;
    const cumulative = index === count - 1 ? principalMinor : Math.round(principalMinor - balance);
    const principal = cumulative - recovered;
    minor(principal);
    if (principal > amount || period.year > 9999) throw new RecoveryError("recovery_schedule_invalid");
    schedule.push({ month: firstDayOf(period).slice(0, 7), amountMinor: amount, principalMinor: principal, premiumMinor: amount - principal });
    recovered = cumulative;
    period = nextPeriod(period);
  }
  return { activatedOn, activatedAt, principalMinor, impliedMonthlyRate, schedule };
}
