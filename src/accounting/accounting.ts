export type Actor = {
  userId: string;
};

export type WorkspaceKind = "Personal";

export type AccountingPeriod = {
  year: number;
  month: number;
};

export type Workspace = {
  id: string;
  kind: WorkspaceKind;
  functionalCurrency: string;
  currentAccountingPeriod: AccountingPeriod;
};

export type ProductKind = "checking";

export type FinancialAccountProfile = {
  id: string;
  workspaceId: string;
  name: string;
};

export type Money = {
  currency: string;
  minorUnits: number;
};

export type PostedActivity = {
  id: string;
  description: string;
  accountingDate: string;
  amount: Money;
};

export type AccountBalance = {
  financialAccountProfileId: string;
  amount: Money;
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

export type JournalLine = {
  ledgerAccountId: string;
  debitMinorUnits: number;
  creditMinorUnits: number;
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
  insertPostedEntry(input: {
    workspaceId: string;
    accountingDate: string;
    description: string;
    amount: Money;
    lines: JournalLine[];
  }): Promise<PostedActivity>;
  listPostedActivity(workspaceId: string): Promise<PostedActivity[]>;
  listLines(workspaceId: string): Promise<JournalLine[]>;
  insertAccountingPeriod(
    workspaceId: string,
    period: AccountingPeriod,
  ): Promise<AccountingPeriod>;
  getAccountingPeriod(
    workspaceId: string,
    period: AccountingPeriod,
  ): Promise<AccountingPeriod | undefined>;
};

export type AccountingCore = {
  createPersonalWorkspace(input: {
    actor: Actor;
    functionalCurrency: string;
  }): Promise<Workspace>;
  openWorkspace(input: {
    actor: Actor;
    workspaceId: string;
  }): Promise<Workspace>;
  createFinancialAccountProfile(input: {
    actor: Actor;
    workspaceId: string;
    name: string;
    productKind: ProductKind;
  }): Promise<FinancialAccountProfile>;
  recordCashExpense(input: {
    actor: Actor;
    workspaceId: string;
    financialAccountProfileId: string;
    amount: Money;
    accountingDate: string;
    description: string;
  }): Promise<PostedActivity>;
  listPostedActivity(input: {
    actor: Actor;
    workspaceId: string;
  }): Promise<PostedActivity[]>;
  balances(input: {
    actor: Actor;
    workspaceId: string;
  }): Promise<AccountBalance[]>;
  trialBalance(input: {
    actor: Actor;
    workspaceId: string;
  }): Promise<TrialBalanceRow[]>;
};

function currentAccountingPeriod(now: Date): AccountingPeriod {
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
  };
}

