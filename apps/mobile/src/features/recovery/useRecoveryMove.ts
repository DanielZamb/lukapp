import { useLayoutEffect, useRef, useState } from "react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useT } from "../../i18n";
import type { api } from "../api";
import { amountMinorUnits, amountOfMinorUnits, type AmountSession } from "../amount/session";
import { defaultAccountingDate } from "../timeZones";
import { refusalCodeOf } from "../useFrozenCommand";
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

export function useRecoveryMove(
  seed: { workspaceId: string; timeZone: string; plan: RecoveryPlanView; sources: RecoveryPlace[] },
  transport: RecoveryMoveTransport,
) {
  const { t } = useT();
  const defaultSource = seed.sources.find((place) => place.id !== seed.plan.destinationFinancialAccountProfileId)
    ?? null;
  const source = useChosenPlace(seed.sources, defaultSource?.id ?? null);
  const sourceId = source.id;
  const [amount, setAmount] = useState(() => amountOfMinorUnits(seed.plan.currency, seed.plan.dueMinorUnits, { hideZeroDecimals: true }));
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
  const minorUnits = amountMinorUnits(amount) ?? 0;
  const editable = !busy && !pending;
  async function submit() {
    const mounted = lifetime.current;
    if (!request.current && seed.plan.status === "suspended") return;
    const selected = request.current?.sourceFinancialAccountProfileId ?? sourceId;
    if (!mounted.active || submitting.current || !selected || (!request.current && minorUnits <= 0)) return;
    if (!request.current && selected === seed.plan.destinationFinancialAccountProfileId) {
      setError(t("recovery.moveSameSource"));
      return;
    }
    if (!request.current && source.unavailable) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const payload = request.current ?? {
        workspaceId: seed.workspaceId,
        planId: seed.plan.id,
        sourceFinancialAccountProfileId: selected,
        amount: { currency: seed.plan.currency, minorUnits },
        accountingDate: defaultAccountingDate(seed.timeZone),
        description: t("recovery.moveDescription", { title: seed.plan.title }),
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
      const code = refusalCodeOf(caught);
      const sent = request.current;
      if (code !== null && sent) {
        request.current = null;
        setPending(false);
        const ended = endedPlaceRefusal(code);
        if (ended) source.refuse(sent.sourceFinancialAccountProfileId, ended);
        else setError(t("recovery.moveRejected"));
      } else setError(t("recovery.moveUncertain"));
    } finally {
      submitting.current = false;
      if (mounted.active) setBusy(false);
    }
  }
  const canEdit = () => lifetime.current.active && !submitting.current && !request.current;
  return {
    sourceId, unavailable: source.unavailable, amount, busy, pending, error, editable,
    canSubmit: !busy && (pending || (seed.plan.status === "active" && !!sourceId && !source.unavailable
      && sourceId !== seed.plan.destinationFinancialAccountProfileId && minorUnits > 0)),
    canDismiss: !busy && !pending,
    onSource: (id: string) => { if (canEdit()) source.choose(id); },
    onAmount: (value: AmountSession) => { if (canEdit() && value.currency === seed.plan.currency) setAmount(value); },
    submit,
  };
}
