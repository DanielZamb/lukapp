import { useLayoutEffect, useRef, useState } from "react";
import { ConvexError } from "convex/values";
import { z } from "zod";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useT, type MessageKey } from "../../i18n";
import type { api } from "../api";
import { parseMoney } from "../money";
import {
  DEFAULT_INSTALLMENT_COUNT,
  INSTALLMENT_COUNTS,
  minInstallment,
  recoveryMoney,
  suggestionFor,
  type RecoveryCandidate,
  type RecoveryPlace,
} from "./model";

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
const rejection = z.object({ kind: z.literal("recovery"), code: z.string() });
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
  const [amount, setAmount] = useState(formatMinor(seed.currency, minInstallment(seed.candidate.amountMinorUnits, DEFAULT_INSTALLMENT_COUNT)));
  const [destinationId, setDestinationId] = useState(defaultDestination?.id ?? null);
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
  let minorUnits = 0;
  try { minorUnits = parseMoney(amount, seed.currency); } catch { /* Incomplete amount stays editable. */ }
  const suggestion = suggestionFor(seed.candidate.amountMinorUnits, installmentCount, minorUnits);
  const editable = !busy && !pending;
  async function submit() {
    const mounted = lifetime.current;
    const selected = request.current?.destinationFinancialAccountProfileId ?? destinationId;
    if (!mounted.active || submitting.current || !selected || (!request.current && !suggestion.valid)) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const payload = request.current ?? {
        workspaceId: seed.workspaceId,
        sourceJournalEntryId: seed.candidate.journalEntryId,
        destinationFinancialAccountProfileId: selected,
        installmentCount,
        installmentMinorUnits: suggestion.installmentMinorUnits,
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
      const parsed = rejection.safeParse(caught instanceof ConvexError ? caught.data : null);
      if (parsed.success) {
        request.current = null;
        setPending(false);
        const replacement = replacementRefusals[parsed.data.code];
        setError(t(parsed.data.code === "expense_already_recovered" ? "recovery.draftAlreadyRecovered"
          : replacement ?? "recovery.draftRejected"));
      } else setError(t("recovery.draftUncertain"));
    } finally {
      submitting.current = false;
      if (mounted.active) setBusy(false);
    }
  }
  const canEdit = () => lifetime.current.active && !submitting.current && !request.current;
  return {
    installmentCount, amount, destinationId, busy, pending, error, editable, suggestion,
    canSubmit: !busy && (pending || (!!destinationId && suggestion.valid)),
    canDismiss: !busy && !pending,
    onMonths: (count: MonthCount) => {
      if (!canEdit()) return;
      setInstallmentCount(count);
      setAmount(formatMinor(seed.currency, minInstallment(seed.candidate.amountMinorUnits, count)));
    },
    onAmount: (value: string) => { if (canEdit()) setAmount(value); },
    onDestination: (id: string) => { if (canEdit()) setDestinationId(id); },
    submit,
  };
}

function formatMinor(currency: string, minorUnits: number) {
  return recoveryMoney({ currency, minorUnits }).replace(`${currency} `, "");
}
