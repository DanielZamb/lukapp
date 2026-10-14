import type { QueryCtx } from "./_generated/server";
import { convexReadStore } from "./store";
import { AccountingError } from "../src/accounting/errors";
import type { AccountingPlanningReads, PostedExpenseLine } from "../src/accounting/planningReads";
import { planningDocuments, requirePlanningReadHeadroom } from "./planningReadCapacity";

export function accountingPlanningReads({ db, meta }: Pick<QueryCtx, "db" | "meta">): AccountingPlanningReads {
  const reads = convexReadStore(db);
  const accounts = new Map<string, Awaited<ReturnType<AccountingPlanningReads["getLedgerAccount"]>>>();
  let sourceQueries = 0;
  async function requireSourceRead() {
    if (sourceQueries === 2000) throw new AccountingError("planning_read_limit");
    await requirePlanningReadHeadroom(meta);
    sourceQueries++;
  }
  return {
    getWorkspace: reads.getWorkspace, membershipRole: reads.membershipRole,
    getCategory: reads.getCategory, getLedgerAccount: reads.getLedgerAccount,
    getProfile: reads.getProfile, findLedgerAccountByCode: reads.findLedgerAccountByCode,
    async postedExpenseLines(workspaceId, month) {
      const id = db.normalizeId("workspaces", workspaceId);
      if (!id) throw new AccountingError("workspace_membership_required");
      await requireSourceRead();
      const entries = await planningDocuments(meta, db.query("journalEntries").withIndex("by_workspace_period", q =>
        q.eq("workspaceId", id).eq("periodYear", month.year).eq("periodMonth", month.month)), 1000);
      const result: PostedExpenseLine[] = [];
      let count = 0;
      for (const entry of entries) {
        await requireSourceRead();
        const lines = await planningDocuments(meta, db.query("journalLines").withIndex("by_entry", q => q.eq("journalEntryId", entry._id)), 10000 - count);
        count += lines.length;
        for (const line of lines) {
          if (line.workspaceId !== id) throw new AccountingError("journal_line_invalid");
          if (!accounts.has(line.ledgerAccountId)) {
            await requireSourceRead();
            accounts.set(line.ledgerAccountId, await reads.getLedgerAccount(line.ledgerAccountId));
            await requirePlanningReadHeadroom(meta);
          }
          const account = accounts.get(line.ledgerAccountId);
          if (!account || account.workspaceId !== id) throw new AccountingError("ledger_account_not_found");
          if (account.nature !== "Expense") continue;
          result.push({ kind: "postedExpense", journalEntryId: entry._id, lineNumber: line.lineNumber,
            accountingDate: entry.accountingDate, postedAt: entry.postedAt, postedBy: entry.postedBy, postingPolicy: entry.policy,
            ...(entry.reversesEntryId ? { reversesEntryId: entry.reversesEntryId } : {}), account: { ...account, nature: "Expense" },
            debitMinorUnits: line.debitMinorUnits, creditMinorUnits: line.creditMinorUnits,
            ...(line.category ? { category: line.category } : {}), ...(line.categoryCorrection ? { categoryCorrection: line.categoryCorrection } : {}) });
        }
      }
      return result.sort((a, b) => a.accountingDate.localeCompare(b.accountingDate) || a.journalEntryId.localeCompare(b.journalEntryId) || a.lineNumber - b.lineNumber);
    },
  };
}
