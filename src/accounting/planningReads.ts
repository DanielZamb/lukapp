import { resolveCashCategory } from "./cashCategory";
import { resolveTemplateAccount } from "./chartOfAccounts";
import { AccountingError } from "./errors";
import { requireFunctionalAmount } from "./money";
import { periodFromAccountingDate } from "./period";
import type { CategorySnapshot, CategoryCorrection } from "./categoryTypes";
import type { AccountingStore, CashActivityInput, LedgerAccount, Money, PeriodKey, PostingPolicy, StoredWorkspace } from "./types";

export type PostedExpenseLine = {
  kind: "postedExpense";
  journalEntryId: string;
  lineNumber: number;
  accountingDate: string;
  postedAt: number;
  postedBy: string;
  postingPolicy: PostingPolicy;
  reversesEntryId?: string;
  account: Omit<LedgerAccount, "nature"> & { nature: "Expense" };
  debitMinorUnits: number;
  creditMinorUnits: number;
  category?: CategorySnapshot;
  categoryCorrection?: CategoryCorrection;
};
export type CashExpenseProposal = Pick<CashActivityInput,
  "financialAccountProfileId" | "accountingDate" | "amount" | "userCategoryId" | "categoryRevision" | "ledgerAccountCode">;
export type ProposedExpense = {
  kind: "proposedExpense";
  postingPolicy: "cash-expense@1";
  financialAccountProfileId: CashActivityInput["financialAccountProfileId"];
  accountingDate: string;
  month: PeriodKey;
  amount: Money;
  account: { code: string; name: string; nature: "Expense"; ledgerAccountId?: LedgerAccount["id"] };
  category?: CategorySnapshot;
};
export type AccountingPlanningReads = Pick<AccountingStore,
  "getWorkspace" | "membershipRole" | "getCategory" | "getLedgerAccount" | "getProfile" | "findLedgerAccountByCode"> & {
  postedExpenseLines(workspaceId: StoredWorkspace["id"], month: PeriodKey): Promise<PostedExpenseLine[]>;
};

export async function resolveExpenseProposal(
  reads: AccountingPlanningReads,
  workspace: StoredWorkspace,
  proposal: CashExpenseProposal,
): Promise<ProposedExpense> {
  requireFunctionalAmount(workspace, proposal.amount);
  const month = periodFromAccountingDate(proposal.accountingDate);
  const profile = await reads.getProfile(proposal.financialAccountProfileId);
  if (!profile || profile.workspaceId !== workspace.id) throw new AccountingError("financial_account_profile_not_found");
  const category = await resolveCashCategory(reads, { ...proposal, workspaceId: workspace.id }, "expense");
  const account = resolveTemplateAccount(workspace, "expense", proposal.ledgerAccountCode ?? category?.account.accountCode);
  if (account.nature !== "Expense") throw new AccountingError("cash_expense_account_invalid");
  const activated = await reads.findLedgerAccountByCode(workspace.id, account.code);
  return {
    kind: "proposedExpense", postingPolicy: "cash-expense@1",
    financialAccountProfileId: profile.id, accountingDate: proposal.accountingDate, month,
    amount: proposal.amount,
    account: { code: account.code, name: account.name, nature: "Expense", ...(activated ? { ledgerAccountId: activated.id } : {}) },
    ...(category ? { category } : {}),
  };
}
