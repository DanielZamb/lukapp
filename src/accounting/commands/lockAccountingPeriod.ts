import { AccountingError } from "../errors";
import { requireMember } from "../helpers";
import type { AccountingPeriod, AccountingStore, Actor } from "../types";

export async function lockAccountingPeriod(
  store: AccountingStore,
  input: {
    actor: Actor;
    workspaceId: string;
    period: { year: number; month: number };
  },
): Promise<AccountingPeriod> {
  await requireMember(store, input.workspaceId, input.actor);
  const stored = await store.getAccountingPeriod(input.workspaceId, input.period);
  if (!stored || stored.status === "not_opened") {
    throw new AccountingError("accounting_period_not_found");
  }
  if (stored.status === "locked") {
    return stored;
  }
  return store.lockAccountingPeriod(input.workspaceId, input.period);
}
