import type { CategoryCore, CategoryStore, CategorySnapshot, CategoryCorrection } from "./categoryTypes";
export type Actor = {
  userId: string;
};

export type WorkspaceRole = "Owner" | "Accountant" | "Preparer" | "Viewer";

export type WorkspaceKind = "Personal" | "Household";

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
export type AccountNature =
  "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";

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
  /** Qualified name of the closest reporting taxonomy element, such as us-gaap:InterestExpense. */
  reportingConcept?: string;
};

/** A versioned COA Template. The first digit of a code locks the account's nature. */
export type ChartOfAccountsTemplate = {
  version: string;
  applicableWorkspaceKinds: readonly WorkspaceKind[];
  natureByClass: Record<string, AccountNature>;
  /** Accounts provisioned in every new Workspace, found again by code. */
  defaults: { expense: string; income: string; openingBalance: string };
  /** Each profile gets its own auxiliary Posting Account under this code. */
  financialAccountParents: Record<FinancialAccountParentKind, string>;
  /** Posting Accounts a Workspace may activate. */
  accounts: CatalogAccount[];
  /** Names of the non-postable levels above the Posting Accounts. */
  summaryNames: Record<string, string>;
};

export type FinancialAccountProductKind =
  "cash" | "bankAccount" | "savingsAccount" | "creditCard" | "loan"
  | "receivable" | "investment" | "personalDebt";

export type FinancialAccountParentKind = Exclude<FinancialAccountProductKind, "receivable" | "investment">
  | "securedReceivable" | "unsecuredReceivable" | "termDeposit" | "investmentFund";

export type ProfileClassificationAnswers =
  | { kind: "receivable"; security: "secured" | "unsecured"; counterpartyName: string }
  | { kind: "investment"; form: "termDeposit" | "fund"; counterpartyName?: string }
  | { kind: "personalDebt"; counterpartyName: string };

/** Versioned rule that built a Journal Entry, kept as provenance. */
export type PostingPolicy =
  | "cash-expense@1"
  | "cash-income@1"
  | "reversal@1"
  | "account-transfer@1"
  | "opening-position@1"
  | "category-reclassification@1";

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
  classificationAnswers?: ProfileClassificationAnswers;
  /** The Posting Account behind the profile, for advanced views. */
  ledgerAccountId: string;
  opening: OpeningStatus;
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
  reportingConcept?: string;
  ancestors: Array<{ code: string; name: string }>;
  /** Present once the Workspace has activated the account. */
  ledgerAccountId?: string;
};

export type Money = {
  currency: string;
  minorUnits: number;
};

export type JournalLineView = {
  category?: CategorySnapshot;
  categoryCorrection?: CategoryCorrection;
  ledgerAccountId: string;
  code: string;
  name: string;
  nature: AccountNature;
  financialAccountProfileId?: string;
  debitMinorUnits: number;
  creditMinorUnits: number;
};

export type PostedJournalEntry = {
  cashCategoryInput?: { userCategoryId: string; categoryRevision?: number; ledgerAccountCode?: string };

  sourceExpenseEffects?: Array<{ sourceEntryId: string; expenseDeltaMinorUnits: number }>;
  id: string;
  policy: PostingPolicy;
  description: string;
  accountingDate: string;
  accountingPeriod: AccountingPeriod;
  /** Total debits, which equal total credits, in Functional Currency. */
  amount: Money;
  financialAccountProfileId?: string;
  financialAccountProfileName?: string;
  accountTransfer?: {
    sourceFinancialAccountProfileId: string;
    destinationFinancialAccountProfileId: string;
    sourceNature: AccountNature;
    destinationNature: AccountNature;
  };
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
  classificationAnswers?: ProfileClassificationAnswers;
  classificationPolicy: string;
  postingAccountId: string;
  setupIdempotencyKey?: string;
  opening?: StoredOpening;
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
  category?: CategorySnapshot;
  categoryCorrection?: CategoryCorrection;
  ledgerAccountId: string;
  debitMinorUnits: number;
  creditMinorUnits: number;
};

