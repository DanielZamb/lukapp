import type { AccountBalance, AccountingStore, Actor, Money, PostedExpense } from "../accounting/types";

export type MinorUnits = Money["minorUnits"];
export type SourceAllocation = { entryId: string; principalMinor: MinorUnits };
export type PlanTerms = {
  name: string;
  destinationProfileId: string;
  sources: SourceAllocation[];
  installmentCount: number;
  installmentAmountMinor: MinorUnits;
};
export type Installment = {
  month: string;
  amountMinor: MinorUnits;
  principalMinor: MinorUnits;
  premiumMinor: MinorUnits;
};
export type FrozenCommitment = {
  activatedOn: string;
  activatedAt: number;
  principalMinor: MinorUnits;
  impliedMonthlyRate: number;
  schedule: Installment[];
};
export type Plan = {
  id: string;
  workspaceId: string;
  revision: number;
  terms: PlanTerms;
  replacesPlanId: string | null;
  state: { kind: "Draft" } | { kind: "Activated"; commitment: FrozenCommitment };
};
export type InstallmentAllocation = {
  installmentIndex: number; principalMinor: MinorUnits; premiumMinor: MinorUnits;
  prepayment: boolean;
};
export type ContributionAllocation = {
  planId: string; amountMinor: MinorUnits; principalMinor: MinorUnits; premiumMinor: MinorUnits;
  installments: InstallmentAllocation[]; sources: SourceAllocation[];
};
export type AllocationIntent = { planId: string; amountMinor: MinorUnits };
export type RecoveryEventData =
  | { kind: "candidateDecision"; entryId: string; decision: "eligible" | "deferred" | "excluded" }
  | { kind: "cancelled"; planId: string; reason: string }
  | { kind: "suspended"; planId: string; entryIds: string[] }
  | { kind: "contribution"; transferEntryId: string; contributionDate: string; allocations: ContributionAllocation[]; intent: "explicit" | "acceptedProposal"; proposalId: string | null }
  | { kind: "contributionReversal"; contributionId: string; reason: string }
  | { kind: "proposal"; transferEntryId: string; allocations: AllocationIntent[]; importReference: string }
  | { kind: "proposalDecision"; proposalId: string; decision: "accepted" | "rejected"; contributionId: string | null }
  | { kind: "openingProgress"; planId: string; throughDate: string; provenance: string; evidenceUnavailable: true; allocation: ContributionAllocation };
export type RecoveryEvent = { id: string; workspaceId: string; recordedAt: number; actorId: string; data: RecoveryEventData };
export type Receipt = { fingerprint: string; resultId: string };
export type Snapshot = { plans: Plan[]; events: RecoveryEvent[] };
export type RecoveryLedger = Pick<AccountingStore,
  "getWorkspace" | "membershipRole" | "getJournalEntry" | "findReversalOf" |
  "getProfile" | "getLedgerAccount" | "getAccountingPeriod" | "listJournalSourceEffects"> & {
  expenses(input: { actor: Actor; workspaceId: string; from: string; through: string }): Promise<PostedExpense[]>;
  balances(input: { actor: Actor; workspaceId: string }): Promise<AccountBalance[]>;
};
export type RecoveryReadStore = {
  snapshot(workspaceId: string): Promise<Snapshot>;
  receipt(workspaceId: string, key: string): Promise<Receipt | undefined>;
};
export type RecoveryStore = RecoveryReadStore & {
  insertPlan(plan: Omit<Plan, "id">): Promise<string>;
  updatePlan(plan: Plan): Promise<void>;
  appendEvent(event: Omit<RecoveryEvent, "id">): Promise<string>;
  saveReceipt(workspaceId: string, key: string, receipt: Receipt): Promise<void>;
};
export type CommandContext = { actor: Actor; workspaceId: string; idempotencyKey: string };
export type CashProtections = {
  essentialSpendingMinor: MinorUnits; taxesMinor: MinorUnits;
  requiredReservesMinor: MinorUnits; externalObligationsMinor: MinorUnits;
  provenance: string;
};
export type AvailableCashInput =
  | { kind: "computed"; liquidProfileIds: string[]; protections: CashProtections }
  | { kind: "entered"; availableMinor: MinorUnits; protections: CashProtections; attestation: string };
