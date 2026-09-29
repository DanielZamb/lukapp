export type Actor = {
  userId: string;
};

export type WorkspaceKind = "Personal";

export type PeriodStatus = "open" | "locked" | "not_opened";

export type StoredPeriodStatus = Exclude<PeriodStatus, "not_opened">;

export type PeriodKey = {
  year: number;
  month: number;
};

export type AccountingPeriod = PeriodKey & {
  status: PeriodStatus;
};

/** Accounting class of a Ledger Account; decides which side increases it. */
export type AccountNature = "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";

/** Posting Accounts receive Journal Lines. Summary Accounts arrive with reporting. */
export type LedgerAccountRole = "Posting";

/** The side that increases an account (naturaleza débito o crédito). Contra accounts oppose their nature. */
export type NormalSide = "Debit" | "Credit";

/** The recording flow allowed to use a template account; general accounts wait for their capability. */
export type CatalogUse = "expense" | "income" | "openingBalance" | "general";

export type CatalogAccount = {
  code: string;
  name: string;
  use: CatalogUse;
  /** Only for contra accounts; otherwise the nature decides. */
  normalSide?: NormalSide;
};

/** A versioned COA Template. The first digit of a code locks the account's nature. */
export type ChartOfAccountsTemplate = {
  version: string;
  natureByClass: Record<string, AccountNature>;
  /** Accounts provisioned in every new Workspace, found again by code. */
  defaults: { expense: string; income: string; openingBalance: string };
  /** Each profile gets its own auxiliary Posting Account under this code. */
  financialAccountParents: Record<FinancialAccountProductKind, string>;
  /** Posting Accounts a Workspace may activate. */
  accounts: CatalogAccount[];
  /** Names of the non-postable levels above the Posting Accounts. */
  summaryNames: Record<string, string>;
};

/** Product facts a basic user recognizes; classification turns them into a nature. */
export type FinancialAccountProductKind =
  | "cash"
  | "bankAccount"
  | "savingsAccount"
  | "creditCard"
  | "loan";

/** Versioned rule that built a Journal Entry, kept as provenance. */
export type PostingPolicy = "cash-expense@1" | "cash-income@1" | "reversal@1";

export type Workspace = {
  id: string;
  kind: WorkspaceKind;
  functionalCurrency: string;
  chartOfAccountsTemplate: string;
  currentAccountingPeriod: AccountingPeriod;
};

export type FinancialAccountProfile = {
  id: string;
  workspaceId: string;
  name: string;
  productKind: FinancialAccountProductKind;
  /** The Posting Account behind the profile, for advanced views. */
  ledgerAccountId: string;
};

export type LedgerAccountView = {
  id: string;
  code: string;
  name: string;
  nature: AccountNature;
  normalSide: NormalSide;
  role: LedgerAccountRole;
  financialAccountProfileId?: string;
};

/** A template account a Workspace can use, with where it sits in the Chart of Accounts. */
export type CatalogAccountView = {
  code: string;
  name: string;
  nature: AccountNature;
  normalSide: NormalSide;
  use: CatalogUse;
  ancestors: Array<{ code: string; name: string }>;
  /** Present once the Workspace has activated the account. */
  ledgerAccountId?: string;
};

export type Money = {
  currency: string;
  minorUnits: number;
};

export type JournalLineView = {
  ledgerAccountId: string;
  code: string;
  name: string;
  nature: AccountNature;
  debitMinorUnits: number;
  creditMinorUnits: number;
};

export type PostedJournalEntry = {
  id: string;
  policy: PostingPolicy;
  description: string;
  accountingDate: string;
  accountingPeriod: AccountingPeriod;
  /** Total debits, which equal total credits, in Functional Currency. */
  amount: Money;
  financialAccountProfileId?: string;
  financialAccountProfileName?: string;
  reversesEntryId?: string;
  reversedByEntryId?: string;
  postedBy: string;
  postedAt: number;
  replay: boolean;
  lines: JournalLineView[];
};

export type AccountBalance = {
  financialAccountProfileId: string;
  name: string;
  nature: AccountNature;
  /** Debits on the profile's Posting Account, Functional Currency. */
  debitMinorUnits: number;
  /** Credits on the profile's Posting Account, Functional Currency. */
  creditMinorUnits: number;
  /** Balance on the account's normal side: money held for an Asset, money owed for a Liability. */
  balance: Money;
};

export type TrialBalanceRow = {
  ledgerAccountId: string;
  code: string;
  name: string;
  nature: AccountNature;
  debitMinorUnits: number;
  creditMinorUnits: number;
};

export type StoredWorkspace = {
  id: string;
  kind: WorkspaceKind;
  functionalCurrency: string;
  chartOfAccountsTemplate: string;
};

export type StoredProfile = {
  id: string;
  workspaceId: string;
  name: string;
  productKind: FinancialAccountProductKind;
  classificationPolicy: string;
  postingAccountId: string;
};

