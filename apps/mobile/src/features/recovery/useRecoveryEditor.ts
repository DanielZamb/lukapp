import { useLayoutEffect, useRef, useState } from "react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useT, type MessageKey } from "../../i18n";
import type { api } from "../api";
import { refusalCodeOf } from "../useFrozenCommand";
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
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<Request | null>(null);
  const submitting = useRef(false);
  const lifetime = useRef({ active: false });
  useLayoutEffect(() => {
    const mounted = { active: true };
    lifetime.current = mounted;
    return () => { mounted.active = false; };
  }, []);
  const suggestion = suggestionFor(seed.candidate.amountMinorUnits, installmentCount, displayedMinorUnits(amount) ?? 0);
  const ready = suggestion.valid && amountSendable(amount);
  const editable = !busy && !pending;
  async function submit() {
    const mounted = lifetime.current;
    const selected = request.current?.destinationFinancialAccountProfileId ?? destinationId;
    const typed = sendableMinorUnits(readAmount());
    const pressed = typed === null ? null : suggestionFor(seed.candidate.amountMinorUnits, installmentCount, typed);
    if (!mounted.active || submitting.current || !selected || (!request.current && (!pressed?.valid || destination.unavailable))) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const payload = request.current ?? {
        workspaceId: seed.workspaceId,
        sourceJournalEntryId: seed.candidate.journalEntryId,
        destinationFinancialAccountProfileId: selected,
        installmentCount,
        installmentMinorUnits: pressed!.installmentMinorUnits,
        idempotencyKey: transport.newKey(),
        ...(seed.replacesPlanId ? { replacesPlanId: seed.replacesPlanId } : {}),
      };
      request.current = payload;
      setPending(true);
      const receipt = await transport.save(payload);
      if (!mounted.active) return;
      request.current = null;
      setPending(false);
      transport.onSaved(receipt);
    } catch (caught) {
      if (transport.reportFailure(caught) || !mounted.active) return;
      const code = refusalCodeOf(caught);
      const sent = request.current;
      if (code !== null && sent) {
        request.current = null;
        setPending(false);
        const ended = endedPlaceRefusal(code);
        if (ended) destination.refuse(sent.destinationFinancialAccountProfileId, ended);
        else setError(t(code === "expense_already_recovered" ? "recovery.draftAlreadyRecovered"
          : replacementRefusals[code] ?? "recovery.draftRejected"));
      } else setError(t("recovery.draftUncertain"));
    } finally {
      submitting.current = false;
      if (mounted.active) setBusy(false);
    }
  }
  const canEdit = () => lifetime.current.active && !submitting.current && !request.current;
  return {
    installmentCount, amount, destinationId, unavailable: destination.unavailable, busy, pending, error, editable, suggestion,
    canSubmit: !busy && (pending || (!!destinationId && !destination.unavailable && ready)),
    canDismiss: !busy && !pending,
    onMonths: (count: MonthCount) => {
      if (!canEdit()) return;
      setInstallmentCount(count);
      setAmount(installmentAmount(seed.currency, minInstallment(seed.candidate.amountMinorUnits, count)));
    },
    onAmount: (value: AmountSession) => { if (canEdit() && value.currency === seed.currency) setAmount(value); },
    onDestination: (id: string) => { if (canEdit()) destination.choose(id); },
    submit,
  };
}

function installmentAmount(currency: string, minorUnits: number) {
  return amountOfMinorUnits(currency, minorUnits, { hideZeroDecimals: true });
}
