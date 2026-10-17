import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type {
  RecoveryLedgerEntry,
  RecoveryPlan,
  RecoveryReadStore,
  RecoveryWriteStore,
} from "../src/savingsRecovery/types";
import { RecoveryError } from "../src/savingsRecovery/policy";
import { convexReadStore } from "./store";

function planView({ _id, _creationTime, ...plan }: Doc<"savingsRecoveryPlans">): RecoveryPlan {
  return { id: _id, ...plan };
}

export function recoveryReadStore(ctx: Pick<QueryCtx, "db">, workspaceId: string): RecoveryReadStore {
  const id = ctx.db.normalizeId("workspaces", workspaceId);
  if (!id) throw new RecoveryError("workspace_not_found");
  const accounting = convexReadStore(ctx.db);
  async function ledger() {
    const [entries, accounts, profiles] = await Promise.all([
      accounting.listJournalEntries(workspaceId),
      accounting.listLedgerAccounts(workspaceId),
      accounting.listProfiles(workspaceId),
    ]);
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const profileByPosting = new Map(profiles.map((profile) => [profile.postingAccountId, profile]));
    return entries.map((entry) => toLedger(entry, accountById, profileByPosting));
  }
  return {
    functionalCurrency: async () => {
      const workspace = await ctx.db.get(id);
      if (!workspace) throw new RecoveryError("workspace_not_found");
      return workspace.functionalCurrency;
    },
    listPlans: async () => (await ctx.db.query("savingsRecoveryPlans")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", id)).collect()).map(planView),
    listContributions: async () => (await ctx.db.query("savingsRecoveryContributions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", id)).collect())
      .map(({ _id, _creationTime, ...contribution }) => ({ id: _id, ...contribution })),
    listProfiles: async () => (await accounting.listProfiles(workspaceId))
      .map((profile) => ({ id: profile.id, workspaceId: profile.workspaceId, name: profile.name, productKind: profile.productKind })),
    getEntry: async (entryId) => {
      const entry = await accounting.getJournalEntry(entryId);
      if (!entry || entry.workspaceId !== workspaceId) return null;
      const [accounts, profiles] = await Promise.all([
        accounting.listLedgerAccounts(workspaceId), accounting.listProfiles(workspaceId),
      ]);
      return toLedger(entry, new Map(accounts.map((account) => [account.id, account])),
        new Map(profiles.map((profile) => [profile.postingAccountId, profile])));
    },
    findReversalOf: async (entryId) => {
      const reversal = await accounting.findReversalOf(entryId);
      return reversal ? { id: reversal.id, workspaceId: reversal.workspaceId, policy: reversal.policy,
        description: reversal.description, accountingDate: reversal.accountingDate,
        amountMinorUnits: reversal.lines.reduce((sum, line) => sum + line.debitMinorUnits, 0),
        reversesEntryId: reversal.reversesEntryId } : null;
    },
    listExpenseEntries: async () => {
      const entries = (await ledger()).filter((entry) => entry.policy === "cash-expense@1" && !entry.reversesEntryId);
      const live: RecoveryLedgerEntry[] = [];
      for (const entry of entries) {
        if (!(await accounting.findReversalOf(entry.id)) && entry.amountMinorUnits > 0) live.push(entry);
      }
      return live;
    },
  };
}

export function recoveryWriteStore(ctx: Pick<MutationCtx, "db">, workspaceId: string): RecoveryWriteStore {
  const read = recoveryReadStore(ctx, workspaceId);
  const id = ctx.db.normalizeId("workspaces", workspaceId);
  if (!id) throw new RecoveryError("workspace_not_found");
  return {
    ...read,
    findPlanRequest: async (key) => {
      const plan = await ctx.db.query("savingsRecoveryPlans")
        .withIndex("by_workspace_request", (q) => q.eq("workspaceId", id).eq("idempotencyKey", key)).unique();
      return plan ? planView(plan) : null;
    },
    findContributionRequest: async (key) => {
      const contribution = await ctx.db.query("savingsRecoveryContributions")
        .withIndex("by_workspace_request", (q) => q.eq("workspaceId", id).eq("idempotencyKey", key)).unique();
      if (!contribution) return null;
      const { _id, _creationTime, ...rest } = contribution;
      return { id: _id, ...rest };
    },
    insertPlan: async (plan) => {
      const sourceJournalEntryId = ctx.db.normalizeId("journalEntries", plan.sourceJournalEntryId);
      const destinationFinancialAccountProfileId = ctx.db.normalizeId(
        "financialAccountProfiles", plan.destinationFinancialAccountProfileId,
      );
      if (!sourceJournalEntryId || !destinationFinancialAccountProfileId)
        throw new RecoveryError("expense_not_found");
      const planId = await ctx.db.insert("savingsRecoveryPlans", {
        ...plan, workspaceId: id, sourceJournalEntryId, destinationFinancialAccountProfileId,
      });
      return { ...plan, id: planId };
    },
    insertContribution: async (contribution) => {
      const planId = ctx.db.normalizeId("savingsRecoveryPlans", contribution.planId);
      const transferJournalEntryId = ctx.db.normalizeId("journalEntries", contribution.transferJournalEntryId);
      if (!planId || !transferJournalEntryId) throw new RecoveryError("transfer_not_found");
      const contributionId = await ctx.db.insert("savingsRecoveryContributions", {
        ...contribution, workspaceId: id, planId, transferJournalEntryId,
      });
      return { ...contribution, id: contributionId };
    },
  };
}

function toLedger(
  entry: Awaited<ReturnType<ReturnType<typeof convexReadStore>["listJournalEntries"]>>[number],
  accounts: Map<string, { nature: string }>,
  profileByPosting: Map<string, { id: string }>,
): RecoveryLedgerEntry {
  const expense = entry.lines
    .filter((line) => accounts.get(line.ledgerAccountId)?.nature === "Expense")
    .reduce((sum, line) => sum + line.debitMinorUnits - line.creditMinorUnits, 0);
  const debit = entry.lines.find((line) => line.debitMinorUnits > 0);
  return {
    id: entry.id,
    workspaceId: entry.workspaceId,
    policy: entry.policy,
    description: entry.description,
    accountingDate: entry.accountingDate,
    amountMinorUnits: entry.policy === "cash-expense@1" ? expense : entry.lines.reduce((sum, line) => sum + line.debitMinorUnits, 0),
    financialAccountProfileId: entry.financialAccountProfileId,
    reversesEntryId: entry.reversesEntryId,
    destinationFinancialAccountProfileId: debit
      ? profileByPosting.get(debit.ledgerAccountId)?.id : undefined,
  };
}
