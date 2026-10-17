import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { AccountingError } from "../src/accounting/errors";
import type {
  AccountingPeriod,
  AccountingStore,
  LedgerAccount,
  StoredJournalEntry,
  StoredPeriodStatus,
  StoredProfile,
  StoredWorkspace,
} from "../src/accounting/types";
import type { DataModel, Doc, Id, TableNames } from "./_generated/dataModel";

type ReadDb = GenericQueryCtx<DataModel>["db"];
type WriteDb = GenericMutationCtx<DataModel>["db"];
type ReadMethods = Omit<AccountingStore, WriteMethod>;
type WriteMethod =
  | "insertWorkspace"
  | "insertLedgerAccount"
  | "insertProfile"
  | "insertJournalEntry"
  | "insertAccountingPeriod"
  | "setAccountingPeriodStatus"
  | "insertPeriodControlDecision";

/** Caller-supplied ids arrive as strings; anything malformed or from another table reads as absent. */
function idFor<Table extends TableNames>(
  db: ReadDb,
  table: Table,
  id: string,
): Id<Table> | null {
  return db.normalizeId(table, id);
}

/** Only for ids the kernel got back from this store, never raw caller input. */
function storedId<Table extends TableNames>(id: string): Id<Table> {
  return id as Id<Table>;
}

function findAccountingPeriod(
  db: ReadDb,
  workspaceId: Id<"workspaces">,
  period: { year: number; month: number },
) {
  return db
    .query("accountingPeriods")
    .withIndex("by_workspace_year_month", (q) =>
      q
        .eq("workspaceId", workspaceId)
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
  return { year: doc.year, month: doc.month, status: doc.status };
}

function toLedgerAccount(doc: Doc<"ledgerAccounts">): LedgerAccount {
  return {
    id: doc._id,
    workspaceId: doc.workspaceId,
    code: doc.code,
    name: doc.name,
    nature: doc.nature,
    normalSide: doc.normalSide,
    role: doc.role,
  };
}

function toProfile(doc: Doc<"financialAccountProfiles">): StoredProfile {
  return {
    id: doc._id,
    workspaceId: doc.workspaceId,
    name: doc.name,
    productKind: doc.productKind,
    classificationPolicy: doc.classificationPolicy,
    postingAccountId: doc.postingAccountId,
  };
}

function toEntry(
  doc: Doc<"journalEntries">,
  lines: Doc<"journalLines">[],
): StoredJournalEntry {
  const entry: StoredJournalEntry = {
    id: doc._id,
    workspaceId: doc.workspaceId,
    accountingDate: doc.accountingDate,
    period: { year: doc.periodYear, month: doc.periodMonth },
    description: doc.description,
    idempotencyKey: doc.idempotencyKey,
    policy: doc.policy,
    postedBy: doc.postedBy,
    postedAt: doc.postedAt,
    lines: lines
      .filter((line) => line.journalEntryId === doc._id)
      .sort((a, b) => a.lineNumber - b.lineNumber)
      .map((line) => ({
        ledgerAccountId: line.ledgerAccountId,
        debitMinorUnits: line.debitMinorUnits,
        creditMinorUnits: line.creditMinorUnits,
      })),
  };
  if (doc.financialAccountProfileId) {
    entry.financialAccountProfileId = doc.financialAccountProfileId;
  }
  if (doc.reversesEntryId) {
    entry.reversesEntryId = doc.reversesEntryId;
  }
  return entry;
}

function readStore(db: ReadDb): ReadMethods {
  async function withLines(doc: Doc<"journalEntries"> | null) {
    if (!doc) {
      return undefined;
    }
    const lines = await db
      .query("journalLines")
      .withIndex("by_entry", (q) => q.eq("journalEntryId", doc._id))
      .collect();
    return toEntry(doc, lines);
  }

  return {
    async getWorkspace(workspaceId) {
      const id = idFor(db, "workspaces", workspaceId);
      const doc = id && (await db.get(id));
      if (!doc) {
        return undefined;
      }
      const stored: StoredWorkspace = {
        id: doc._id,
        kind: doc.kind,
        functionalCurrency: doc.functionalCurrency,
        chartOfAccountsTemplate: doc.chartOfAccountsTemplate,
      };
      return stored;
    },

    async isMember(workspaceId, userId) {
      const id = idFor(db, "workspaces", workspaceId);
      if (!id) {
        return false;
      }
      const membership = await db
        .query("workspaceMemberships")
        .withIndex("by_workspace_user", (q) =>
          q.eq("workspaceId", id).eq("userId", userId),
        )
        .unique();
      return membership !== null;
    },

    async getLedgerAccount(accountId) {
      const id = idFor(db, "ledgerAccounts", accountId);
      const doc = id && (await db.get(id));
      return doc ? toLedgerAccount(doc) : undefined;
    },

    async findLedgerAccountByCode(workspaceId, code) {
      const doc = await db
        .query("ledgerAccounts")
        .withIndex("by_workspace_code", (q) =>
          q
            .eq("workspaceId", storedId<"workspaces">(workspaceId))
            .eq("code", code),
        )
        .unique();
      return doc ? toLedgerAccount(doc) : undefined;
    },

    async listLedgerAccounts(workspaceId) {
      const docs = await db
        .query("ledgerAccounts")
        .withIndex("by_workspace", (q) =>
          q.eq("workspaceId", storedId<"workspaces">(workspaceId)),
        )
        .collect();
      return docs.map(toLedgerAccount);
    },

    async getProfile(profileId) {
      const id = idFor(db, "financialAccountProfiles", profileId);
      const doc = id && (await db.get(id));
      return doc ? toProfile(doc) : undefined;
    },

    async listProfiles(workspaceId) {
      const docs = await db
        .query("financialAccountProfiles")
        .withIndex("by_workspace", (q) =>
          q.eq("workspaceId", storedId<"workspaces">(workspaceId)),
        )
        .collect();
      return docs.map(toProfile);
    },

    async getJournalEntry(entryId) {
      const id = idFor(db, "journalEntries", entryId);
      return withLines(id && (await db.get(id)));
    },

    async findJournalEntryByIdempotencyKey(workspaceId, idempotencyKey) {
      return withLines(
        await db
          .query("journalEntries")
          .withIndex("by_workspace_idempotency", (q) =>
            q
              .eq("workspaceId", storedId<"workspaces">(workspaceId))
              .eq("idempotencyKey", idempotencyKey),
          )
          .unique(),
      );
    },

    async findReversalOf(entryId) {
      return withLines(
        await db
          .query("journalEntries")
          .withIndex("by_reverses", (q) =>
            q.eq("reversesEntryId", storedId<"journalEntries">(entryId)),
          )
          .first(),
      );
    },

    async listJournalEntries(workspaceId) {
      const workspace = storedId<"workspaces">(workspaceId);
      const [docs, lines] = await Promise.all([
        db
          .query("journalEntries")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace))
          .collect(),
        db
          .query("journalLines")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace))
          .collect(),
      ]);
      return docs.map((doc) => toEntry(doc, lines));
    },

    async getAccountingPeriod(workspaceId, period) {
      const doc = await findAccountingPeriod(
        db,
        storedId<"workspaces">(workspaceId),
        period,
      );
      return doc ? toAccountingPeriod(doc) : undefined;
    },
  };
}

