import { AccountingError } from "./errors";
import type {
  AccountNature,
  AccountingStore,
  LedgerAccount,
  SystemAccountKey,
} from "./types";

/** Smallest versioned Chart of Accounts a Personal Workspace starts with (ADR-0007). */
export const personalChartTemplate = {
  version: "personal@1",
  accounts: [
    { systemKey: "expenses", name: "Expenses", nature: "Expense" },
    { systemKey: "income", name: "Income", nature: "Revenue" },
    {
      systemKey: "openingBalanceEquity",
      name: "Opening Balance Equity",
      nature: "Equity",
    },
  ],
} as const satisfies {
  version: string;
  accounts: ReadonlyArray<{
    systemKey: SystemAccountKey;
    name: string;
    nature: AccountNature;
  }>;
};

export async function provisionChartOfAccounts(
  store: AccountingStore,
  workspaceId: string,
): Promise<void> {
  for (const account of personalChartTemplate.accounts) {
    await store.insertLedgerAccount({
      workspaceId,
      name: account.name,
      nature: account.nature,
      role: "Posting",
      systemKey: account.systemKey,
    });
  }
}

export async function requireSystemAccount(
  store: AccountingStore,
  workspaceId: string,
  systemKey: SystemAccountKey,
): Promise<LedgerAccount> {
  const account = await store.findSystemAccount(workspaceId, systemKey);
  if (!account) {
    throw new AccountingError("system_account_not_found");
  }
  return account;
}

/** Assets and Expenses grow with debits; Liabilities, Equity, and Revenue grow with credits. */
export function increasesWithDebit(nature: AccountNature): boolean {
  return nature === "Asset" || nature === "Expense";
}

/** Balance on the account's normal side, so an Asset shows money held and a Liability money owed. */
export function normalBalance(
  nature: AccountNature,
  totals: { debitMinorUnits: number; creditMinorUnits: number },
): number {
  return increasesWithDebit(nature)
    ? totals.debitMinorUnits - totals.creditMinorUnits
    : totals.creditMinorUnits - totals.debitMinorUnits;
}
