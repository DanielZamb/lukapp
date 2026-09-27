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
  debitMinusCredit: Money;
};

export type TrialBalanceRow = {
  name: string;
  debitMinorUnits: number;
  creditMinorUnits: number;
};

export const accountingErrorMessages = {
  workspace_membership_required: "Workspace Membership required",
  amount_must_be_positive: "amount must be positive",
  functional_currency_required: "Functional Currency required",
  accounting_date_required: "Accounting Date required",
  idempotency_key_required: "Idempotency key required",
  locked_period: "Locked Period",
  financial_account_profile_not_found: "Financial Account Profile not found",
  accounting_period_not_found: "Accounting Period not found",
  expense_account_not_found: "Expense account not found",
  posted_journal_entry_unbalanced: "Posted Journal Entry must be balanced",
  idempotency_key_conflict: "Idempotency key already used",
} as const;

export type AccountingErrorCode = keyof typeof accountingErrorMessages;

export class AccountingError extends Error {
  readonly code: AccountingErrorCode;

  constructor(code: AccountingErrorCode) {
    super(accountingErrorMessages[code]);
    this.name = "AccountingError";
    this.code = code;
  }
}

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

function clockMonth(now: Date): { year: number; month: number } {
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
  };
}

function periodFromAccountingDate(accountingDate: string): {
  year: number;
  month: number;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(accountingDate);
  if (!match) {
    throw new AccountingError("accounting_date_required");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() + 1 !== month ||
    utc.getUTCDate() !== day
  ) {
    throw new AccountingError("accounting_date_required");
  }
  return { year, month };
}

function toProfile(profile: StoredProfile): FinancialAccountProfile {
  return {
    id: profile.id,
    workspaceId: profile.workspaceId,
    name: profile.name,
  };
}

