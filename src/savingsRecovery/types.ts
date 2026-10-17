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
  listPlans: () => Promise<RecoveryPlan[]>;
  listContributions: () => Promise<RecoveryContribution[]>;
  listProfiles: () => Promise<RecoveryProfile[]>;
  getEntry: (id: string) => Promise<RecoveryLedgerEntry | null>;
  findReversalOf: (entryId: string) => Promise<RecoveryLedgerEntry | null>;
  listExpenseEntries: () => Promise<RecoveryLedgerEntry[]>;
};

export type RecoveryWriteStore = RecoveryReadStore & {
  findPlanRequest: (key: string) => Promise<RecoveryPlan | null>;
  findContributionRequest: (key: string) => Promise<RecoveryContribution | null>;
  insertPlan: (plan: Omit<RecoveryPlan, "id">) => Promise<RecoveryPlan>;
  insertContribution: (
    contribution: Omit<RecoveryContribution, "id">,
  ) => Promise<RecoveryContribution>;
};
