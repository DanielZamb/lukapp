import { AccountingError } from "./errors";
import type {
  AccountingPeriod,
  AccountingStore,
  Actor,
  DraftJournalLine,
  FinancialAccountProfile,
  PostedCashExpense,
  StoredCashExpense,
  StoredProfile,
  StoredWorkspace,
  Workspace,
} from "./types";

export async function requireMember(
  store: AccountingStore,
  workspaceId: string,
  actor: Actor,
) {
  if (!(await store.isMember(workspaceId, actor.userId))) {
    throw new AccountingError("workspace_membership_required");
  }
}

export async function requireWorkspace(
  store: AccountingStore,
  workspaceId: string,
  actor: Actor,
) {
  await requireMember(store, workspaceId, actor);
  const workspace = await store.getWorkspace(workspaceId);
  if (!workspace) {
    throw new AccountingError("workspace_membership_required");
  }
  return workspace;
}

export async function ensureOpenPeriod(
  store: AccountingStore,
  workspaceId: string,
  period: { year: number; month: number },
): Promise<AccountingPeriod> {
  const stored = await store.getAccountingPeriod(workspaceId, period);
  if (stored) {
    return stored;
  }
  return store.insertAccountingPeriod(workspaceId, { ...period, status: "open" });
}

export function toWorkspace(
  workspace: StoredWorkspace,
  currentAccountingPeriod: AccountingPeriod,
): Workspace {
  return {
    id: workspace.id,
    kind: workspace.kind,
    functionalCurrency: workspace.functionalCurrency,
    currentAccountingPeriod,
  };
}

export function toProfile(profile: StoredProfile): FinancialAccountProfile {
  return {
    id: profile.id,
    workspaceId: profile.workspaceId,
    name: profile.name,
  };
}

export function postedAmount(workspace: StoredWorkspace, entry: StoredCashExpense) {
  return (
    entry.lines.find((line) => line.ledgerAccountId === workspace.expenseAccountId)
      ?.debitMinorUnits ?? 0
  );
}

export function assertBalanced(lines: DraftJournalLine[]) {
  const debit = lines.reduce((sum, line) => sum + line.debitMinorUnits, 0);
  const credit = lines.reduce((sum, line) => sum + line.creditMinorUnits, 0);
  if (debit !== credit) {
    throw new AccountingError("posted_journal_entry_unbalanced");
  }
}

export async function toPostedCashExpense(
  store: AccountingStore,
  workspace: StoredWorkspace,
  entry: StoredCashExpense,
  replay: boolean,
): Promise<PostedCashExpense> {
  const [period, profile, accounts] = await Promise.all([
    store.getAccountingPeriod(workspace.id, entry.period),
    store.getProfile(entry.financialAccountProfileId),
    store.listLedgerAccounts(workspace.id),
  ]);
  if (!period) {
    throw new AccountingError("accounting_period_not_found");
  }
  if (!profile) {
    throw new AccountingError("financial_account_profile_not_found");
  }
  const names = new Map(accounts.map((account) => [account.id, account.name]));
  return {
    id: entry.id,
    financialAccountProfileId: profile.id,
    financialAccountProfileName: profile.name,
    description: entry.description,
    accountingDate: entry.accountingDate,
    amount: {
      currency: workspace.functionalCurrency,
      minorUnits: postedAmount(workspace, entry),
    },
    accountingPeriod: period,
    replay,
    lines: entry.lines.map((line) => ({
      ...line,
      name: names.get(line.ledgerAccountId) ?? line.ledgerAccountId,
    })),
  };
}
