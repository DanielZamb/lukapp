import { requireWorkspace } from "../accounting/membership";
import { periodFromAccountingDate } from "../accounting/period";
import type { Actor } from "../accounting/types";
import { minor, RecoveryError, text, total } from "./amounts";
import { countedAllocations, paidFor, planStatus, sourcePaid } from "./progress";
import type { AvailableCashInput, RecoveryLedger, RecoveryReadStore } from "./types";

type QueryInput = { actor: Actor; workspaceId: string };
export function createRecoveryQueries(store: RecoveryReadStore, ledger: RecoveryLedger, now: () => number = Date.now) {
  async function state(input: QueryInput, asKnownAt: number | undefined = undefined, throughDate = "9999-12-31") {
    const readAt = now();
    const isCurrent = asKnownAt === undefined || asKnownAt === readAt;
    asKnownAt ??= readAt;
    const workspace = await requireWorkspace(ledger, input.workspaceId, input.actor);
    if (workspace.kind !== "Personal" && workspace.kind !== "Household") throw new RecoveryError("recovery_workspace_ineligible");
    if (!Number.isFinite(asKnownAt) || asKnownAt < 0 || asKnownAt > readAt) throw new RecoveryError("recovery_recording_time_invalid");
    const stored = await store.snapshot(input.workspaceId);
    const snapshot = { ...stored, plans: isCurrent ? stored.plans : stored.plans.filter(plan =>
      plan.state.kind === "Activated" && plan.state.commitment.activatedAt <= asKnownAt) };
    const counted = await countedAllocations(ledger, snapshot, asKnownAt, throughDate);
    const all = [...counted.verified, ...counted.declared];
    const plans = await Promise.all(snapshot.plans.map(async plan => ({
      plan, status: await planStatus(ledger, snapshot, plan, all, asKnownAt),
      verified: paidFor(plan.id, counted.verified), declaredBaseline: paidFor(plan.id, counted.declared),
    })));
    return { workspace, snapshot, counted, all, plans, asKnownAt, isCurrent };
  }
  return {
    async progress(input: QueryInput & { asKnownAt?: number }) {
      const result = await state(input, input.asKnownAt);
      const balances = result.isCurrent ? await ledger.balances(input) : [];
      return { currency: result.workspace.functionalCurrency, asKnownAt: result.asKnownAt,
        plans: result.plans.map(item => ({ ...item, destinationBalance: balances.find(balance =>
          balance.financialAccountProfileId === item.plan.terms.destinationProfileId)?.balance ?? null })),
        contributions: result.counted.contributions.map(item => ({ ...item.event, voided: item.voided, corrected: item.corrected })),
        history: result.snapshot.events.filter(event => event.recordedAt <= result.asKnownAt),
      };
    },
    async listCandidates(input: QueryInput & { from: string; through: string }) {
      const result = await state(input);
      const expenses = await ledger.expenses(input);
      return expenses.map(expense => {
        const decision = result.snapshot.events.filter(event => event.data.kind === "candidateDecision" && event.data.entryId === expense.entryId).at(-1);
        const recoveredPrincipalMinor = sourcePaid(expense.entryId, result.all);
        const reservedBy = result.plans.find(item => (item.status.kind === "Active" || item.status.kind === "Suspended") &&
          item.plan.terms.sources.some(source => source.entryId === expense.entryId))?.plan.id ?? null;
        return { expense, decision: decision?.data.kind === "candidateDecision" ? decision.data.decision : "eligible" as const,
          recoveredPrincipalMinor, remainingEligibleMinor: expense.reversal ? 0 : Math.max(0, expense.currentEligibleAmount.minorUnits - recoveredPrincipalMinor), reservedBy };
      });
    },
    async monthlyWaterfall(input: QueryInput & { month: string; cash: AvailableCashInput; includePrepayment: boolean }) {
      periodFromAccountingDate(`${input.month}-01`);
      const monthEnd = new Date(`${input.month}-01T00:00:00.000Z`);
      monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
      monthEnd.setUTCDate(0);
      const throughDate = monthEnd.toISOString().slice(0, 10);
      const result = await state(input, undefined, throughDate);
      const protections = input.cash.protections;
      text(protections.provenance);
      const protectedMinor = total([protections.essentialSpendingMinor, protections.taxesMinor,
        protections.requiredReservesMinor, protections.externalObligationsMinor]);
      let availableMinor: number;
      let ledgerCashMinor: number | null = null;
      const selectedBalances = [];
      if (input.cash.kind === "entered") {
        availableMinor = minor(input.cash.availableMinor);
        text(input.cash.attestation);
      } else {
        if (!input.cash.liquidProfileIds.length || new Set(input.cash.liquidProfileIds).size !== input.cash.liquidProfileIds.length)
          throw new RecoveryError("recovery_cash_profiles_invalid");
        const balances = await ledger.balances(input);
        for (const id of input.cash.liquidProfileIds) {
          const balance = balances.find(balance => balance.financialAccountProfileId === id);
          if (!balance || balance.nature !== "Asset") throw new RecoveryError("recovery_cash_profile_ineligible");
          selectedBalances.push(balance);
        }
        const sum = selectedBalances.reduce((sum, balance) => sum + BigInt(balance.balance.minorUnits), 0n);
        const safe = Number(sum);
        if (!Number.isSafeInteger(safe)) throw new RecoveryError("recovery_amount_invalid");
        ledgerCashMinor = safe;
        availableMinor = Math.max(0, safe - protectedMinor);
      }
      type Due = { planId: string; installmentIndex: number; month: string; outstandingMinor: number };
      const shortfalls: Due[] = [];
      const current: Due[] = [];
      const prepayment: Due[] = [];
      for (const item of result.plans) {
        if (item.status.kind !== "Active" || item.plan.state.kind !== "Activated") continue;
        for (const [index, installment] of item.plan.state.commitment.schedule.entries()) {
          const paid = total(result.all.filter(allocation => allocation.planId === item.plan.id).flatMap(allocation => allocation.installments)
            .filter(allocation => allocation.installmentIndex === index).map(allocation => total([allocation.principalMinor, allocation.premiumMinor])));
          const outstandingMinor = minor(installment.amountMinor - paid);
          if (outstandingMinor === 0) continue;
          const row = { planId: item.plan.id, installmentIndex: index, month: installment.month, outstandingMinor };
          if (installment.month < input.month) shortfalls.push(row);
          else if (installment.month === input.month) current.push(row);
          else prepayment.push(row);
        }
      }
      const ordered = (rows: Due[]) => rows.sort((a, b) => a.month.localeCompare(b.month) || a.planId.localeCompare(b.planId) || a.installmentIndex - b.installmentIndex);
      let cash = availableMinor;
      const fund = <Row extends { outstandingMinor: number }>(rows: Row[]) => rows.map(row => {
        const allocatedMinor = Math.min(cash, row.outstandingMinor);
        cash -= allocatedMinor;
        return { ...row, allocatedMinor };
      });
      const combinedRecoveryPaymentMinor = total([...shortfalls, ...current].map(row => row.outstandingMinor));
      const shortfallFunding = fund(ordered(shortfalls));
      const currentFunding = fund(ordered(current));
      const expenses = await ledger.expenses({ ...input, from: "0100-01-01", through: throughDate });
      const candidates = expenses.filter(expense => !expense.reversal).filter(expense => {
        const decision = result.snapshot.events.filter(event => event.data.kind === "candidateDecision" && event.data.entryId === expense.entryId).at(-1);
        return (!decision || (decision.data.kind === "candidateDecision" && decision.data.decision === "eligible")) &&
          !result.plans.some(item => (item.status.kind === "Active" || item.status.kind === "Suspended") &&
            item.plan.terms.sources.some(source => source.entryId === expense.entryId));
      }).sort((a, b) => a.accountingDate.localeCompare(b.accountingDate) || a.entryId.localeCompare(b.entryId))
        .map(expense => ({ entryId: expense.entryId, outstandingMinor: Math.max(0, expense.currentEligibleAmount.minorUnits - sourcePaid(expense.entryId, result.all)) }));
      const candidateFunding = fund(candidates);
      const prepaymentFunding = input.includePrepayment ? fund(ordered(prepayment)) : [];
      return { month: input.month, currency: result.workspace.functionalCurrency,
        availableCash: { mode: input.cash.kind, availableMinor, ledgerCashMinor, selectedBalances, protectedMinor,
          protectionInputs: protections, attestation: input.cash.kind === "entered" ? input.cash.attestation : null,
          coverage: "user-declared-protections-only" as const, unmodeledObligationsProtected: false as const },
        combinedRecoveryPaymentMinor, shortfalls: shortfallFunding, currentInstallments: currentFunding,
        expenseRecovery: candidateFunding, prepayment: prepaymentFunding, ordinarySavingMinor: cash,
      };
    },
  };
}
