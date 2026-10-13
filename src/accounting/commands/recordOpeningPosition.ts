import { requireTemplateAccount } from "../chartOfAccounts";
import { AccountingError } from "../errors";
import { requireWorkspace } from "../membership";
import { requireProfile } from "../financialAccountProfiles";
import { periodFromAccountingDate } from "../period";
import { assertOpeningCutover } from "../openingDate";
import { requirePostablePeriod } from "../periodControl";
import { postJournalEntry } from "../posting";
import type {
  AccountingClock,
  AccountingStore,
  OpeningPositionInput,
  OpeningPositionResult,
  StoredOpening,
  StoredWorkspace,
} from "../types";
import { journalContext, toPostedJournalEntry, toProfile } from "../views";

export async function recordOpeningPosition(
  store: AccountingStore,
  clock: AccountingClock,
  input: OpeningPositionInput,
): Promise<OpeningPositionResult> {
  const workspace = await requireWorkspace(
    store,
    input.workspaceId,
    input.actor,
    "post",
  );
  if (
    !Number.isSafeInteger(input.amount.minorUnits) ||
    input.amount.minorUnits < 0
  )
    throw new AccountingError("opening_amount_invalid");
  if (input.amount.currency !== workspace.functionalCurrency)
    throw new AccountingError("currency_mismatch");
  periodFromAccountingDate(input.accountingDate);
  if (!input.idempotencyKey)
    throw new AccountingError("idempotency_key_required");
  const profile = await requireProfile(
    store,
    input.workspaceId,
    input.financialAccountProfileId,
  );
  const previous = await store.findOpeningPositionByKey(
    input.workspaceId,
    input.idempotencyKey,
  );
  if (previous) {
    if (
      previous.financialAccountProfileId !== profile.id ||
      previous.description !== input.description ||
      previous.replacesOpeningKey !== input.replacesOpeningKey ||
      previous.opening.accountingDate !== input.accountingDate ||
      previous.opening.amount.minorUnits !== input.amount.minorUnits ||
      previous.opening.amount.currency !== input.amount.currency
    ) {
      throw new AccountingError("idempotency_key_conflict");
    }
    return openingResult(store, workspace, profile.id, previous.opening, true);
  }
  if (
    await store.findJournalEntryByIdempotencyKey(
      input.workspaceId,
      input.idempotencyKey,
    )
  )
    throw new AccountingError("idempotency_key_conflict");
  if (profile.opening) {
    await requireWorkspace(store, input.workspaceId, input.actor, "correct");
    if (
      input.replacesOpeningKey !== undefined &&
      input.replacesOpeningKey !== profile.opening.idempotencyKey
    )
      throw new AccountingError("opening_replacement_conflict");
    if (
      profile.opening.kind === "zero"
        ? input.replacesOpeningKey !== profile.opening.idempotencyKey
        : !(await store.findReversalOf(profile.opening.journalEntryId))
    ) {
      throw new AccountingError("opening_already_recorded");
    }
  } else {
    if (input.replacesOpeningKey !== undefined)
      throw new AccountingError("opening_replacement_conflict");
  }
  await assertOpeningCutover(store, profile, input.accountingDate);
  if (profile.opening) await store.clearProfileOpening(profile.id);
  let opening: StoredOpening;
  const common = {
    accountingDate: input.accountingDate,
    idempotencyKey: input.idempotencyKey,
    amount: input.amount,
  };
  if (input.amount.minorUnits === 0) {
    await requirePostablePeriod(store, input.workspaceId, input.accountingDate);
    opening = { ...common, kind: "zero" };
  } else {
    const account = await store.getLedgerAccount(profile.postingAccountId);
    if (!account || account.workspaceId !== input.workspaceId)
      throw new AccountingError("ledger_account_not_found");
    const equity = await requireTemplateAccount(
      store,
      workspace,
      "openingBalance",
    );
    const debitId = account.normalSide === "Debit" ? account.id : equity.id;
    const creditId = account.normalSide === "Debit" ? equity.id : account.id;
    const { entry } = await postJournalEntry(store, clock, {
      actor: input.actor,
      workspaceId: input.workspaceId,
      draft: {
        policy: "opening-position@1",
        financialAccountProfileId: profile.id,
        accountingDate: input.accountingDate,
        description: input.description,
        idempotencyKey: input.idempotencyKey,
        lines: [
          {
            ledgerAccountId: debitId,
            debitMinorUnits: input.amount.minorUnits,
            creditMinorUnits: 0,
          },
          {
            ledgerAccountId: creditId,
            debitMinorUnits: 0,
            creditMinorUnits: input.amount.minorUnits,
          },
        ],
      },
    });
    opening = { ...common, kind: "posted", journalEntryId: entry.id };
  }
  await store.saveOpeningPosition({
    workspaceId: input.workspaceId,
    financialAccountProfileId: profile.id,
    description: input.description,
    opening,
    ...(input.replacesOpeningKey !== undefined
      ? { replacesOpeningKey: input.replacesOpeningKey }
      : {}),
  });
  return openingResult(store, workspace, profile.id, opening, false);
}

async function openingResult(
  store: AccountingStore,
  workspace: StoredWorkspace,
  profileId: string,
  opening: StoredOpening,
  replay: boolean,
): Promise<OpeningPositionResult> {
  const profile = await requireProfile(store, workspace.id, profileId);
  let journalEntry = null;
  if (opening.kind === "posted") {
    const entry = await store.getJournalEntry(opening.journalEntryId);
    if (!entry) throw new AccountingError("journal_entry_not_found");
    const reversal = await store.findReversalOf(entry.id);
    journalEntry = await toPostedJournalEntry(
      store,
      await journalContext(store, workspace),
      entry,
      {
        replay,
        ...(reversal ? { reversedByEntryId: reversal.id } : {}),
      },
    );
  }
  return { profile: await toProfile(store, profile), journalEntry, replay };
}
