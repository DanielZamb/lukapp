import { useLayoutEffect, useRef, useState } from "react";
import { ConvexError } from "convex/values";
import { z } from "zod";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { api } from "../api";
import { formatMoney, localDate, parseMoney } from "../money";
import type { RecoveryPlace, RecoveryPlanView } from "./model";

type Transfer = FunctionArgs<typeof api.accounting.recordAccountTransfer>;
type Gift = FunctionArgs<typeof api.savingsRecovery.recordContribution>;
type Receipt = FunctionReturnType<typeof api.savingsRecovery.recordContribution>;
export type RecoveryMoveTransport = {
  transfer: (request: Transfer) => Promise<{ id: string }>;
  contribute: (request: Gift) => Promise<Receipt>;
  newKey: () => string;
  reportFailure: (error: unknown) => boolean;
  onMoved: (receipt: Receipt, amountMinorUnits: number) => void;
};
const rejection = z.object({ kind: z.union([z.literal("recovery"), z.literal("accounting")]), code: z.string() });

export function useRecoveryMove(
  seed: { workspaceId: string; plan: RecoveryPlanView; sources: RecoveryPlace[] },
  transport: RecoveryMoveTransport,
) {
  const defaultSource = seed.sources.find((place) => place.id !== seed.plan.destinationFinancialAccountProfileId)
    ?? seed.sources[0] ?? null;
  const [sourceId, setSourceId] = useState(defaultSource?.id ?? null);
  const [amount, setAmount] = useState(formatMinor(seed.plan.currency, seed.plan.dueMinorUnits));
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [postedTransferId, setPostedTransferId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const transferKey = useRef<string | null>(null);
  const giftKey = useRef<string | null>(null);
  const transferId = useRef<string | null>(null);
  const submitting = useRef(false);
  const lifetime = useRef({ active: false });
  useLayoutEffect(() => {
    const mounted = { active: true };
    lifetime.current = mounted;
    return () => { mounted.active = false; };
  }, []);
  let minorUnits = 0;
  try { minorUnits = parseMoney(amount); } catch { /* Incomplete amount stays editable. */ }
  const editable = !busy && !pending && !postedTransferId;
  async function submit() {
    const mounted = lifetime.current;
    if (!mounted.active || submitting.current || !sourceId) return;
    if (!transferId.current && minorUnits <= 0) return;
    if (!transferId.current && sourceId === seed.plan.destinationFinancialAccountProfileId) {
      setError("Choose a different place to move money from.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      transferKey.current ??= transport.newKey();
      giftKey.current ??= transport.newKey();
      setPending(true);
      if (!transferId.current) {
        transferId.current = (await transport.transfer({
          workspaceId: seed.workspaceId,
          sourceFinancialAccountProfileId: sourceId,
          destinationFinancialAccountProfileId: seed.plan.destinationFinancialAccountProfileId,
          amount: { currency: seed.plan.currency, minorUnits },
          accountingDate: localDate(),
          description: `Recovery: ${seed.plan.title}`,
          idempotencyKey: transferKey.current,
        })).id;
      }
      if (!mounted.active) return;
      setPostedTransferId(transferId.current);
      const receipt = await transport.contribute({
        workspaceId: seed.workspaceId,
        planId: seed.plan.id,
        transferJournalEntryId: transferId.current,
        idempotencyKey: giftKey.current,
      });
      if (!mounted.active) return;
      setPending(false);
      transport.onMoved(receipt, receipt.contribution.amountMinorUnits);
    } catch (caught) {
      if (transport.reportFailure(caught) || !mounted.active) return;
      const parsed = rejection.safeParse(caught instanceof ConvexError ? caught.data : null);
      if (parsed.success) {
        setPending(false);
        if (!transferId.current) {
          transferKey.current = null;
          giftKey.current = null;
        }
        setError("The transfer posted or the contribution was rejected. Retry to use the same movement safely.");
      } else setError("Could not confirm the transfer. Retry to safely check the same movement.");
    } finally {
      submitting.current = false;
      if (mounted.active) setBusy(false);
    }
  }
  const canEdit = () => lifetime.current.active && !submitting.current && !transferKey.current;
  return {
    sourceId, amount, busy, pending, postedTransferId, error, editable,
    canSubmit: !busy && !!sourceId && (pending || !!postedTransferId || minorUnits > 0),
    canDismiss: !busy && !pending,
    onSource: (id: string) => { if (canEdit()) setSourceId(id); },
    onAmount: (value: string) => { if (canEdit()) setAmount(value); },
    submit,
  };
}

function formatMinor(currency: string, minorUnits: number) {
  return formatMoney({ currency, minorUnits }).replace(`${currency} `, "");
}
