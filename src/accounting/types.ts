export type Actor = {
  userId: string;
};

export type WorkspaceKind = "Personal";

export type PeriodStatus = "open" | "locked" | "not_opened";

export type StoredPeriodStatus = Exclude<PeriodStatus, "not_opened">;

export type AccountingPeriod = {
  year: number;
  month: number;
  status: PeriodStatus;
};

export type Workspace = {
  id: string;
  kind: WorkspaceKind;
  functionalCurrency: string;
  currentAccountingPeriod: AccountingPeriod;
};

export type FinancialAccountProfile = {
  id: string;
  workspaceId: string;
  name: string;
};

export type Money = {
  currency: string;
  minorUnits: number;
};

export type JournalLine = {
  journalEntryId: string;
  ledgerAccountId: string;
  name: string;
  debitMinorUnits: number;
  creditMinorUnits: number;
};

export type PostedCashExpense = {
  id: string;
  financialAccountProfileId: string;
  financialAccountProfileName: string;
  description: string;
  accountingDate: string;
  amount: Money;
  accountingPeriod: AccountingPeriod;
  replay: boolean;
  lines: JournalLine[];
};

export type AccountBalance = {
  financialAccountProfileId: string;
  name: string;
  /** Debits on the profile's Posting Account, Functional Currency. */
  debitMinorUnits: number;
  /** Credits on the profile's Posting Account, Functional Currency. A cash expense lands here. */
  creditMinorUnits: number;
  /** debitMinorUnits − creditMinorUnits. A cash expense credits the profile, so this goes down. */
  debitMinusCredit: Money;
};

export type TrialBalanceRow = {
  name: string;
  debitMinorUnits: number;
  creditMinorUnits: number;
};

export type StoredWorkspace = {
  id: string;
  kind: WorkspaceKind;
  functionalCurrency: string;
  expenseAccountId?: string;
};

export type StoredProfile = FinancialAccountProfile & {
  postingAccountId: string;
};

export type LedgerAccount = {
  id: string;
  workspaceId: string;
  name: string;
};

export type DraftJournalLine = {
  ledgerAccountId: string;
  debitMinorUnits: number;
  creditMinorUnits: number;
};

export type StoredCashExpense = {
  id: string;
  financialAccountProfileId: string;
  description: string;
  accountingDate: string;
  period: { year: number; month: number };
  idempotencyKey: string;
  lines: JournalLine[];
};

export type AccountingClock = {
  now: () => Date;
};

export type AccountingStore = {
  insertWorkspace(
    workspace: Omit<StoredWorkspace, "id" | "expenseAccountId">,
    ownerUserId: string,
  ): Promise<StoredWorkspace>;
  getWorkspace(workspaceId: string): Promise<StoredWorkspace | undefined>;
  setExpenseAccount(workspaceId: string, expenseAccountId: string): Promise<void>;
  isMember(workspaceId: string, userId: string): Promise<boolean>;
  insertLedgerAccount(account: Omit<LedgerAccount, "id">): Promise<LedgerAccount>;
  listLedgerAccounts(workspaceId: string): Promise<LedgerAccount[]>;
  insertProfile(profile: Omit<StoredProfile, "id">): Promise<StoredProfile>;
  getProfile(profileId: string): Promise<StoredProfile | undefined>;
  listProfiles(workspaceId: string): Promise<StoredProfile[]>;
  insertPostedCashExpense(input: {
    workspaceId: string;
    financialAccountProfileId: string;
    accountingDate: string;
    description: string;
    period: { year: number; month: number };
    idempotencyKey: string;
    lines: DraftJournalLine[];
  }): Promise<StoredCashExpense>;
  findPostedCashExpense(
    workspaceId: string,
    idempotencyKey: string,
  ): Promise<StoredCashExpense | undefined>;
  listPostedCashExpenses(workspaceId: string): Promise<StoredCashExpense[]>;
  insertAccountingPeriod(
    workspaceId: string,
    period: { year: number; month: number; status: StoredPeriodStatus },
  ): Promise<AccountingPeriod>;
  getAccountingPeriod(
    workspaceId: string,
    period: { year: number; month: number },
  ): Promise<AccountingPeriod | undefined>;
  lockAccountingPeriod(
    workspaceId: string,
    period: { year: number; month: number },
  ): Promise<AccountingPeriod>;
};

export type AccountingCore = {
  createPersonalWorkspace(input: {
    actor: Actor;
    functionalCurrency: string;
  }): Promise<Workspace>;
  openWorkspace(input: {
    actor: Actor;
    workspaceId: string;
    now?: number;
  }): Promise<Workspace>;
  createFinancialAccountProfile(input: {
    actor: Actor;
    workspaceId: string;
    name: string;
  }): Promise<FinancialAccountProfile>;
  listFinancialAccountProfiles(input: {
    actor: Actor;
    workspaceId: string;
  }): Promise<FinancialAccountProfile[]>;
  recordCashExpense(input: {
    actor: Actor;
    workspaceId: string;
    financialAccountProfileId: string;
    amount: Money;
    accountingDate: string;
    description: string;
    idempotencyKey: string;
  }): Promise<PostedCashExpense>;
  listPostedCashExpenses(input: {
    actor: Actor;
    workspaceId: string;
  }): Promise<PostedCashExpense[]>;
  balances(input: {
    actor: Actor;
    workspaceId: string;
  }): Promise<AccountBalance[]>;
  trialBalance(input: {
    actor: Actor;
    workspaceId: string;
  }): Promise<TrialBalanceRow[]>;
  lockAccountingPeriod(input: {
    actor: Actor;
    workspaceId: string;
    period: { year: number; month: number };
  }): Promise<AccountingPeriod>;
};
