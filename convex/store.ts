import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { AccountingError } from "../src/accounting/errors";
import type { DataModel, Id } from "./_generated/dataModel";
import type {
  AccountingPeriod,
  AccountingStore,
  JournalLine,
  LedgerAccount,
  StoredCashExpense,
  StoredPeriodStatus,
  StoredProfile,
  StoredWorkspace,
} from "../src/accounting/types";

type ReadDb = Pick<GenericQueryCtx<DataModel>["db"], "get" | "query">;
type WriteDb = GenericMutationCtx<DataModel>["db"];

function asWorkspaceId(workspaceId: string) {
  return workspaceId as Id<"workspaces">;
}

function asAccountId(accountId: string) {
  return accountId as Id<"ledgerAccounts">;
}

function asProfileId(profileId: string) {
  return profileId as Id<"financialAccountProfiles">;
}

function asEntryId(entryId: string) {
  return entryId as Id<"postedJournalEntries">;
}

function unavailable(method: string): never {
  throw new Error(`${method} is not available on a read`);
}

async function findAccountingPeriod(
  db: ReadDb,
  workspaceId: string,
  period: { year: number; month: number },
) {
  return db
    .query("accountingPeriods")
    .withIndex("by_workspace_year_month", (q) =>
      q
        .eq("workspaceId", asWorkspaceId(workspaceId))
        .eq("year", period.year)
        .eq("month", period.month),
    )
    .unique();
}

function toAccountingPeriod(doc: {
  year: number;
  month: number;
  status: StoredPeriodStatus;
}): AccountingPeriod {
  return {
    year: doc.year,
    month: doc.month,
    status: doc.status,
  };
}

async function readStore(db: ReadDb): Promise<
  Pick<
    AccountingStore,
    | "getWorkspace"
    | "isMember"
    | "listLedgerAccounts"
    | "getProfile"
    | "listProfiles"
    | "findPostedCashExpense"
    | "listPostedCashExpenses"
    | "getAccountingPeriod"
  >
> {
  function toLines(
    docs: Array<{
      journalEntryId: Id<"postedJournalEntries">;
      ledgerAccountId: Id<"ledgerAccounts">;
      debitMinorUnits: number;
      creditMinorUnits: number;
    }>,
  ): JournalLine[] {
    return docs.map((doc) => ({
      journalEntryId: doc.journalEntryId,
      ledgerAccountId: doc.ledgerAccountId,
      name: "",
      debitMinorUnits: doc.debitMinorUnits,
      creditMinorUnits: doc.creditMinorUnits,
    }));
  }

  async function linesForWorkspace(workspaceId: string): Promise<JournalLine[]> {
    const docs = await db
      .query("journalLines")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", asWorkspaceId(workspaceId)),
      )
      .collect();
    return toLines(docs);
  }

  async function linesForEntry(
    journalEntryId: Id<"postedJournalEntries">,
  ): Promise<JournalLine[]> {
    const docs = await db
      .query("journalLines")
      .withIndex("by_entry", (q) => q.eq("journalEntryId", journalEntryId))
      .collect();
    return toLines(docs);
  }

  async function toEntry(
    doc: {
      _id: Id<"postedJournalEntries">;
      financialAccountProfileId: Id<"financialAccountProfiles">;
      description: string;
      accountingDate: string;
      periodYear: number;
      periodMonth: number;
      idempotencyKey: string;
    },
    lines: JournalLine[],
  ): Promise<StoredCashExpense> {
    return {
      id: doc._id,
      financialAccountProfileId: doc.financialAccountProfileId,
      description: doc.description,
      accountingDate: doc.accountingDate,
      period: { year: doc.periodYear, month: doc.periodMonth },
      idempotencyKey: doc.idempotencyKey,
      lines: lines.filter((line) => line.journalEntryId === doc._id),
    };
  }

  return {
    async getWorkspace(workspaceId) {
      const doc = await db.get(asWorkspaceId(workspaceId));
      if (!doc) {
        return undefined;
      }
      const stored: StoredWorkspace = {
        id: doc._id,
        kind: doc.kind,
        functionalCurrency: doc.functionalCurrency,
      };
      if (doc.expenseAccountId) {
        stored.expenseAccountId = doc.expenseAccountId;
      }
      return stored;
    },

    async isMember(workspaceId, userId) {
      const membership = await db
        .query("workspaceMemberships")
        .withIndex("by_workspace_user", (q) =>
          q.eq("workspaceId", asWorkspaceId(workspaceId)).eq("userId", userId),
        )
        .unique();
      return membership !== null;
    },

    async listLedgerAccounts(workspaceId) {
      const docs = await db
        .query("ledgerAccounts")
        .withIndex("by_workspace", (q) =>
          q.eq("workspaceId", asWorkspaceId(workspaceId)),
        )
        .collect();
      return docs.map((doc) => ({
        id: doc._id,
        workspaceId: doc.workspaceId,
        name: doc.name,
      }));
    },

    async getProfile(profileId) {
      const doc = await db.get(asProfileId(profileId));
      if (!doc) {
        return undefined;
      }
      return {
        id: doc._id,
        workspaceId: doc.workspaceId,
        name: doc.name,
        postingAccountId: doc.postingAccountId,
      };
    },

    async listProfiles(workspaceId) {
      const docs = await db
        .query("financialAccountProfiles")
        .withIndex("by_workspace", (q) =>
          q.eq("workspaceId", asWorkspaceId(workspaceId)),
        )
        .collect();
      return docs.map((doc) => ({
        id: doc._id,
        workspaceId: doc.workspaceId,
        name: doc.name,
        postingAccountId: doc.postingAccountId,
      }));
    },

    async findPostedCashExpense(workspaceId, idempotencyKey) {
      const doc = await db
        .query("postedJournalEntries")
        .withIndex("by_workspace_idempotency", (q) =>
          q
            .eq("workspaceId", asWorkspaceId(workspaceId))
            .eq("idempotencyKey", idempotencyKey),
        )
        .unique();
      if (!doc) {
        return undefined;
      }
      return toEntry(doc, await linesForEntry(doc._id));
    },

    async listPostedCashExpenses(workspaceId) {
      const [docs, lines] = await Promise.all([
        db
          .query("postedJournalEntries")
          .withIndex("by_workspace", (q) =>
            q.eq("workspaceId", asWorkspaceId(workspaceId)),
          )
          .collect(),
        linesForWorkspace(workspaceId),
      ]);
      return Promise.all(docs.map((doc) => toEntry(doc, lines)));
    },

    async getAccountingPeriod(workspaceId, period) {
      const doc = await findAccountingPeriod(db, workspaceId, period);
      return doc ? toAccountingPeriod(doc) : undefined;
    },
  };
}

