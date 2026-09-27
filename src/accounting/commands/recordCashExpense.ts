import { AccountingError } from "../errors";
import {
  assertBalanced,
  ensureOpenPeriod,
  postedAmount,
  requireWorkspace,
  toPostedCashExpense,
} from "../helpers";
import { periodFromAccountingDate } from "../period";
import type {
  AccountingStore,
  Actor,
  DraftJournalLine,
  Money,
  PostedCashExpense,
} from "../types";

export async function recordCashExpense(
  store: AccountingStore,
  input: {
    actor: Actor;
    workspaceId: string;
    financialAccountProfileId: string;
    amount: Money;
    accountingDate: string;
    description: string;
    idempotencyKey: string;
  },
): Promise<PostedCashExpense> {
  const workspace = await requireWorkspace(store, input.workspaceId, input.actor);
  if (!input.idempotencyKey) {
    throw new AccountingError("idempotency_key_required");
  }
  const existing = await store.findPostedCashExpense(
    input.workspaceId,
    input.idempotencyKey,
  );
  if (existing) {
    const sameCommand =
      existing.financialAccountProfileId === input.financialAccountProfileId &&
      existing.accountingDate === input.accountingDate &&
      existing.description === input.description &&
      postedAmount(workspace, existing) === input.amount.minorUnits &&
      input.amount.currency === workspace.functionalCurrency;
    if (!sameCommand) {
      throw new AccountingError("idempotency_key_conflict");
    }
    return toPostedCashExpense(store, workspace, existing, true);
  }
  if (!workspace.expenseAccountId) {
    throw new AccountingError("expense_account_not_found");
  }
  if (
    !Number.isSafeInteger(input.amount.minorUnits) ||
    input.amount.minorUnits <= 0
  ) {
    throw new AccountingError("amount_must_be_positive");
  }
  if (input.amount.currency !== workspace.functionalCurrency) {
    throw new AccountingError("functional_currency_required");
  }
  const profile = await store.getProfile(input.financialAccountProfileId);
  if (!profile || profile.workspaceId !== input.workspaceId) {
    throw new AccountingError("financial_account_profile_not_found");
  }
  const lines: DraftJournalLine[] = [
    {
      ledgerAccountId: workspace.expenseAccountId,
      debitMinorUnits: input.amount.minorUnits,
      creditMinorUnits: 0,
    },
    {
      ledgerAccountId: profile.postingAccountId,
      debitMinorUnits: 0,
      creditMinorUnits: input.amount.minorUnits,
    },
  ];
  // Stryker disable next-line all -- cash-expense lines are constructed balanced
  assertBalanced(lines);
  const period = periodFromAccountingDate(input.accountingDate);
  const accountingPeriod = await ensureOpenPeriod(store, input.workspaceId, period);
  if (accountingPeriod.status === "locked") {
    throw new AccountingError("locked_period");
  }
  const posted = await store.insertPostedCashExpense({
    workspaceId: input.workspaceId,
    financialAccountProfileId: input.financialAccountProfileId,
    accountingDate: input.accountingDate,
    description: input.description,
    period,
    idempotencyKey: input.idempotencyKey,
    lines,
  });
  return toPostedCashExpense(store, workspace, posted, false);
}
