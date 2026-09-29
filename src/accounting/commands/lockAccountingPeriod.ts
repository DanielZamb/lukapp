import { requireWorkspace } from "../membership";
import { requirePeriodKey } from "../period";
import type {
  AccountingClock,
  AccountingPeriod,
  AccountingStore,
  Actor,
  PeriodKey,
} from "../types";

/**
 * Locks one calendar month, even one with no activity yet, and appends an immutable
 * Period Control Decision naming who locked it, when, and why.
 */
export async function lockAccountingPeriod(
  store: AccountingStore,
  clock: AccountingClock,
  input: { actor: Actor; workspaceId: string; period: PeriodKey; reason?: string },
): Promise<AccountingPeriod> {
  await requireWorkspace(store, input.workspaceId, input.actor);
  const period = requirePeriodKey(input.period);
  const stored = await store.getAccountingPeriod(input.workspaceId, period);
  if (stored?.status === "locked") {
    return stored;
  }
  const locked = stored
    ? await store.setAccountingPeriodStatus(input.workspaceId, period, "locked")
    : await store.insertAccountingPeriod(input.workspaceId, {
        ...period,
        status: "locked",
      });
  const reason = input.reason?.trim();
  await store.insertPeriodControlDecision(input.workspaceId, {
    period,
    action: "Lock",
    decidedBy: input.actor.userId,
    decidedAt: clock.now().getTime(),
    ...(reason ? { reason } : {}),
  });
  return locked;
}