export function createAccountingCore(
  store: AccountingStore,
  clock: AccountingClock = { now: () => new Date() },
): AccountingCore {
  async function requireMember(workspaceId: string, actor: Actor) {
    if (!(await store.isMember(workspaceId, actor.userId))) {
      throw new AccountingError("workspace_membership_required");
    }
  }

  async function requireWorkspace(workspaceId: string, actor: Actor) {
    await requireMember(workspaceId, actor);
    const workspace = await store.getWorkspace(workspaceId);
    if (!workspace) {
      throw new AccountingError("workspace_membership_required");
    }
    return workspace;
  }

  async function ensureOpenPeriod(
    workspaceId: string,
    period: { year: number; month: number },
  ): Promise<AccountingPeriod> {
    const stored = await store.getAccountingPeriod(workspaceId, period);
    if (stored) {
      return stored;
    }
    return store.insertAccountingPeriod(workspaceId, { ...period, status: "open" });
  }

  function toWorkspace(
    workspace: StoredWorkspace,
    currentAccountingPeriod: AccountingPeriod,
  ): Workspace {
    return {
      id: workspace.id,
      kind: workspace.kind,
      functionalCurrency: workspace.functionalCurrency,
      currentAccountingPeriod,
    };
  }

  function postedAmount(workspace: StoredWorkspace, entry: StoredCashExpense) {
    return (
      entry.lines.find(
        (line) => line.ledgerAccountId === workspace.expenseAccountId,
      )?.debitMinorUnits ?? 0
    );
  }

  async function toPostedCashExpense(
    workspace: StoredWorkspace,
    entry: StoredCashExpense,
    replay: boolean,
  ): Promise<PostedCashExpense> {
    const [period, profile, accounts] = await Promise.all([
      store.getAccountingPeriod(workspace.id, entry.period),
      store.getProfile(entry.financialAccountProfileId),
      store.listLedgerAccounts(workspace.id),
    ]);
    if (!period) {
      throw new AccountingError("accounting_period_not_found");
    }
    if (!profile) {
      throw new AccountingError("financial_account_profile_not_found");
    }
    const names = new Map(accounts.map((account) => [account.id, account.name]));
    return {
      id: entry.id,
      financialAccountProfileId: profile.id,
      financialAccountProfileName: profile.name,
      description: entry.description,
      accountingDate: entry.accountingDate,
      amount: {
        currency: workspace.functionalCurrency,
        minorUnits: postedAmount(workspace, entry),
      },
      accountingPeriod: period,
      replay,
      lines: entry.lines.map((line) => ({
        ...line,
        name: names.get(line.ledgerAccountId) ?? line.ledgerAccountId,
      })),
    };
  }

  return {
    async createPersonalWorkspace({ actor, functionalCurrency }) {
      const workspace = await store.insertWorkspace(
        { kind: "Personal", functionalCurrency },
        actor.userId,
      );
      const expense = await store.insertLedgerAccount({
        workspaceId: workspace.id,
        name: "Expenses",
      });
      await store.insertLedgerAccount({
        workspaceId: workspace.id,
        name: "Opening Balance Equity",
      });
      await store.setExpenseAccount(workspace.id, expense.id);
      const period = await store.insertAccountingPeriod(workspace.id, {
        ...clockMonth(clock.now()),
        status: "open",
      });
      return toWorkspace({ ...workspace, expenseAccountId: expense.id }, period);
    },

    async openWorkspace({ actor, workspaceId, now }) {
      const workspace = await requireWorkspace(workspaceId, actor);
      const month = clockMonth(now === undefined ? clock.now() : new Date(now));
      const stored = await store.getAccountingPeriod(workspaceId, month);
      return toWorkspace(
        workspace,
        stored ?? { ...month, status: "not_opened" },
      );
    },

    async createFinancialAccountProfile({ actor, workspaceId, name }) {
      await requireMember(workspaceId, actor);
      const postingAccount = await store.insertLedgerAccount({
        workspaceId,
        name,
      });
      const profile = await store.insertProfile({
        workspaceId,
        name,
        postingAccountId: postingAccount.id,
      });
      return toProfile(profile);
    },

    async listFinancialAccountProfiles({ actor, workspaceId }) {
      await requireMember(workspaceId, actor);
      const profiles = await store.listProfiles(workspaceId);
      return profiles.map(toProfile);
    },

    async recordCashExpense({
      actor,
      workspaceId,
      financialAccountProfileId,
      amount,
      accountingDate,
      description,
      idempotencyKey,
    }) {
      const workspace = await requireWorkspace(workspaceId, actor);
      if (!idempotencyKey) {
        throw new AccountingError("idempotency_key_required");
      }
      const existing = await store.findPostedCashExpense(workspaceId, idempotencyKey);
      if (existing) {
        const sameCommand =
          existing.financialAccountProfileId === financialAccountProfileId &&
          existing.accountingDate === accountingDate &&
          existing.description === description &&
          postedAmount(workspace, existing) === amount.minorUnits;
        if (!sameCommand) {
          throw new AccountingError("idempotency_key_conflict");
        }
        return toPostedCashExpense(workspace, existing, true);
      }
      if (!workspace.expenseAccountId) {
        throw new AccountingError("expense_account_not_found");
      }
      if (amount.minorUnits <= 0) {
        throw new AccountingError("amount_must_be_positive");
      }
      if (amount.currency !== workspace.functionalCurrency) {
        throw new AccountingError("functional_currency_required");
      }
      const profile = await store.getProfile(financialAccountProfileId);
      if (!profile || profile.workspaceId !== workspaceId) {
        throw new AccountingError("financial_account_profile_not_found");
      }
      const lines: DraftJournalLine[] = [
        {
          ledgerAccountId: workspace.expenseAccountId,
          debitMinorUnits: amount.minorUnits,
          creditMinorUnits: 0,
        },
        {
          ledgerAccountId: profile.postingAccountId,
          debitMinorUnits: 0,
          creditMinorUnits: amount.minorUnits,
        },
      ];
      const debit = lines.reduce((sum, line) => sum + line.debitMinorUnits, 0);
      const credit = lines.reduce((sum, line) => sum + line.creditMinorUnits, 0);
      if (debit !== credit) {
        throw new AccountingError("posted_journal_entry_unbalanced");
      }
      const period = periodFromAccountingDate(accountingDate);
      const accountingPeriod = await ensureOpenPeriod(workspaceId, period);
      if (accountingPeriod.status === "locked") {
        throw new AccountingError("locked_period");
      }
      const posted = await store.insertPostedCashExpense({
        workspaceId,
        financialAccountProfileId,
        accountingDate,
        description,
        period,
        idempotencyKey,
        lines,
      });
      return toPostedCashExpense(workspace, posted, false);
    },

    async listPostedCashExpenses({ actor, workspaceId }) {
      const workspace = await requireWorkspace(workspaceId, actor);
      const entries = await store.listPostedCashExpenses(workspaceId);
      return Promise.all(
        entries.map((entry) => toPostedCashExpense(workspace, entry, false)),
      );
    },

    async balances({ actor, workspaceId }) {
      const workspace = await requireWorkspace(workspaceId, actor);
      const [profiles, entries] = await Promise.all([
        store.listProfiles(workspaceId),
        store.listPostedCashExpenses(workspaceId),
      ]);
      const lines = entries.flatMap((entry) => entry.lines);
      return profiles.map((profile) => ({
        financialAccountProfileId: profile.id,
        name: profile.name,
        debitMinusCredit: {
          currency: workspace.functionalCurrency,
          minorUnits: lines
            .filter((line) => line.ledgerAccountId === profile.postingAccountId)
            .reduce(
              (sum, line) => sum + line.debitMinorUnits - line.creditMinorUnits,
              0,
            ),
        },
      }));
    },

    async trialBalance({ actor, workspaceId }) {
      await requireMember(workspaceId, actor);
      const [accounts, entries] = await Promise.all([
        store.listLedgerAccounts(workspaceId),
        store.listPostedCashExpenses(workspaceId),
      ]);
      const lines = entries.flatMap((entry) => entry.lines);
      return accounts
        .map((account) => ({
          name: account.name,
          debitMinorUnits: lines
            .filter((line) => line.ledgerAccountId === account.id)
            .reduce((sum, line) => sum + line.debitMinorUnits, 0),
          creditMinorUnits: lines
            .filter((line) => line.ledgerAccountId === account.id)
            .reduce((sum, line) => sum + line.creditMinorUnits, 0),
        }))
        .filter((row) => row.debitMinorUnits !== 0 || row.creditMinorUnits !== 0);
    },

    async lockAccountingPeriod({ actor, workspaceId, period }) {
      await requireMember(workspaceId, actor);
      const stored = await store.getAccountingPeriod(workspaceId, period);
      if (!stored || stored.status === "not_opened") {
        throw new AccountingError("accounting_period_not_found");
      }
      if (stored.status === "locked") {
        return stored;
      }
      return store.lockAccountingPeriod(workspaceId, period);
    },
  };
}

