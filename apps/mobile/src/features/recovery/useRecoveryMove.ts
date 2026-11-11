import { useState } from "react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useT } from "../../i18n";
import type { api } from "../api";
import { amountOfMinorUnits, amountSendable, displayedMinorUnits, sendableMinorUnits, type AmountSession } from "../amount/session";
import { useAmountState } from "../amount/useAmountState";
import { defaultAccountingDate } from "../timeZones";
import { useFrozenCommand } from "../useFrozenCommand";
import type { RecoveryPlace, RecoveryPlanView } from "./model";
import { endedPlaceRefusal, useChosenPlace } from "./useChosenPlace";

type Request = FunctionArgs<typeof api.savingsRecovery.recordContribution>;
type Receipt = FunctionReturnType<typeof api.savingsRecovery.recordContribution>;
export type RecoveryMoveTransport = {
  move: (request: Request) => Promise<Receipt>;
  newKey: () => string;
  reportFailure: (error: unknown) => boolean;
  onMoved: (receipt: Receipt) => void;
};

/**
 * recordRecoveryMove (src/savingsRecovery/recordRecoveryMove.ts) looks for the contribution under the key at line 34.
 * Each refusal below answers a send whose outcome was unknown: the key's shape; a check made only when no contribution
 * or transfer was found (lifecycle.ts, recordContribution.ts, src/accounting/posting.ts after line 42); or a check of
 * something fixed once the transfer exists (the plan, a Place's kind, the workspace currency). Not here on purpose:
 * idempotency_key_conflict, which means something is stored under the key, and workspace_membership_required and
 * place_ending_scan_limit, which a replay of a posted transfer can raise too.
 */
const moveSettles: ReadonlySet<string> = new Set([
  "idempotency_key_invalid", "plan_not_found", "plan_cancelled", "expense_not_recoverable", "destination_not_found",
  "transfer_predates_activation", "plan_already_complete", "amount_out_of_range", "source_must_be_asset", "destination_must_be_asset",
  "financial_account_profile_ended", "place_undo_in_progress", "transfer_not_found", "transfer_not_usable", "transfer_reversed",
  "transfer_destination_mismatch", "transfer_already_attributed", "transfer_profiles_must_differ", "functional_currency_invalid",
  "amount_must_be_positive", "currency_mismatch", "financial_account_profile_not_found", "locked_period", "activity_before_opening",
  "ledger_summary_not_ready", "ledger_totals_out_of_range",
]);

export function useRecoveryMove(
  seed: { workspaceId: string; timeZone: string; plan: RecoveryPlanView; sources: RecoveryPlace[] },
  transport: RecoveryMoveTransport,
) {
  const { t } = useT();
  const defaultSource = seed.sources.find((place) => place.id !== seed.plan.destinationFinancialAccountProfileId)
    ?? null;
  const source = useChosenPlace(seed.sources, defaultSource?.id ?? null);
  const sourceId = source.id;
  const [amount, setAmount, readAmount] = useAmountState(() => amountOfMinorUnits(seed.plan.currency, seed.plan.dueMinorUnits, { hideZeroDecimals: true }));
  const [sameSource, setSameSource] = useState(false);
  const command = useFrozenCommand<Request, Receipt>({
    send: transport.move, reportFailure: transport.reportFailure, onDone: transport.onMoved,
    settles: (code) => moveSettles.has(code),
    onRefused: (code, request) => {
      const ended = endedPlaceRefusal(code);
      if (ended) source.refuse(request.sourceFinancialAccountProfileId, ended);
    },
  });
  const { state } = command;
  const pending = state.name === "uncertain";
  const refusal = state.name === "open" ? state.refusal : null;
  const error = pending ? t("recovery.moveUncertain")
    : sameSource ? t("recovery.moveSameSource")
      : refusal && !endedPlaceRefusal(refusal.code) ? t("recovery.moveRejected") : "";
  const shownMinorUnits = amountSendable(amount) ? displayedMinorUnits(amount) ?? 0 : 0;
  function build(): Request | null {
    const minorUnits = sendableMinorUnits(readAmount()) ?? 0;
    if (seed.plan.status === "suspended" || !sourceId || minorUnits <= 0 || source.unavailable) return null;
    setSameSource(sourceId === seed.plan.destinationFinancialAccountProfileId);
    if (sourceId === seed.plan.destinationFinancialAccountProfileId) return null;
    return {
      workspaceId: seed.workspaceId,
      planId: seed.plan.id,
      sourceFinancialAccountProfileId: sourceId,
      amount: { currency: seed.plan.currency, minorUnits },
      accountingDate: defaultAccountingDate(seed.timeZone),
      description: t("recovery.moveDescription", { title: seed.plan.title }),
      idempotencyKey: transport.newKey(),
    };
  }
  return {
    sourceId, unavailable: source.unavailable, amount, busy: command.busy, pending, error, editable: !command.frozen,
    canSubmit: !command.busy && (pending || (seed.plan.status === "active" && !!sourceId && !source.unavailable
      && sourceId !== seed.plan.destinationFinancialAccountProfileId && shownMinorUnits > 0)),
    canDismiss: !command.frozen,
    onSource: (id: string) => { if (command.canEdit()) source.choose(id); },
    onAmount: (value: AmountSession) => { if (command.canEdit() && value.currency === seed.plan.currency) setAmount(value); },
    submit: async () => { await command.submit(build); },
  };
}