function writeStore(db: WriteDb): Pick<
  AccountingStore,
  | "insertWorkspace"
  | "setExpenseAccount"
  | "insertLedgerAccount"
  | "insertProfile"
  | "insertPostedCashExpense"
  | "insertAccountingPeriod"
  | "lockAccountingPeriod"
> {
  return {
    async insertWorkspace(workspace, ownerUserId) {
      const workspaceId = await db.insert("workspaces", workspace);
      await db.insert("workspaceMemberships", {
        workspaceId,
        userId: ownerUserId,
        role: "Owner",
      });
      return { id: workspaceId, ...workspace };
    },

    async setExpenseAccount(workspaceId, expenseAccountId) {
      await db.patch(asWorkspaceId(workspaceId), {
        expenseAccountId: asAccountId(expenseAccountId),
      });
    },

    async insertLedgerAccount(account) {
      const id = await db.insert("ledgerAccounts", {
        workspaceId: asWorkspaceId(account.workspaceId),
        name: account.name,
      });
      const created: LedgerAccount = { id, ...account };
      return created;
    },

    async insertProfile(profile) {
      const id = await db.insert("financialAccountProfiles", {
        workspaceId: asWorkspaceId(profile.workspaceId),
        name: profile.name,
        postingAccountId: asAccountId(profile.postingAccountId),
      });
      const created: StoredProfile = { id, ...profile };
      return created;
    },

    async insertPostedCashExpense(input) {
      const journalEntryId = await db.insert("postedJournalEntries", {
        workspaceId: asWorkspaceId(input.workspaceId),
        financialAccountProfileId: asProfileId(input.financialAccountProfileId),
        accountingDate: input.accountingDate,
        description: input.description,
        periodYear: input.period.year,
        periodMonth: input.period.month,
        idempotencyKey: input.idempotencyKey,
      });
      const lines: JournalLine[] = [];
      for (const line of input.lines) {
        await db.insert("journalLines", {
          workspaceId: asWorkspaceId(input.workspaceId),
          journalEntryId,
          ledgerAccountId: asAccountId(line.ledgerAccountId),
          debitMinorUnits: line.debitMinorUnits,
          creditMinorUnits: line.creditMinorUnits,
        });
        lines.push({ ...line, journalEntryId, name: "" });
      }
      return {
        id: journalEntryId,
        financialAccountProfileId: input.financialAccountProfileId,
        description: input.description,
        accountingDate: input.accountingDate,
        period: input.period,
        idempotencyKey: input.idempotencyKey,
        lines,
      };
    },

    async insertAccountingPeriod(workspaceId, period) {
      const existing = await findAccountingPeriod(db, workspaceId, period);
      if (existing) {
        return toAccountingPeriod(existing);
      }
      await db.insert("accountingPeriods", {
        workspaceId: asWorkspaceId(workspaceId),
        year: period.year,
        month: period.month,
        status: period.status,
      });
      return period;
    },

    async lockAccountingPeriod(workspaceId, period) {
      const doc = await findAccountingPeriod(db, workspaceId, period);
      if (!doc) {
        throw new AccountingError("accounting_period_not_found");
      }
      await db.patch(doc._id, { status: "locked" });
      return toAccountingPeriod({ ...doc, status: "locked" });
    },
  };
}

function readOnlyWrites(): Pick<
  AccountingStore,
  | "insertWorkspace"
  | "setExpenseAccount"
  | "insertLedgerAccount"
  | "insertProfile"
  | "insertPostedCashExpense"
  | "insertAccountingPeriod"
  | "lockAccountingPeriod"
> {
  return {
    insertWorkspace: async () => unavailable("insertWorkspace"),
    setExpenseAccount: async () => unavailable("setExpenseAccount"),
    insertLedgerAccount: async () => unavailable("insertLedgerAccount"),
    insertProfile: async () => unavailable("insertProfile"),
    insertPostedCashExpense: async () => unavailable("insertPostedCashExpense"),
    insertAccountingPeriod: async () => unavailable("insertAccountingPeriod"),
    lockAccountingPeriod: async () => unavailable("lockAccountingPeriod"),
  };
}

export async function convexReadStore(
  db: GenericQueryCtx<DataModel>["db"],
): Promise<AccountingStore> {
  return { ...(await readStore(db)), ...readOnlyWrites() };
}

export async function convexStore(
  db: GenericMutationCtx<DataModel>["db"],
): Promise<AccountingStore> {
  return { ...(await readStore(db)), ...writeStore(db) };
}
