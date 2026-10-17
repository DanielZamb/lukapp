import { chartTemplate } from "../chartOfAccounts";
import { AccountingError } from "../errors";
import { requireWorkspace } from "../membership";
import { requireOpeningOnProfile } from "../openingControl";
import { periodFromAccountingDate } from "../period";
import { requirePostablePeriod } from "../periodControl";
import { journalContext, toPostedJournalEntry } from "../views";
import { postJournalEntry } from "../posting";
import type {
  AccountingClock,
  AccountingStore,
  OpeningPositionInput,
  PostingPolicy,
  StoredOpeningMarker,
} from "../types";

function sameOpening(
  marker: StoredOpeningMarker,
  input: OpeningPositionInput,
  policy: StoredOpeningMarker["policy"],
) {
  return (
    marker.financialAccountProfileId === input.financialAccountProfileId &&
    marker.accountingDate === input.accountingDate &&
    marker.amount.currency === input.amount.currency &&
    marker.amount.minorUnits === input.amount.minorUnits &&
    marker.description === input.description &&
    marker.policy === policy
  );
}

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
  const marker = await store.findOpeningMarkerByIdempotencyKey(
    workspace.id,
    input.idempotencyKey,
  );
  if (marker) {
    if (!sameOpening(marker, input, policy))
      throw new AccountingError("idempotency_key_conflict");
    if (!marker.journalEntryId) return null;
    const entry = await store.getJournalEntry(marker.journalEntryId);
    if (!entry) throw new AccountingError("journal_entry_not_found");
    const reversal = await store.findReversalOf(entry.id);
    return toPostedJournalEntry(
      store,
      await journalContext(store, workspace),
      entry,
      {
        replay: true,
        ...(reversal ? { reversedByEntryId: reversal.id } : {}),
      },
    );
  }
  if (amount === 0) {
    if (
      await store.findJournalEntryByIdempotencyKey(
        workspace.id,
        input.idempotencyKey,
      )
    )
      throw new AccountingError("idempotency_key_conflict");
    await requireOpeningOnProfile(store, workspace.id, profile.id, {
      policy,
      accountingDate: input.accountingDate,
      idempotencyKey: input.idempotencyKey,
    });
    await requirePostablePeriod(store, workspace.id, input.accountingDate);
    await store.insertOpeningMarker({
      workspaceId: workspace.id,
      financialAccountProfileId: profile.id,
      accountingDate: input.accountingDate,
      idempotencyKey: input.idempotencyKey,
      amount: input.amount,
      description: input.description,
      policy,
    });
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
  if (
    !(await store.findOpeningMarkerByIdempotencyKey(
      workspace.id,
      input.idempotencyKey,
    ))
  ) {
    await store.insertOpeningMarker({
      workspaceId: workspace.id,
      financialAccountProfileId: profile.id,
      accountingDate: input.accountingDate,
      idempotencyKey: input.idempotencyKey,
      amount: input.amount,
      description: input.description,
      policy,
      journalEntryId: entry.id,
    });
  }
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
