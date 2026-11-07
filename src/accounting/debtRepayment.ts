import { normalBalance } from "./chartOfAccounts";
import { AccountingError } from "./errors";
import type { AccountingStore, JournalEntryDraft, LedgerAccount } from "./types";

export async function requireRepaymentsWithinDebt(
  store: Pick<AccountingStore, "accountTotals">,
  workspaceId: string,
  draft: JournalEntryDraft,
  accounts: ReadonlyMap<string, LedgerAccount>,
): Promise<void> {
  if (draft.policy === "reversal@1") return;
  const reductions = new Map<string, number>();
  for (const line of draft.lines) {
    const account = accounts.get(line.ledgerAccountId);
    if (account?.nature === "Liability" && account.normalSide === "Credit") {
      reductions.set(account.id, (reductions.get(account.id) ?? 0)
        + line.debitMinorUnits - line.creditMinorUnits);
    }
  }
  if (![...reductions.values()].some((reduction) => reduction > 0)) return;
  const totals = await store.accountTotals(workspaceId);
  for (const [accountId, reduction] of reductions) {
    const owed = normalBalance("Credit", totals.get(accountId) ?? {
      debitMinorUnits: 0, creditMinorUnits: 0,
    });
    if (reduction > 0 && reduction > Math.max(0, owed)) {
      throw new AccountingError("repayment_exceeds_debt");
    }
  }
}