export function createMemoryAccountingCore(
  clock: AccountingClock = { now: () => new Date() },
): AccountingCore {
  const workspaces = new Map<string, StoredWorkspace>();
  const members = new Map<string, Set<string>>();
  const accounts = new Map<string, LedgerAccount>();
  const profiles = new Map<string, StoredProfile>();
  const entries = new Map<string, StoredCashExpense[]>();
  const periods = new Map<string, AccountingPeriod[]>();

  const store: AccountingStore = {
    async insertWorkspace(workspace, ownerUserId) {
      const created: StoredWorkspace = { ...workspace, id: crypto.randomUUID() };
      workspaces.set(created.id, created);
      members.set(created.id, new Set([ownerUserId]));
      entries.set(created.id, []);
      periods.set(created.id, []);
      return created;
    },
    async getWorkspace(workspaceId) {
      return workspaces.get(workspaceId);
    },
    async setExpenseAccount(workspaceId, expenseAccountId) {
      const workspace = workspaces.get(workspaceId);
      if (workspace) {
        workspaces.set(workspaceId, { ...workspace, expenseAccountId });
      }
    },
    async isMember(workspaceId, userId) {
      return members.get(workspaceId)?.has(userId) ?? false;
    },
    async insertLedgerAccount(account) {
      const created: LedgerAccount = { ...account, id: crypto.randomUUID() };
      accounts.set(created.id, created);
      return created;
    },
    async listLedgerAccounts(workspaceId) {
      return [...accounts.values()].filter(
        (account) => account.workspaceId === workspaceId,
      );
    },
    async insertProfile(profile) {
      const created: StoredProfile = { ...profile, id: crypto.randomUUID() };
      profiles.set(created.id, created);
      return created;
    },
    async getProfile(profileId) {
      return profiles.get(profileId);
    },
    async listProfiles(workspaceId) {
      return [...profiles.values()].filter(
        (profile) => profile.workspaceId === workspaceId,
      );
    },
    async insertPostedCashExpense(input) {
      const id = crypto.randomUUID();
      const posted: StoredCashExpense = {
        id,
        financialAccountProfileId: input.financialAccountProfileId,
        description: input.description,
        accountingDate: input.accountingDate,
        period: input.period,
        idempotencyKey: input.idempotencyKey,
        lines: input.lines.map((line) => ({
          ...line,
          journalEntryId: id,
          name: "",
        })),
      };
      entries.get(input.workspaceId)?.push(posted);
      return posted;
    },
    async findPostedCashExpense(workspaceId, idempotencyKey) {
      return entries
        .get(workspaceId)
        ?.find((entry) => entry.idempotencyKey === idempotencyKey);
    },
    async listPostedCashExpenses(workspaceId) {
      return entries.get(workspaceId) ?? [];
    },
    async insertAccountingPeriod(workspaceId, period) {
      const list = periods.get(workspaceId) ?? [];
      const existing = list.find(
        (item) => item.year === period.year && item.month === period.month,
      );
      if (existing) {
        return existing;
      }
      list.push(period);
      periods.set(workspaceId, list);
      return period;
    },
    async getAccountingPeriod(workspaceId, period) {
      return periods
        .get(workspaceId)
        ?.find((item) => item.year === period.year && item.month === period.month);
    },
    async lockAccountingPeriod(workspaceId, period) {
      const list = periods.get(workspaceId) ?? [];
      const index = list.findIndex(
        (item) => item.year === period.year && item.month === period.month,
      );
      if (index < 0) {
        throw new AccountingError("accounting_period_not_found");
      }
      const locked: AccountingPeriod = {
        year: period.year,
        month: period.month,
        status: "locked",
      };
      list[index] = locked;
      return locked;
    },
  };

  return createAccountingCore(store, clock);
}
