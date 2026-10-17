import { chartTemplate } from "../chartOfAccounts";
import { AccountingError } from "../errors";
import { requireWorkspace } from "../membership";
import { requireFunctionalAmount } from "../money";
import { postJournalEntry } from "../posting";
import type {
  AccountingClock,
  AccountingStore,
  CashActivityInput,
} from "../types";

export async function recordOpeningPosition(
  store: AccountingStore,
  clock: AccountingClock,
  input: CashActivityInput,
) {
  const workspace = await requireWorkspace(
    store,
    input.workspaceId,
    input.actor,
  );
  const amount = requireFunctionalAmount(workspace, input.amount);
  const profile = await store.getProfile(input.financialAccountProfileId);
  if (!profile || profile.workspaceId !== workspace.id) {
    throw new AccountingError("financial_account_profile_not_found");
  }
  const account = await store.getLedgerAccount(profile.postingAccountId);
  if (!account) throw new AccountingError("ledger_account_not_found");
  const equityCode = chartTemplate(workspace.chartOfAccountsTemplate).defaults
    .openingBalance;
  const equity = (await store.listLedgerAccounts(workspace.id)).find(
    (a) => a.code === equityCode,
  );
  if (!equity) throw new AccountingError("ledger_account_not_found");
  const held = account.normalSide === "Debit";
  return postJournalEntry(store, clock, {
    actor: input.actor,
    workspaceId: workspace.id,
    draft: {
      policy: "start-tracking@1",
      accountingDate: input.accountingDate,
      description: "Starting amount",
      idempotencyKey: input.idempotencyKey,
      financialAccountProfileId: profile.id,
      lines: [
        {
          ledgerAccountId: account.id,
          debitMinorUnits: held ? amount : 0,
          creditMinorUnits: held ? 0 : amount,
        },
        {
          ledgerAccountId: equity.id,
          debitMinorUnits: held ? 0 : amount,
          creditMinorUnits: held ? amount : 0,
        },
      ],
    },
  });
}
