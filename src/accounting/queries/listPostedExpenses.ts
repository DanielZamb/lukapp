import { expenseEligibility } from "./expenseEligibility";
import { AccountingError } from "../errors";
import { requireWorkspace } from "../membership";
import { periodFromAccountingDate } from "../period";
import type { AccountingStore, Actor, PostedExpense } from "../types";

export type ExpenseReadStore = Pick<AccountingStore,
  "getWorkspace" | "membershipRole" | "listExpenseEntriesInRange" | "getLedgerAccount" | "findReversalOf" | "listJournalSourceEffects" | "getJournalEntry">;

export async function listPostedExpenses(store: ExpenseReadStore, input: {
  actor: Actor; workspaceId: string; from: string; through: string;
}): Promise<PostedExpense[]> {
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor);
  periodFromAccountingDate(input.from);
  periodFromAccountingDate(input.through);
  if (input.from > input.through) throw new AccountingError("accounting_date_required");
  const entries = await store.listExpenseEntriesInRange(input.workspaceId, input.from, input.through);
  return Promise.all(entries.map(async entry => {
    const expenseLines: PostedExpense["expenseLines"] = [];
    for (const line of entry.lines) {
      const account = await store.getLedgerAccount(line.ledgerAccountId);
      if (account?.nature === "Expense" && line.debitMinorUnits > 0) {
        expenseLines.push({ ledgerAccountId: account.id,
          amount: { currency: workspace.functionalCurrency, minorUnits: line.debitMinorUnits } });
      }
    }
    const reversal = await store.findReversalOf(entry.id);
    const eligibility = await expenseEligibility(store, { workspaceId: input.workspaceId, sourceEntryId: entry.id,
      originalMinorUnits: expenseLines.reduce((sum, line) => sum + line.amount.minorUnits, 0) });
    return {
      entryId: entry.id, accountingDate: entry.accountingDate, description: entry.description,
      expenseLines,
      currentEligibleAmount: { currency: workspace.functionalCurrency, minorUnits: reversal ? 0 : eligibility.minorUnits },
      sourceEffects: eligibility.effects,
      amount: { currency: workspace.functionalCurrency,
        minorUnits: expenseLines.reduce((sum, line) => sum + line.amount.minorUnits, 0) },
      reversal: reversal ? { entryId: reversal.id, accountingDate: reversal.accountingDate, recordedAt: reversal.postedAt } : null,
    };
  }));
}