/** Code, nature, and normal side are locked when the account is activated. */
export type LedgerAccount = {
  id: string;
  workspaceId: string;
  code: string;
  name: string;
  nature: AccountNature;
  normalSide: NormalSide;
  role: LedgerAccountRole;
};

export type DraftJournalLine = {
  ledgerAccountId: string;
  debitMinorUnits: number;
  creditMinorUnits: number;
};

/** What a command asks Posting to recognize. Posting adds period and provenance. */
export type JournalEntryDraft = {
  accountingDate: string;
  description: string;
  idempotencyKey: string;
  policy: PostingPolicy;
  financialAccountProfileId?: string;
  reversesEntryId?: string;
  lines: DraftJournalLine[];
};

export type StoredJournalEntry = JournalEntryDraft & {
  id: string;
  workspaceId: string;
  period: PeriodKey;
  postedBy: string;
  postedAt: number;
};

export type PeriodControlDecision = {
  period: PeriodKey;
  action: "Lock";
  decidedBy: string;
  decidedAt: number;
  reason?: string;
};

export type AccountingClock = {
  now: () => Date;
};

export type AccountingStore = {
  insertWorkspace(
    workspace: Omit<StoredWorkspace, "id">,
    ownerUserId: string,
  ): Promise<StoredWorkspace>;
  getWorkspace(workspaceId: string): Promise<StoredWorkspace | undefined>;
  isMember(workspaceId: string, userId: string): Promise<boolean>;
  insertLedgerAccount(account: Omit<LedgerAccount, "id">): Promise<LedgerAccount>;
  getLedgerAccount(accountId: string): Promise<LedgerAccount | undefined>;
  findLedgerAccountByCode(
    workspaceId: string,
    code: string,
  ): Promise<LedgerAccount | undefined>;
  listLedgerAccounts(workspaceId: string): Promise<LedgerAccount[]>;
  insertProfile(profile: Omit<StoredProfile, "id">): Promise<StoredProfile>;
  getProfile(profileId: string): Promise<StoredProfile | undefined>;
  listProfiles(workspaceId: string): Promise<StoredProfile[]>;
  insertJournalEntry(
    entry: Omit<StoredJournalEntry, "id">,
  ): Promise<StoredJournalEntry>;
  getJournalEntry(entryId: string): Promise<StoredJournalEntry | undefined>;
  findJournalEntryByIdempotencyKey(
    workspaceId: string,
    idempotencyKey: string,
  ): Promise<StoredJournalEntry | undefined>;
  findReversalOf(entryId: string): Promise<StoredJournalEntry | undefined>;
  listJournalEntries(workspaceId: string): Promise<StoredJournalEntry[]>;
  getAccountingPeriod(
    workspaceId: string,
    period: PeriodKey,
  ): Promise<AccountingPeriod | undefined>;
  insertAccountingPeriod(
    workspaceId: string,
    period: PeriodKey & { status: StoredPeriodStatus },
  ): Promise<AccountingPeriod>;
  setAccountingPeriodStatus(
    workspaceId: string,
    period: PeriodKey,
    status: StoredPeriodStatus,
  ): Promise<AccountingPeriod>;
  insertPeriodControlDecision(
    workspaceId: string,
    decision: PeriodControlDecision,
  ): Promise<void>;
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
    productKind: FinancialAccountProductKind;
  }): Promise<FinancialAccountProfile>;
  listFinancialAccountProfiles(input: {
    actor: Actor;
    workspaceId: string;
  }): Promise<FinancialAccountProfile[]>;
  listLedgerAccounts(input: {
    actor: Actor;
    workspaceId: string;
  }): Promise<LedgerAccountView[]>;
  listCatalogAccounts(input: {
    actor: Actor;
    workspaceId: string;
  }): Promise<CatalogAccountView[]>;
  recordCashExpense(input: CashActivityInput): Promise<PostedJournalEntry>;
  recordCashIncome(input: CashActivityInput): Promise<PostedJournalEntry>;
  reversePostedEntry(input: {
    actor: Actor;
    workspaceId: string;
    journalEntryId: string;
    accountingDate?: string;
    description?: string;
    idempotencyKey: string;
  }): Promise<PostedJournalEntry>;
  listJournalEntries(input: {
    actor: Actor;
    workspaceId: string;
  }): Promise<PostedJournalEntry[]>;
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
    period: PeriodKey;
    reason?: string;
  }): Promise<AccountingPeriod>;
};

/** Familiar facts a basic user enters for money that moved in or out of an account. */
export type CashActivityInput = {
  actor: Actor;
  workspaceId: string;
  financialAccountProfileId: string;
  amount: Money;
  accountingDate: string;
  description: string;
  idempotencyKey: string;
  /** Template account the money went to or came from; the template default when omitted. */
  ledgerAccountCode?: string;
};
