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
  | "saveHouseholdWorkspaceCreation"
  | "insertWorkspace"
  | "insertLedgerAccount"
  | "insertProfile"
  | "clearProfileOpening"
  | "saveOpeningPosition"
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

function requiredId<Table extends TableNames>(
  db: ReadDb,
  table: Table,
  id: string,
): Id<Table> {
  const normalized = idFor(db, table, id);
  if (!normalized) throw new Error(`Store received an invalid ${table} id`);
  return normalized;
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
    ...(doc.setupIdempotencyKey !== undefined
      ? { setupIdempotencyKey: doc.setupIdempotencyKey }
      : {}),
    ...(doc.opening ? { opening: doc.opening } : {}),
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

    async listOwnedWorkspaceIds(userId) {
      const memberships = await db
        .query("workspaceMemberships")
        .withIndex("by_user_role", (q) =>
          q.eq("userId", userId).eq("role", "Owner"),
        )
        .collect();
      const ids: string[] = [];
      for (const membership of memberships) {
        if (await db.get(membership.workspaceId)) ids.push(membership.workspaceId);
      }
      return ids;
    },

    async findHouseholdWorkspaceByKey(userId, key) {
      const receipt = await db
        .query("householdWorkspaceCreations")
        .withIndex("by_owner_key", (q) =>
          q.eq("ownerUserId", userId).eq("idempotencyKey", key),
        )
        .unique();
      return receipt?.workspaceId;
    },

    async membershipRole(workspaceId, userId) {
      const id = idFor(db, "workspaces", workspaceId);
      if (!id) {
        return undefined;
      }
      const membership = await db
        .query("workspaceMemberships")
        .withIndex("by_workspace_user", (q) =>
          q.eq("workspaceId", id).eq("userId", userId),
        )
        .unique();
      return membership?.role;
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
            .eq("workspaceId", requiredId(db, "workspaces", workspaceId))
            .eq("code", code),
        )
        .unique();
      return doc ? toLedgerAccount(doc) : undefined;
    },

    async listLedgerAccounts(workspaceId) {
      const docs = await db
        .query("ledgerAccounts")
        .withIndex("by_workspace", (q) =>
          q.eq("workspaceId", requiredId(db, "workspaces", workspaceId)),
        )
        .collect();
      return docs.map(toLedgerAccount);
    },

    async getProfile(profileId) {
      const id = idFor(db, "financialAccountProfiles", profileId);
      const doc = id && (await db.get(id));
      return doc ? toProfile(doc) : undefined;
    },

    async findProfileBySetupKey(workspaceId, key) {
      const doc = await db
        .query("financialAccountProfiles")
        .withIndex("by_workspace_setup", (q) =>
          q
            .eq("workspaceId", requiredId(db, "workspaces", workspaceId))
            .eq("setupIdempotencyKey", key),
        )
        .unique();
      return doc ? toProfile(doc) : undefined;
    },

    async findOpeningPositionByKey(workspaceId, key) {
      const doc = await db
        .query("openingPositions")
        .withIndex("by_workspace_idempotency", (q) =>
          q
            .eq("workspaceId", requiredId(db, "workspaces", workspaceId))
            .eq("idempotencyKey", key),
        )
        .unique();
      return doc
        ? {
            workspaceId: doc.workspaceId,
            financialAccountProfileId: doc.financialAccountProfileId,
            description: doc.description,
            opening: doc.opening,
            ...(doc.replacesOpeningKey !== undefined
              ? { replacesOpeningKey: doc.replacesOpeningKey }
              : {}),
          }
        : undefined;
    },

    async listProfiles(workspaceId) {
      const docs = await db
        .query("financialAccountProfiles")
        .withIndex("by_workspace", (q) =>
          q.eq("workspaceId", requiredId(db, "workspaces", workspaceId)),
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
              .eq("workspaceId", requiredId(db, "workspaces", workspaceId))
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
            q.eq("reversesEntryId", requiredId(db, "journalEntries", entryId)),
          )
          .first(),
      );
    },

    async listJournalEntries(workspaceId) {
      const workspace = requiredId(db, "workspaces", workspaceId);
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
        requiredId(db, "workspaces", workspaceId),
        period,
      );
      return doc ? toAccountingPeriod(doc) : undefined;
    },
  };
}

function writeStore(db: WriteDb): Pick<AccountingStore, WriteMethod> {
  return {
    async saveHouseholdWorkspaceCreation(input) {
      await db.insert("householdWorkspaceCreations", {
        ...input,
        workspaceId: requiredId(db, "workspaces", input.workspaceId),
      });
    },

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
        workspaceId: requiredId(db, "workspaces", account.workspaceId),
      });
      return { id, ...account };
    },

    async insertProfile(profile) {
      const id = await db.insert("financialAccountProfiles", {
        ...profile,
        workspaceId: requiredId(db, "workspaces", profile.workspaceId),
        postingAccountId: requiredId(
          db,
          "ledgerAccounts",
          profile.postingAccountId,
        ),
      });
      return { id, ...profile };
    },

    async clearProfileOpening(profileId) {
      await db.patch(requiredId(db, "financialAccountProfiles", profileId), {
        opening: undefined,
      });
    },

    async saveOpeningPosition(position) {
      await db.insert("openingPositions", {
        ...position,
        workspaceId: requiredId(db, "workspaces", position.workspaceId),
        financialAccountProfileId: requiredId(
          db,
          "financialAccountProfiles",
          position.financialAccountProfileId,
        ),
        idempotencyKey: position.opening.idempotencyKey,
      });
      await db.patch(
        requiredId(
          db,
          "financialAccountProfiles",
          position.financialAccountProfileId,
        ),
        { opening: position.opening },
      );
    },

    async insertJournalEntry(entry) {
      const workspaceId = requiredId(db, "workspaces", entry.workspaceId);
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
              financialAccountProfileId: requiredId(
                db,
                "financialAccountProfiles",
                entry.financialAccountProfileId,
              ),
            }
          : {}),
        ...(entry.reversesEntryId
          ? {
              reversesEntryId: requiredId(
                db,
                "journalEntries",
                entry.reversesEntryId,
              ),
            }
          : {}),
      });
      for (const [lineNumber, line] of entry.lines.entries()) {
        await db.insert("journalLines", {
          workspaceId,
          journalEntryId,
          lineNumber,
          ledgerAccountId: requiredId(
            db,
            "ledgerAccounts",
            line.ledgerAccountId,
          ),
          debitMinorUnits: line.debitMinorUnits,
          creditMinorUnits: line.creditMinorUnits,
        });
      }
      return { ...entry, id: journalEntryId };
    },

    async insertAccountingPeriod(workspaceId, period) {
      const id = requiredId(db, "workspaces", workspaceId);
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
        requiredId(db, "workspaces", workspaceId),
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
        workspaceId: requiredId(db, "workspaces", workspaceId),
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
    saveHouseholdWorkspaceCreation: async () =>
      unavailable("saveHouseholdWorkspaceCreation"),
    insertWorkspace: async () => unavailable("insertWorkspace"),
    insertLedgerAccount: async () => unavailable("insertLedgerAccount"),
    insertProfile: async () => unavailable("insertProfile"),
    clearProfileOpening: async () => unavailable("clearProfileOpening"),
    saveOpeningPosition: async () => unavailable("saveOpeningPosition"),
    insertJournalEntry: async () => unavailable("insertJournalEntry"),
    insertAccountingPeriod: async () => unavailable("insertAccountingPeriod"),
    setAccountingPeriodStatus: async () =>
      unavailable("setAccountingPeriodStatus"),
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
