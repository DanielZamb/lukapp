export type RecoveryPlan = {
  id: string;
  workspaceId: string;
  sourceJournalEntryId: string;
  destinationFinancialAccountProfileId: string;
  title: string;
  principalMinorUnits: number;
  installmentCount: number;
  installmentMinorUnits: number;
  impliedAnnualRateBps: number;
  currency: string;
  activationMonth: string;
  replacesPlanId?: string;
  replacementLinkInferred?: boolean;
  idempotencyKey: string;
  createdBy: string;
  createdAt: number;
};

export type RecoveryContribution = {
  id: string;
  workspaceId: string;
  planId: string;
  transferJournalEntryId: string;
  amountMinorUnits: number;
  contributionDate: string;
  idempotencyKey: string;
  createdBy: string;
  recordedAt: number;
  correctsContributionId?: string;
};

export type RecoveryLedgerEntry = {
  id: string;
  workspaceId: string;
  policy: string;
  description: string;
  accountingDate: string;
  amountMinorUnits: number;
  financialAccountProfileId?: string;
  reversesEntryId?: string;
  destinationFinancialAccountProfileId?: string;
};

export type RecoveryProfile = {
  id: string;
  workspaceId: string;
  name: string;
  productKind: string;
};

export type RecoverySuggestion = {
  principalMinorUnits: number;
  installmentCount: number;
  installmentMinorUnits: number;
  minInstallmentMinorUnits: number;
  maxInstallmentMinorUnits: number;
  impliedAnnualRateBps: number;
  premiumMinorUnits: number;
  targetMinorUnits: number;
};

export type ActivatePlan = {
  replacesPlanId?: string;
  workspaceId: string;
  sourceJournalEntryId: string;
  destinationFinancialAccountProfileId: string;
  installmentCount: number;
  installmentMinorUnits: number;
  idempotencyKey: string;
};

export type RecordContribution = {
  workspaceId: string;
  planId: string;
  transferJournalEntryId: string;
  idempotencyKey: string;
};

export type RecoveryReadStore = {
  functionalCurrency: () => Promise<string>;
  timeZone: () => Promise<string>;
  listCancellations: () => Promise<RecoveryCancellation[]>;
  listCorrections: () => Promise<RecoveryCorrection[]>;
  listPlans: () => Promise<RecoveryPlan[]>;
  listContributions: () => Promise<RecoveryContribution[]>;
  listProfiles: () => Promise<RecoveryProfile[]>;
  getEntry: (id: string) => Promise<RecoveryLedgerEntry | null>;
  findReversalOf: (entryId: string) => Promise<RecoveryLedgerEntry | null>;
  listExpenseEntries: () => Promise<RecoveryLedgerEntry[]>;
};

export type RecoveryWriteStore = RecoveryReadStore & {
  insertCancellation: (decision: Omit<RecoveryCancellation, "id">) => Promise<RecoveryCancellation>;
  insertCorrection: (decision: Omit<RecoveryCorrection, "id">) => Promise<RecoveryCorrection>;
  findPlanRequest: (key: string) => Promise<RecoveryPlan | null>;
  findContributionRequest: (key: string) => Promise<RecoveryContribution | null>;
  insertPlan: (plan: Omit<RecoveryPlan, "id">) => Promise<RecoveryPlan>;
  insertContribution: (
    contribution: Omit<RecoveryContribution, "id">,
  ) => Promise<RecoveryContribution>;
};

export type RecoveryCancellation = {
  id: string;
  workspaceId: string;
  planId: string;
  reason?: string;
  idempotencyKey: string;
  createdBy: string;
  eventTime: number;
  recordedAt: number;
  origin?: RecoveryCancellationOrigin;
};

export type RecoveryInvalidation =
  | { kind: "transfer_reversed"; transferJournalEntryId: string; reversalJournalEntryId: string }
  | { kind: "contribution_corrected"; contributionId: string; correctionId: string };

export type RecoveryCancellationOrigin =
  | { kind: "person" }
  | { kind: "automatic"; cause: RecoveryInvalidation; unfinishedPlanId: string };

export type RecoveryCorrection = {
  id: string;
  workspaceId: string;
  contributionId: string;
  reason: string;
  targetPlanId?: string;
  replacementContributionId?: string;
  contributionDate: string;
  idempotencyKey: string;
  createdBy: string;
  recordedAt: number;
};

export type CancelPlan = {
  workspaceId: string;
  planId: string;
  reason?: string;
  idempotencyKey: string;
};

export type CorrectContribution = {
  workspaceId: string;
  contributionId: string;
  reason: string;
  targetPlanId?: string;
  idempotencyKey: string;
};
