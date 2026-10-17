import { chartTemplate } from "../chartOfAccounts";
import { AccountingError } from "../errors";
import { requireWorkspace } from "../membership";
import { periodFromAccountingDate } from "../period";
import { journalContext, toPostedJournalEntry } from "../views";
import { postJournalEntry } from "../posting";
import type {
  AccountingClock,
  AccountingStore,
  OpeningPositionInput,
  PostingPolicy,
} from "../types";

export async function recordOpeningPosition(
  store: AccountingStore,
  clock: AccountingClock,
  input: OpeningPositionInput,
  policy: Extract<PostingPolicy, "start-tracking@1" | "opening-position@1"> = "opening-position@1",
) {
  const workspace = await requireWorkspace(
    store,
    input.workspaceId,
    input.actor,
  );
  const amount = input.amount.minorUnits;
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new AccountingError("opening_amount_invalid");
  if (input.amount.currency !== workspace.functionalCurrency)
    throw new AccountingError("currency_mismatch");
  periodFromAccountingDate(input.accountingDate);
  if (!input.idempotencyKey)
    throw new AccountingError("idempotency_key_required");
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
  const existing = await store.findJournalEntryByIdempotencyKey(
    workspace.id,
    input.idempotencyKey,
  );
  if (amount === 0) {
    if (existing) throw new AccountingError("idempotency_key_conflict");
    return null;
  }
  const held = account.normalSide === "Debit";
  const { entry, replay } = await postJournalEntry(store, clock, {
    actor: input.actor,
    workspaceId: workspace.id,
    draft: {
      policy,
      accountingDate: input.accountingDate,
      description: input.description,
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
  const reversal = await store.findReversalOf(entry.id);
  return toPostedJournalEntry(
    store,
    await journalContext(store, workspace),
    entry,
    {
      replay,
      ...(reversal ? { reversedByEntryId: reversal.id } : {}),
    },
  );
}
