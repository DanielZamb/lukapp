import { v } from "convex/values";
import { accountBalance, money, postedExpense } from "./validators";

export const sourceAllocation = v.object({ entryId: v.string(), principalMinor: v.number() });
export const planTerms = v.object({ name: v.string(), destinationProfileId: v.string(), sources: v.array(sourceAllocation),
  installmentCount: v.number(), installmentAmountMinor: v.number() });
export const installment = v.object({ month: v.string(), amountMinor: v.number(), principalMinor: v.number(), premiumMinor: v.number() });
export const commitment = v.object({ activatedOn: v.string(), activatedAt: v.number(), principalMinor: v.number(),
  impliedMonthlyRate: v.number(), schedule: v.array(installment) });
export const planState = v.union(v.object({ kind: v.literal("Draft") }), v.object({ kind: v.literal("Activated"), commitment }));
export const planFields = { workspaceId: v.string(), revision: v.number(), terms: planTerms, replacesPlanId: v.union(v.string(), v.null()), state: planState };
export const plan = v.object({ id: v.string(), ...planFields });
export const installmentAllocation = v.object({ installmentIndex: v.number(), principalMinor: v.number(), premiumMinor: v.number(), prepayment: v.boolean() });
export const contributionAllocation = v.object({ planId: v.string(), amountMinor: v.number(), principalMinor: v.number(), premiumMinor: v.number(),
  installments: v.array(installmentAllocation), sources: v.array(sourceAllocation) });
export const allocationIntent = v.object({ planId: v.string(), amountMinor: v.number() });
export const candidateDecision = v.union(v.literal("eligible"), v.literal("deferred"), v.literal("excluded"));
export const proposalDecision = v.union(v.literal("accepted"), v.literal("rejected"));
export const eventData = v.union(
  v.object({ kind: v.literal("candidateDecision"), entryId: v.string(), decision: candidateDecision }),
  v.object({ kind: v.literal("cancelled"), planId: v.string(), reason: v.string() }),
  v.object({ kind: v.literal("suspended"), planId: v.string(), entryIds: v.array(v.string()) }),
  v.object({ kind: v.literal("contribution"), transferEntryId: v.string(), contributionDate: v.string(), allocations: v.array(contributionAllocation),
    intent: v.union(v.literal("explicit"), v.literal("acceptedProposal")), proposalId: v.union(v.string(), v.null()) }),
  v.object({ kind: v.literal("contributionReversal"), contributionId: v.string(), reason: v.string() }),
  v.object({ kind: v.literal("proposal"), transferEntryId: v.string(), allocations: v.array(allocationIntent), importReference: v.string() }),
  v.object({ kind: v.literal("proposalDecision"), proposalId: v.string(), decision: proposalDecision, contributionId: v.union(v.string(), v.null()) }),
  v.object({ kind: v.literal("openingProgress"), planId: v.string(), throughDate: v.string(), provenance: v.string(), evidenceUnavailable: v.literal(true), allocation: contributionAllocation }),
);
export const eventFields = { workspaceId: v.string(), recordedAt: v.number(), actorId: v.string(), data: eventData };
export const event = v.object({ id: v.string(), ...eventFields });
export const protections = v.object({ essentialSpendingMinor: v.number(), taxesMinor: v.number(), requiredReservesMinor: v.number(), externalObligationsMinor: v.number(), provenance: v.string() });
export const cashInput = v.union(
  v.object({ kind: v.literal("computed"), liquidProfileIds: v.array(v.string()), protections }),
  v.object({ kind: v.literal("entered"), availableMinor: v.number(), protections, attestation: v.string() }),
);
const paid = v.object({ amountMinor: v.number(), principalMinor: v.number(), premiumMinor: v.number() });
export const progressResult = v.object({ currency: v.string(), asKnownAt: v.number(),
  plans: v.array(v.object({ plan, status: v.object({ kind: v.union(v.literal("Draft"), v.literal("Active"), v.literal("Completed"), v.literal("Suspended"), v.literal("Cancelled")), unsupportedEntryIds: v.array(v.string()) }),
    verified: paid, declaredBaseline: paid, destinationBalance: v.union(money, v.null()) })),
  contributions: v.array(v.object({ id: v.string(), ...eventFields, voided: v.boolean(), corrected: v.boolean() })), history: v.array(event),
});
export const candidatesResult = v.array(v.object({ expense: postedExpense, decision: candidateDecision,
  recoveredPrincipalMinor: v.number(), remainingEligibleMinor: v.number(), reservedBy: v.union(v.string(), v.null()) }));
const fundedInstallment = v.object({ planId: v.string(), installmentIndex: v.number(), month: v.string(), outstandingMinor: v.number(), allocatedMinor: v.number() });
export const waterfallResult = v.object({ month: v.string(), currency: v.string(),
  availableCash: v.object({ mode: v.union(v.literal("entered"), v.literal("computed")), availableMinor: v.number(), ledgerCashMinor: v.union(v.number(), v.null()), selectedBalances: v.array(accountBalance), protectedMinor: v.number(),
    protectionInputs: protections, attestation: v.union(v.string(), v.null()), coverage: v.literal("user-declared-protections-only"), unmodeledObligationsProtected: v.literal(false) }),
  combinedRecoveryPaymentMinor: v.number(), shortfalls: v.array(fundedInstallment), currentInstallments: v.array(fundedInstallment),
  expenseRecovery: v.array(v.object({ entryId: v.string(), outstandingMinor: v.number(), allocatedMinor: v.number() })),
  prepayment: v.array(fundedInstallment), ordinarySavingMinor: v.number(),
});