function writeStore(db: WriteDb): Pick<AccountingStore, WriteMethod> {
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

    async insertLedgerAccount(account) {
      const id = await db.insert("ledgerAccounts", {
        ...account,
        workspaceId: storedId<"workspaces">(account.workspaceId),
      });
      return { id, ...account };
    },

    async insertProfile(profile) {
      const id = await db.insert("financialAccountProfiles", {
        ...profile,
        workspaceId: storedId<"workspaces">(profile.workspaceId),
        postingAccountId: storedId<"ledgerAccounts">(profile.postingAccountId),
      });
      return { id, ...profile };
    },

    async insertJournalEntry(entry) {
      const workspaceId = storedId<"workspaces">(entry.workspaceId);
      const journalEntryId = await db.insert("journalEntries", {
        workspaceId,
        accountingDate: entry.accountingDate,
        periodYear: entry.period.year,
        periodMonth: entry.period.month,
        description: entry.description,
        idempotencyKey: entry.idempotencyKey,
        policy: entry.policy,
        postedBy: entry.postedBy,
        postedAt: entry.postedAt,
        ...(entry.financialAccountProfileId
          ? {
              financialAccountProfileId: storedId<"financialAccountProfiles">(
                entry.financialAccountProfileId,
              ),
            }
          : {}),
        ...(entry.reversesEntryId
          ? { reversesEntryId: storedId<"journalEntries">(entry.reversesEntryId) }
          : {}),
      });
      for (const [lineNumber, line] of entry.lines.entries()) {
        await db.insert("journalLines", {
          workspaceId,
          journalEntryId,
          lineNumber,
          ledgerAccountId: storedId<"ledgerAccounts">(line.ledgerAccountId),
          debitMinorUnits: line.debitMinorUnits,
          creditMinorUnits: line.creditMinorUnits,
        });
      }
      return { ...entry, id: journalEntryId };
    },

    async insertAccountingPeriod(workspaceId, period) {
      const id = storedId<"workspaces">(workspaceId);
      const existing = await findAccountingPeriod(db, id, period);
      if (existing) {
        return toAccountingPeriod(existing);
      }
      await db.insert("accountingPeriods", { workspaceId: id, ...period });
      return period;
    },

    async setAccountingPeriodStatus(workspaceId, period, status) {
      const doc = await findAccountingPeriod(
        db,
        storedId<"workspaces">(workspaceId),
        period,
      );
      if (!doc) {
        throw new AccountingError("accounting_period_not_found");
      }
      await db.patch(doc._id, { status });
      return toAccountingPeriod({ ...doc, status });
    },

    async insertPeriodControlDecision(workspaceId, decision) {
      await db.insert("periodControlDecisions", {
        workspaceId: storedId<"workspaces">(workspaceId),
        year: decision.period.year,
        month: decision.period.month,
        action: decision.action,
        decidedBy: decision.decidedBy,
        decidedAt: decision.decidedAt,
        ...(decision.reason ? { reason: decision.reason } : {}),
      });
    },
  };
}

function unavailable(method: string): never {
  throw new Error(`${method} is not available on a read`);
}

function readOnlyWrites(): Pick<AccountingStore, WriteMethod> {
  return {
    insertWorkspace: async () => unavailable("insertWorkspace"),
    insertLedgerAccount: async () => unavailable("insertLedgerAccount"),
    insertProfile: async () => unavailable("insertProfile"),
    insertJournalEntry: async () => unavailable("insertJournalEntry"),
    insertAccountingPeriod: async () => unavailable("insertAccountingPeriod"),
    setAccountingPeriodStatus: async () => unavailable("setAccountingPeriodStatus"),
    insertPeriodControlDecision: async () =>
      unavailable("insertPeriodControlDecision"),
  };
}

export function convexReadStore(db: ReadDb): AccountingStore {
  return { ...readStore(db), ...readOnlyWrites() };
}

export function convexStore(db: WriteDb): AccountingStore {
  return { ...readStore(db), ...writeStore(db) };
}
