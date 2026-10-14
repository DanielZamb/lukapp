import { minor, proportional, RecoveryError, total } from "./amounts";
import { remainingSources } from "./progress";
import type { ContributionAllocation, InstallmentAllocation, Plan } from "./types";

export function allocate(plan: Plan, amount: number, paid: ContributionAllocation[], contributionDate: string): ContributionAllocation {
  if (plan.state.kind !== "Activated") throw new RecoveryError("recovery_plan_inactive");
  let remaining = minor(amount, true);
  const installments: InstallmentAllocation[] = [];
  for (const [index, installment] of plan.state.commitment.schedule.entries()) {
    const prior = paid.filter(allocation => allocation.planId === plan.id).flatMap(allocation => allocation.installments)
      .filter(allocation => allocation.installmentIndex === index);
    const principalRemaining = installment.principalMinor - total(prior.map(allocation => allocation.principalMinor));
    const premiumRemaining = installment.premiumMinor - total(prior.map(allocation => allocation.premiumMinor));
    const applied = Math.min(remaining, total([principalRemaining, premiumRemaining]));
    if (applied === 0) continue;
    const split = proportional(applied, [
      { component: "principal", remaining: principalRemaining },
      { component: "premium", remaining: premiumRemaining },
    ], part => part.remaining);
    const principal = total(split.filter(share => share.part.component === "principal").map(share => share.amountMinor));
    const premium = total(split.filter(share => share.part.component === "premium").map(share => share.amountMinor));
    installments.push({ installmentIndex: index, principalMinor: principal, premiumMinor: premium,
      prepayment: installment.month > contributionDate.slice(0, 7) });
    remaining -= applied;
    if (remaining === 0) break;
  }
  if (remaining !== 0) throw new RecoveryError("recovery_capacity_exceeded");
  const principalMinor = total(installments.map(item => item.principalMinor));
  const premiumMinor = total(installments.map(item => item.premiumMinor));
  const sources = remainingSources(plan, paid);
  const shares = proportional(principalMinor, sources, source => source.principalMinor);
  return { planId: plan.id, amountMinor: amount, principalMinor, premiumMinor, installments,
    sources: shares.map(({ part, amountMinor }) => ({ entryId: part.entryId, principalMinor: amountMinor })) };
}
