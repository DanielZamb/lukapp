import { useState } from "react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useT } from "../../i18n";
import type { api } from "../api";
import { amountOfMinorUnits, amountSendable, displayedMinorUnits, sendableMinorUnits, type AmountSession } from "../amount/session";
import { useFormState } from "../amount/useAmountState";
import { defaultAccountingDate } from "../timeZones";
import { useFrozenCommand } from "../useFrozenCommand";
import type { RecoveryPlace, RecoveryPlanView } from "./model";
import {
  choosePlace, endedPlaceRefusal, placeChoice, refusePlace, unavailableReason, useChosenPlace, type PlaceChoice,
} from "./useChosenPlace";

type Request = FunctionArgs<typeof api.savingsRecovery.recordContribution>;
type Receipt = FunctionReturnType<typeof api.savingsRecovery.recordContribution>;
export type RecoveryMoveTransport = {
  move: (request: Request) => Promise<Receipt>;
  newKey: () => string;
  reportFailure: (error: unknown) => boolean;
  onMoved: (receipt: Receipt) => void;
  /** Saves a new movement on the phone before it first leaves; if that fails, nothing is sent. */
  keep: (request: Request) => Promise<void>;
  /** Removes the saved movement once its outcome is known. */
  forget: (request: Request) => Promise<void>;
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

/** What the person sets on Move money: the movement is built from one snapshot of it, read at the press. */
type Movement = { amount: AmountSession; source: PlaceChoice };

export function useRecoveryMove(
  seed: {
    workspaceId: string; timeZone: string; plan: RecoveryPlanView; sources: RecoveryPlace[];
    /** A movement for this plan sent before the screen opened whose outcome is unknown: shown, and only resent. */
    unresolved?: Request | null;
  },
  transport: RecoveryMoveTransport,
) {
  const { t } = useT();
  const defaultSource = seed.sources.find((place) => place.id !== seed.plan.destinationFinancialAccountProfileId)
    ?? null;
  const [form, setForm, readForm] = useFormState<Movement>(() => seed.unresolved ? {
    amount: amountOfMinorUnits(seed.unresolved.amount.currency, seed.unresolved.amount.minorUnits, { hideZeroDecimals: true }),
    source: placeChoice(seed.unresolved.sourceFinancialAccountProfileId),
  } : {
    amount: amountOfMinorUnits(seed.plan.currency, seed.plan.dueMinorUnits, { hideZeroDecimals: true }),
    source: placeChoice(defaultSource?.id ?? null),
  });
  if (form.amount.currency !== seed.plan.currency)
    setForm((now) => ({ ...now, amount: amountOfMinorUnits(seed.plan.currency, seed.plan.dueMinorUnits, { hideZeroDecimals: true }) }));
  const unavailable = useChosenPlace(seed.sources, form.source);
  const sourceId = form.source.id;
  const [sameSource, setSameSource] = useState(false);
  const command = useFrozenCommand<Request, Receipt>({
    send: transport.move, reportFailure: transport.reportFailure, onDone: transport.onMoved,
    keep: transport.keep, forget: transport.forget,
    settles: (code) => moveSettles.has(code),
    onRefused: (code, request) => {
      const ended = endedPlaceRefusal(code);
      if (ended) setForm((now) => ({ ...now, source: refusePlace(now.source, request.sourceFinancialAccountProfileId, ended) }));
    },
  }, seed.unresolved ?? null);
  const { state } = command;
  const pending = state.name === "uncertain";
  const refusal = state.name === "open" ? state.refusal : null;
  const error = pending ? t("recovery.moveUncertain")
    : state.name === "unsaved" ? t("recovery.notSaved")
    : sameSource ? t("recovery.moveSameSource")
      : refusal && !endedPlaceRefusal(refusal.code) ? t("recovery.moveRejected") : "";
  const shownMinorUnits = amountSendable(form.amount) ? displayedMinorUnits(form.amount) ?? 0 : 0;
  function build(): Request | null {
    const now = readForm();
    const minorUnits = sendableMinorUnits(now.amount, seed.plan.currency) ?? 0;
    const from = now.source.id;
    if (seed.plan.status === "suspended" || !from || minorUnits <= 0 || unavailableReason(now.source, seed.sources)) return null;
    setSameSource(from === seed.plan.destinationFinancialAccountProfileId);
    if (from === seed.plan.destinationFinancialAccountProfileId) return null;
    return {
      workspaceId: seed.workspaceId,
      planId: seed.plan.id,
      sourceFinancialAccountProfileId: from,
      amount: { currency: seed.plan.currency, minorUnits },
      accountingDate: defaultAccountingDate(seed.timeZone),
      description: t("recovery.moveDescription", { title: seed.plan.title }),
      idempotencyKey: transport.newKey(),
    };
  }
  return {
    sourceId, unavailable, amount: form.amount, busy: command.busy, pending, error, editable: !command.frozen,
    canSubmit: !command.busy && (pending || (seed.plan.status === "active" && !!sourceId && !unavailable
      && sourceId !== seed.plan.destinationFinancialAccountProfileId && shownMinorUnits > 0)),
    canDismiss: !command.frozen || (state.name === "uncertain" && state.carried),
    dismiss: (close: () => void) => { if (command.canLeave()) close(); },
    onSource: (id: string) => { if (command.canEdit()) setForm((now) => ({ ...now, source: choosePlace(now.source, id) })); },
    onAmount: (value: AmountSession) => { if (command.canEdit() && value.currency === seed.plan.currency) setForm((now) => ({ ...now, amount: value })); },
    submit: async () => { await command.submit(build); },
  };
}
