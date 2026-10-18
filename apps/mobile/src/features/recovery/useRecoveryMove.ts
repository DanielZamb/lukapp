import { useLayoutEffect, useRef, useState } from "react";
import { ConvexError } from "convex/values";
import { z } from "zod";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { api } from "../api";
import { localDate, parseMoney } from "../money";
import { recoveryMoney, type RecoveryPlace, type RecoveryPlanView } from "./model";

type Request = FunctionArgs<typeof api.savingsRecovery.recordContribution>;
type Receipt = FunctionReturnType<typeof api.savingsRecovery.recordContribution>;
export type RecoveryMoveTransport = {
  move: (request: Request) => Promise<Receipt>;
  newKey: () => string;
  reportFailure: (error: unknown) => boolean;
  onMoved: (receipt: Receipt) => void;
};
const rejection = z.object({ kind: z.union([z.literal("recovery"), z.literal("accounting")]), code: z.string() });

export function useRecoveryMove(
  seed: { workspaceId: string; plan: RecoveryPlanView; sources: RecoveryPlace[] },
  transport: RecoveryMoveTransport,
) {
  const defaultSource = seed.sources.find((place) => place.id !== seed.plan.destinationFinancialAccountProfileId)
    ?? null;
  const [sourceId, setSourceId] = useState(defaultSource?.id ?? null);
  const [amount, setAmount] = useState(formatMinor(seed.plan.currency, seed.plan.dueMinorUnits));
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
  try { minorUnits = parseMoney(amount); } catch { /* Incomplete amount stays editable. */ }
  const editable = !busy && !pending;
  async function submit() {
    const mounted = lifetime.current;
    const selected = request.current?.sourceFinancialAccountProfileId ?? sourceId;
    if (!mounted.active || submitting.current || !selected || (!request.current && minorUnits <= 0)) return;
    if (!request.current && selected === seed.plan.destinationFinancialAccountProfileId) {
      setError("Choose a different place to move money from.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const payload = request.current ?? {
        workspaceId: seed.workspaceId,
        planId: seed.plan.id,
        sourceFinancialAccountProfileId: selected,
        amount: { currency: seed.plan.currency, minorUnits },
        accountingDate: localDate(),
        description: `Recovery: ${seed.plan.title}`,
        idempotencyKey: transport.newKey(),
      };
      request.current = payload;
      setPending(true);
      const receipt = await transport.move(payload);
      if (!mounted.active) return;
      request.current = null;
      setPending(false);
      transport.onMoved(receipt);
    } catch (caught) {
      if (transport.reportFailure(caught) || !mounted.active) return;
      const parsed = rejection.safeParse(caught instanceof ConvexError ? caught.data : null);
      if (parsed.success) {
        request.current = null;
        setPending(false);
        setError("The movement was rejected. Check the source and amount, then try again.");
      } else setError("Could not confirm the transfer. Retry to safely check the same movement.");
    } finally {
      submitting.current = false;
      if (mounted.active) setBusy(false);
    }
  }
  const canEdit = () => lifetime.current.active && !submitting.current && !request.current;
  return {
    sourceId, amount, busy, pending, error, editable,
    canSubmit: !busy && (pending || (!!sourceId && sourceId !== seed.plan.destinationFinancialAccountProfileId && minorUnits > 0)),
    canDismiss: !busy && !pending,
    onSource: (id: string) => { if (canEdit()) setSourceId(id); },
    onAmount: (value: string) => { if (canEdit()) setAmount(value); },
    submit,
  };
}

function formatMinor(currency: string, minorUnits: number) {
  return recoveryMoney({ currency, minorUnits }).replace(`${currency} `, "");
}
