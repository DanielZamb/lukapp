import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel, Id } from "./_generated/dataModel";
import type {
  AccountingPeriod,
  AccountingStore,
  JournalLine,
  LedgerAccount,
  PostedActivity,
  StoredProfile,
  StoredWorkspace,
} from "../src/accounting/accounting";

type Db = GenericQueryCtx<DataModel>["db"] | GenericMutationCtx<DataModel>["db"];
type Writer = GenericMutationCtx<DataModel>["db"];

function writer(db: Db) {
  return db as Writer;
}

function asWorkspaceId(workspaceId: string) {
  return workspaceId as Id<"workspaces">;
}

function asAccountId(accountId: string) {
  return accountId as Id<"ledgerAccounts">;
}

function asProfileId(profileId: string) {
  return profileId as Id<"financialAccountProfiles">;
}

export function convexStore(db: Db): AccountingStore {
  return {
    async insertWorkspace(workspace, ownerUserId) {
      const workspaceId = await writer(db).insert("workspaces", workspace);
      await writer(db).insert("workspaceMemberships", {
        workspaceId,
        userId: ownerUserId,
        role: "Owner",
      });
      return { id: workspaceId, ...workspace };
    },

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

    async setExpenseAccount(workspaceId, expenseAccountId) {
      await writer(db).patch(asWorkspaceId(workspaceId), {
        expenseAccountId: asAccountId(expenseAccountId),
      });
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

    async insertLedgerAccount(account) {
      const id = await writer(db).insert("ledgerAccounts", {
        workspaceId: asWorkspaceId(account.workspaceId),
        name: account.name,
      });
      const created: LedgerAccount = { id, ...account };
      return created;
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

    async insertProfile(profile) {
      const id = await writer(db).insert("financialAccountProfiles", {
        workspaceId: asWorkspaceId(profile.workspaceId),
        name: profile.name,
        productKind: "checking",
        postingAccountId: asAccountId(profile.postingAccountId),
      });
      const created: StoredProfile = { id, ...profile };
      return created;
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

    async insertPostedEntry(input) {
      const journalEntryId = await writer(db).insert("postedJournalEntries", {
        workspaceId: asWorkspaceId(input.workspaceId),
        accountingDate: input.accountingDate,
        description: input.description,
        currency: input.amount.currency,
        minorUnits: input.amount.minorUnits,
      });
      for (const line of input.lines) {
        await writer(db).insert("journalLines", {
          workspaceId: asWorkspaceId(input.workspaceId),
          journalEntryId,
          ledgerAccountId: asAccountId(line.ledgerAccountId),
          debitMinorUnits: line.debitMinorUnits,
          creditMinorUnits: line.creditMinorUnits,
        });
      }
      const posted: PostedActivity = {
        id: journalEntryId,
        description: input.description,
        accountingDate: input.accountingDate,
        amount: input.amount,
      };
      return posted;
    },

    async listPostedActivity(workspaceId) {
      const docs = await db
        .query("postedJournalEntries")
        .withIndex("by_workspace", (q) =>
          q.eq("workspaceId", asWorkspaceId(workspaceId)),
        )
        .collect();
      return docs.map((doc) => ({
        id: doc._id,
        description: doc.description,
        accountingDate: doc.accountingDate,
        amount: { currency: doc.currency, minorUnits: doc.minorUnits },
      }));
    },

    async listLines(workspaceId) {
      const docs = await db
        .query("journalLines")
        .withIndex("by_workspace", (q) =>
          q.eq("workspaceId", asWorkspaceId(workspaceId)),
        )
        .collect();
      return docs.map(
        (doc): JournalLine => ({
          ledgerAccountId: doc.ledgerAccountId,
          debitMinorUnits: doc.debitMinorUnits,
          creditMinorUnits: doc.creditMinorUnits,
        }),
      );
    },

    async insertAccountingPeriod(workspaceId, period) {
      await writer(db).insert("accountingPeriods", {
        workspaceId: asWorkspaceId(workspaceId),
        year: period.year,
        month: period.month,
      });
      return period;
    },

    async getAccountingPeriod(workspaceId, period) {
      const doc = await db
        .query("accountingPeriods")
        .withIndex("by_workspace_year_month", (q) =>
          q
            .eq("workspaceId", asWorkspaceId(workspaceId))
            .eq("year", period.year)
            .eq("month", period.month),
        )
        .unique();
      if (!doc) {
        return undefined;
      }
      const stored: AccountingPeriod = { year: doc.year, month: doc.month };
      return stored;
    },
  };
}