/** What a command asks Posting to recognize. Posting adds period and provenance. */
export type JournalEntryDraft = {
  cashCategoryInput?: { userCategoryId: string; categoryRevision?: number; ledgerAccountCode?: string };

  sourceExpenseEffects?: Array<{ sourceEntryId: string; expenseDeltaMinorUnits: number }>;
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

export type StoredOpening = {
  accountingDate: string;
  idempotencyKey: string;
  amount: Money;
} & ({ kind: "zero" } | { kind: "posted"; journalEntryId: string });

export type OpeningStatus =
  | { status: "not_started" }
  | {
      status: "zero";
      accountingDate: string;
      amount: Money;
      idempotencyKey: string;
    }
  | {
      status: "posted" | "reversed";
      accountingDate: string;
      amount: Money;
      idempotencyKey: string;
      journalEntryId: string;
    };

export type StoredOpeningPosition = {
  workspaceId: string;
  financialAccountProfileId: string;
  description: string;
  replacesOpeningKey?: string;
  opening: StoredOpening;
};

export type OpeningPositionInput = {
  actor: Actor;
  workspaceId: string;
  financialAccountProfileId: string;
  amount: Money;
  accountingDate: string;
  description: string;
  idempotencyKey: string;
  replacesOpeningKey?: string;
};

export type OpeningPositionResult = {
  profile: FinancialAccountProfile;
  journalEntry: PostedJournalEntry | null;
  replay: boolean;
};

export type AccountTransferInput = {
  actor: Actor;
  workspaceId: string;
  sourceFinancialAccountProfileId: string;
  destinationFinancialAccountProfileId: string;
  amount: Money;
  accountingDate: string;
  description: string;
  idempotencyKey: string;
};

export type SetupFinancialAccountInput = Omit<
  OpeningPositionInput,
  "financialAccountProfileId" | "replacesOpeningKey"
> & {
  name: string;
  productKind: FinancialAccountProductKind;
  classificationAnswers?: ProfileClassificationAnswers;
};

export type AccountingClock = {
  now: () => Date;
};

export type AccountingStore = CategoryStore & {
  insertWorkspace(
    workspace: Omit<StoredWorkspace, "id">,
    ownerUserId: string,
  ): Promise<StoredWorkspace>;
  getWorkspace(workspaceId: string): Promise<StoredWorkspace | undefined>;
  listOwnedWorkspaceIds(userId: string): Promise<string[]>;
  findHouseholdWorkspaceByKey(
    userId: string,
    key: string,
  ): Promise<string | undefined>;
  saveHouseholdWorkspaceCreation(input: {
    ownerUserId: string;
    idempotencyKey: string;
    workspaceId: string;
  }): Promise<void>;
  membershipRole(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceRole | undefined>;
  insertLedgerAccount(
    account: Omit<LedgerAccount, "id">,
  ): Promise<LedgerAccount>;
  getLedgerAccount(accountId: string): Promise<LedgerAccount | undefined>;
  findLedgerAccountByCode(
    workspaceId: string,
    code: string,
  ): Promise<LedgerAccount | undefined>;
  listLedgerAccounts(workspaceId: string): Promise<LedgerAccount[]>;
  insertProfile(profile: Omit<StoredProfile, "id">): Promise<StoredProfile>;
  getProfile(profileId: string): Promise<StoredProfile | undefined>;
  findProfileBySetupKey(
    workspaceId: string,
    key: string,
  ): Promise<StoredProfile | undefined>;
  findOpeningPositionByKey(
    workspaceId: string,
    key: string,
  ): Promise<StoredOpeningPosition | undefined>;
  clearProfileOpening(profileId: string): Promise<void>;
  saveOpeningPosition(position: StoredOpeningPosition): Promise<void>;
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

export type AccountingCore = CategoryCore & {
  createPersonalWorkspace(input: {
    actor: Actor;
    functionalCurrency: string;
    /** COA Template version; co-puc-personal@1 when omitted. */
    chartOfAccountsTemplate?: string;
  }): Promise<Workspace>;
  createHouseholdWorkspace(input: {
    actor: Actor;
    functionalCurrency: string;
    chartOfAccountsTemplate?: string;
    idempotencyKey: string;
  }): Promise<Workspace>;
  listOwnedWorkspaces(input: {
    actor: Actor;
    now?: number;
  }): Promise<Workspace[]>;
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
  classificationAnswers?: ProfileClassificationAnswers;
    idempotencyKey?: string;
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
  recordOpeningPosition(
    input: OpeningPositionInput,
  ): Promise<OpeningPositionResult>;
  setupFinancialAccount(
    input: SetupFinancialAccountInput,
  ): Promise<OpeningPositionResult>;
  recordAccountTransfer(
    input: AccountTransferInput,
  ): Promise<PostedJournalEntry>;
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
    financialAccountProfileId?: string;
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
  userCategoryId?: string;
  categoryRevision?: number;
};
