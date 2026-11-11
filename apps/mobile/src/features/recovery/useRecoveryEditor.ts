import { useState } from "react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useT, type MessageKey } from "../../i18n";
import type { api } from "../api";
import { useFrozenCommand } from "../useFrozenCommand";
import { amountOfMinorUnits, amountSendable, displayedMinorUnits, sendableMinorUnits, type AmountSession } from "../amount/session";
import { useAmountState } from "../amount/useAmountState";
import {
  DEFAULT_INSTALLMENT_COUNT,
  INSTALLMENT_COUNTS,
  minInstallment,
  suggestionFor,
  type RecoveryCandidate,
  type RecoveryPlace,
} from "./model";
import { endedPlaceRefusal, useChosenPlace } from "./useChosenPlace";

type MonthCount = (typeof INSTALLMENT_COUNTS)[number];

type Request = FunctionArgs<typeof api.savingsRecovery.activatePlan>;
type Receipt = FunctionReturnType<typeof api.savingsRecovery.activatePlan>;
export type RecoveryEditorSeed = {
  workspaceId: string;
  currency: string;
  candidate: RecoveryCandidate;
  destinations: RecoveryPlace[];
  replacesPlanId?: string | null;
};
export type RecoveryEditorTransport = {
  save: (request: Request) => Promise<Receipt>;
  newKey: () => string;
  reportFailure: (error: unknown) => boolean;
  onSaved: (receipt: Receipt) => void;
};
/**
 * activatePlan (src/savingsRecovery/activatePlan.ts) looks for the plan under the key at line 19, after checking only the
 * request itself (the key's shape, the workspace id). Every other refusal it raises comes after finding no plan there,
 * so it answers a send whose outcome was unknown. Not here on purpose: idempotency_key_conflict, which means a plan is
 * stored under the key.
 */
const activationSettles: ReadonlySet<string> = new Set([
  "idempotency_key_invalid", "workspace_not_found", "expense_not_found", "expense_not_recoverable", "place_undo_in_progress",
  "financial_account_profile_ended", "place_ending_scan_limit", "replacement_plan_not_found", "replacement_plan_not_cancelled",
  "replacement_expense_mismatch", "replacement_already_exists", "replacement_plan_not_latest", "expense_already_recovered",
  "destination_not_found", "destination_must_be_asset", "amount_out_of_range", "amount_must_be_positive",
  "installment_count_invalid", "installment_below_minimum", "installment_above_principal",
]);
const replacementRefusals: Record<string, MessageKey> = {
  replacement_already_exists: "planning.replacementExists",
  replacement_plan_not_latest: "planning.replacementUnavailable",
  replacement_plan_not_found: "planning.replacementUnavailable",
  replacement_plan_not_cancelled: "planning.replacementUnavailable",
  replacement_expense_mismatch: "planning.replacementUnavailable",
};

export function useRecoveryEditor(seed: RecoveryEditorSeed, transport: RecoveryEditorTransport) {
  const { t } = useT();
  const defaultDestination = seed.destinations.find((place) => place.productKind === "savingsAccount")
    ?? seed.destinations[0] ?? null;
  const [installmentCount, setInstallmentCount] = useState<MonthCount>(DEFAULT_INSTALLMENT_COUNT);
  const [amount, setAmount, readAmount] = useAmountState(() => installmentAmount(seed.currency, minInstallment(seed.candidate.amountMinorUnits, DEFAULT_INSTALLMENT_COUNT)));
  const destination = useChosenPlace(seed.destinations, defaultDestination?.id ?? null);
  const destinationId = destination.id;
  const command = useFrozenCommand<Request, Receipt>({
    send: transport.save, reportFailure: transport.reportFailure, onDone: transport.onSaved,
    settles: (code) => activationSettles.has(code),
    onRefused: (code, request) => {
      const ended = endedPlaceRefusal(code);
      if (ended) destination.refuse(request.destinationFinancialAccountProfileId, ended);
    },
  });
  const { state } = command;
  const pending = state.name === "uncertain";
  const refusal = state.name === "open" ? state.refusal : null;
  const error = pending ? t("recovery.draftUncertain")
    : !refusal || endedPlaceRefusal(refusal.code) ? ""
      : t(refusal.code === "expense_already_recovered" ? "recovery.draftAlreadyRecovered"
        : replacementRefusals[refusal.code] ?? "recovery.draftRejected");
  const suggestion = suggestionFor(seed.candidate.amountMinorUnits, installmentCount, displayedMinorUnits(amount) ?? 0);
  const ready = suggestion.valid && amountSendable(amount);
  function build(): Request | null {
    const typed = sendableMinorUnits(readAmount());
    const pressed = typed === null ? null : suggestionFor(seed.candidate.amountMinorUnits, installmentCount, typed);
    if (!destinationId || destination.unavailable || !pressed?.valid) return null;
    return {
      workspaceId: seed.workspaceId,
      sourceJournalEntryId: seed.candidate.journalEntryId,
      destinationFinancialAccountProfileId: destinationId,
      installmentCount,
      installmentMinorUnits: pressed.installmentMinorUnits,
      idempotencyKey: transport.newKey(),
      ...(seed.replacesPlanId ? { replacesPlanId: seed.replacesPlanId } : {}),
    };
  }
  return {
    installmentCount, amount, destinationId, unavailable: destination.unavailable, busy: command.busy, pending, error,
    editable: !command.frozen, suggestion,
    canSubmit: !command.busy && (pending || (!!destinationId && !destination.unavailable && ready)),
    canDismiss: !command.frozen,
    onMonths: (count: MonthCount) => {
      if (!command.canEdit()) return;
      setInstallmentCount(count);
      setAmount(installmentAmount(seed.currency, minInstallment(seed.candidate.amountMinorUnits, count)));
    },
    onAmount: (value: AmountSession) => { if (command.canEdit() && value.currency === seed.currency) setAmount(value); },
    onDestination: (id: string) => { if (command.canEdit()) destination.choose(id); },
    submit: async () => { await command.submit(build); },
  };
}

function installmentAmount(currency: string, minorUnits: number) {
  return amountOfMinorUnits(currency, minorUnits, { hideZeroDecimals: true });
}
