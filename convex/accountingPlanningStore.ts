import type { QueryCtx } from "./_generated/server";
import { convexReadStore } from "./store";
import { AccountingError } from "../src/accounting/errors";
import type { AccountingPlanningReads, PostedExpenseLine } from "../src/accounting/planningReads";

export function accountingPlanningReads(db: QueryCtx["db"]): AccountingPlanningReads {
  const reads = convexReadStore(db);
  return {
    getWorkspace: reads.getWorkspace, membershipRole: reads.membershipRole,
    getCategory: reads.getCategory, getLedgerAccount: reads.getLedgerAccount,
    getProfile: reads.getProfile, findLedgerAccountByCode: reads.findLedgerAccountByCode,
    async postedExpenseLines(workspaceId, month) {
      const id = db.normalizeId("workspaces", workspaceId);
      if (!id) throw new AccountingError("workspace_membership_required");
      const entries = await db.query("journalEntries").withIndex("by_workspace_period", q =>
        q.eq("workspaceId", id).eq("periodYear", month.year).eq("periodMonth", month.month)).take(1001);
      if (entries.length > 1000) throw new AccountingError("planning_read_limit");
      const result: PostedExpenseLine[] = [];
      let count = 0;
      const accounts = new Map<string, Awaited<ReturnType<AccountingPlanningReads["getLedgerAccount"]>>>();
      for (const entry of entries) {
        const lines = await db.query("journalLines").withIndex("by_entry", q => q.eq("journalEntryId", entry._id)).take(10001);
        count += lines.length;
        if (count > 10000) throw new AccountingError("planning_read_limit");
        for (const line of lines) {
          if (line.workspaceId !== id) throw new AccountingError("journal_line_invalid");
          if (!accounts.has(line.ledgerAccountId)) accounts.set(line.ledgerAccountId, await reads.getLedgerAccount(line.ledgerAccountId));
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