export function createAccountingCore(
  store: AccountingStore,
  clock: AccountingClock = { now: () => new Date() },
): AccountingCore {
  async function requireMember(workspaceId: string, actor: Actor) {
    if (!(await store.isMember(workspaceId, actor.userId))) {
      throw new Error("Workspace Membership required");
    }
  }

  async function requireWorkspace(workspaceId: string, actor: Actor) {
    await requireMember(workspaceId, actor);
    const workspace = await store.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error("Workspace Membership required");
    }
    return workspace;
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
      const period = currentAccountingPeriod(clock.now());
      await store.insertAccountingPeriod(workspace.id, period);
      return {
        id: workspace.id,
        kind: workspace.kind,
        functionalCurrency: workspace.functionalCurrency,
        currentAccountingPeriod: period,
      };
    },

    async openWorkspace({ actor, workspaceId }) {
      const workspace = await requireWorkspace(workspaceId, actor);
      const period = currentAccountingPeriod(clock.now());
      const storedPeriod = await store.getAccountingPeriod(workspaceId, period);
      if (!storedPeriod) {
        throw new Error("Accounting Period not found");
      }
      return {
        id: workspace.id,
        kind: workspace.kind,
        functionalCurrency: workspace.functionalCurrency,
        currentAccountingPeriod: storedPeriod,
      };
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
      return {
        id: profile.id,
        workspaceId: profile.workspaceId,
        name: profile.name,
      };
    },

    async recordCashExpense({
      actor,
      workspaceId,
      financialAccountProfileId,
      amount,
      accountingDate,
      description,
    }) {
      const workspace = await requireWorkspace(workspaceId, actor);
      if (!workspace.expenseAccountId) {
        throw new Error("Expense account not found");
      }
      if (amount.minorUnits <= 0) {
        throw new Error("amount must be positive");
      }
      if (amount.currency !== workspace.functionalCurrency) {
        throw new Error("Functional Currency required");
      }
      const profile = await store.getProfile(financialAccountProfileId);
      if (!profile || profile.workspaceId !== workspaceId) {
        throw new Error("Financial Account Profile not found");
      }
      const lines: JournalLine[] = [
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
        throw new Error("Posted Journal Entry must be balanced");
      }
      return store.insertPostedEntry({
        workspaceId,
        accountingDate,
        description,
        amount,
        lines,
      });
    },

    async listPostedActivity({ actor, workspaceId }) {
      await requireMember(workspaceId, actor);
      return store.listPostedActivity(workspaceId);
    },

    async balances({ actor, workspaceId }) {
      const workspace = await requireWorkspace(workspaceId, actor);
      const [profiles, lines] = await Promise.all([
        store.listProfiles(workspaceId),
        store.listLines(workspaceId),
      ]);
      return profiles.map((profile) => ({
        financialAccountProfileId: profile.id,
        amount: {
          currency: workspace.functionalCurrency,
          minorUnits: lines
            .filter((line) => line.ledgerAccountId === profile.postingAccountId)
            .reduce(
              (sum, line) =>
                sum + line.debitMinorUnits - line.creditMinorUnits,
              0,
            ),
        },
      }));
    },

    async trialBalance({ actor, workspaceId }) {
      await requireMember(workspaceId, actor);
      const [accounts, lines] = await Promise.all([
        store.listLedgerAccounts(workspaceId),
        store.listLines(workspaceId),
      ]);
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
  };
}

export function createMemoryAccountingCore(
  clock: AccountingClock = { now: () => new Date() },
): AccountingCore {
  const workspaces = new Map<string, StoredWorkspace>();
  const members = new Map<string, Set<string>>();
  const accounts = new Map<string, LedgerAccount>();
  const profiles = new Map<string, StoredProfile>();
  const activity = new Map<string, PostedActivity[]>();
  const lines = new Map<string, JournalLine[]>();
  const periods = new Map<string, AccountingPeriod[]>();

  const store: AccountingStore = {
    async insertWorkspace(workspace, ownerUserId) {
      const created: StoredWorkspace = {
        ...workspace,
        id: crypto.randomUUID(),
      };
      workspaces.set(created.id, created);
      members.set(created.id, new Set([ownerUserId]));
      activity.set(created.id, []);
      lines.set(created.id, []);
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
    async insertPostedEntry(input) {
      const posted: PostedActivity = {
        id: crypto.randomUUID(),
        description: input.description,
        accountingDate: input.accountingDate,
        amount: input.amount,
      };
      activity.get(input.workspaceId)?.push(posted);
      lines.get(input.workspaceId)?.push(...input.lines);
      return posted;
    },
    async listPostedActivity(workspaceId) {
      return activity.get(workspaceId) ?? [];
    },
    async listLines(workspaceId) {
      return lines.get(workspaceId) ?? [];
    },
    async insertAccountingPeriod(workspaceId, period) {
      periods.get(workspaceId)?.push(period);
      return period;
    },
    async getAccountingPeriod(workspaceId, period) {
      return periods
        .get(workspaceId)
        ?.find((item) => item.year === period.year && item.month === period.month);
    },
  };

  return createAccountingCore(store, clock);
}
