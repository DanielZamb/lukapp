import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useT, type MessageKey } from "../../i18n";
import type { api } from "../api";
import { useFormState, type AtPress } from "../amount/useAmountState";
import { useFrozenCommand } from "../useFrozenCommand";
import {
  correctionTargets,
  isCancellable,
  REASON_LIMIT,
  type RecoveryContribution,
  type RecoveryPlanView,
} from "./model";

type CancelRequest = FunctionArgs<typeof api.savingsRecovery.cancelPlan>;
type CancelReceipt = FunctionReturnType<typeof api.savingsRecovery.cancelPlan>;
type CorrectRequest = FunctionArgs<typeof api.savingsRecovery.correctContribution>;
type CorrectReceipt = FunctionReturnType<typeof api.savingsRecovery.correctContribution>;

export type RecoveryCancelTransport = {
  cancel: (request: CancelRequest) => Promise<CancelReceipt>;
  newKey: () => string;
  reportFailure: (error: unknown) => boolean;
  onCancelled: (receipt: CancelReceipt) => void;
};
export type RecoveryCorrectionTransport = {
  correct: (request: CorrectRequest) => Promise<CorrectReceipt>;
  newKey: () => string;
  reportFailure: (error: unknown) => boolean;
  onCorrected: (receipt: CorrectReceipt) => void;
};
export type CorrectionTarget = { kind: "remove" } | { kind: "plan"; planId: string };

const cancelRefusals: Record<string, MessageKey> = {
  plan_already_cancelled: "planning.cancelAlreadyCancelled",
  plan_already_complete: "planning.cancelAlreadyComplete",
  reason_invalid: "planning.cancelReasonInvalid",
  plan_not_found: "planning.cancelNotFound",
};

const correctionRefusals: Record<string, MessageKey> = {
  correction_exceeds_plan_remaining: "planning.fixExceeds",
  transfer_destination_mismatch: "planning.fixDestination",
  transfer_predates_activation: "planning.fixPredates",
  plan_cancelled: "planning.fixPlanCancelled",
  financial_account_profile_ended: "planning.fixPlaceEnded",
  place_undo_in_progress: "planning.fixPlaceUndoing",
  expense_not_recoverable: "planning.fixPlanSuspended",
  plan_not_found: "planning.fixPlanMissing",
  transfer_capacity_exceeded: "planning.fixCapacity",
  correction_target_same_plan: "planning.fixSamePlan",
  correction_target_same_expense: "planning.fixSameExpense",
  contribution_voided: "planning.fixVoided",
  contribution_already_corrected: "planning.fixAlreadyCorrected",
  contribution_not_found: "planning.fixContributionMissing",
  reason_invalid: "planning.fixReasonInvalid",
};

/**
 * cancelPlan and correctContribution (src/savingsRecovery/) look for the receipt under the key before anything
 * else but the key's own shape, so each refusal below answers a send whose outcome was unknown.
 */
const cancelSettles = new Set([...Object.keys(cancelRefusals), "idempotency_key_invalid"]);
const correctionSettles = new Set([...Object.keys(correctionRefusals), "transfer_not_usable", "destination_not_found", "idempotency_key_invalid"]);

function cancelReason(reason: string) {
  const trimmed = reason.trim();
  return { trimmed, valid: trimmed.length <= REASON_LIMIT };
}

export function useRecoveryCancel(
  seed: { workspaceId: string; plan: RecoveryPlanView },
  transport: RecoveryCancelTransport,
) {
  const { t } = useT();
  const [form, setForm, readForm] = useFormState({ reason: "" });
  const command = useFrozenCommand({ send: transport.cancel, reportFailure: transport.reportFailure, onDone: transport.onCancelled,
    settles: (code) => cancelSettles.has(code) });
  const { state } = command;
  const { valid } = cancelReason(form.reason);
  const error = state.name === "uncertain" ? t("planning.cancelUncertain")
    : state.name === "open" && state.refusal ? t(cancelRefusals[state.refusal.code] ?? "planning.cancelRejected")
      : valid ? "" : t("planning.cancelReasonInvalid");
  return {
    reason: form.reason,
    error,
    busy: command.busy,
    pending: state.name === "uncertain",
    editable: !command.frozen,
    canDismiss: !command.frozen,
    dismiss: (close: () => void) => { if (command.canEdit()) close(); },
    canSubmit: !command.busy && (state.name === "uncertain" || (isCancellable(seed.plan) && valid)),
    onReason: (value: string) => { if (command.canEdit()) setForm({ reason: value }); },
    submit: () => command.submit(() => {
      const { trimmed, valid: sendable } = cancelReason(readForm().reason);
      return !isCancellable(seed.plan) || !sendable ? null : {
        workspaceId: seed.workspaceId,
        planId: seed.plan.id,
        ...(trimmed ? { reason: trimmed } : {}),
        idempotencyKey: transport.newKey(),
      };
    }),
  };
}

type Correction = { target: CorrectionTarget | null; reason: string };

export function useRecoveryCorrection(
  seed: { workspaceId: string; plan: RecoveryPlanView; plans: RecoveryPlanView[]; contribution: RecoveryContribution },
  transport: RecoveryCorrectionTransport,
) {
  const { t } = useT();
  const [form, setForm, readForm] = useFormState<Correction>({ target: null, reason: "" });
  const command = useFrozenCommand({ send: transport.correct, reportFailure: transport.reportFailure, onDone: transport.onCorrected,
    settles: (code) => correctionSettles.has(code) });
  const { state } = command;
  const targets = correctionTargets(seed.plans, seed.plan, seed.contribution);
  /** Whether a correction may be sent with these answers; rendering asks with the form, a press with what it reads. */
  const ready = ({ target, reason }: Correction | AtPress<Correction>) => {
    const trimmed = reason.trim();
    return seed.contribution.status === "active" && trimmed.length > 0 && trimmed.length <= REASON_LIMIT
      && (target?.kind === "remove" || (target?.kind === "plan" && targets.some((plan) => plan.id === target.planId)));
  };
  const refusedTitle = (request: CorrectRequest) =>
    seed.plans.find((plan) => plan.id === (request.targetPlanId ?? seed.plan.id))?.title ?? seed.plan.title;
  const error = state.name === "uncertain" ? t("planning.fixUncertain")
    : state.name === "open" && state.refusal
      ? t(correctionRefusals[state.refusal.code] ?? "planning.fixRejected", { plan: refusedTitle(state.refusal.request) })
      : form.reason.trim().length > REASON_LIMIT ? t("planning.fixReasonInvalid") : "";
  return {
    target: form.target,
    targets,
    reason: form.reason,
    error,
    busy: command.busy,
    pending: state.name === "uncertain",
    editable: !command.frozen,
    canDismiss: !command.frozen,
    dismiss: (close: () => void) => { if (command.canEdit()) close(); },
    canSubmit: !command.busy && (state.name === "uncertain" || ready(form)),
    onTarget: (next: CorrectionTarget) => { if (command.canEdit()) setForm((now) => ({ ...now, target: next })); },
    onReason: (value: string) => { if (command.canEdit()) setForm((now) => ({ ...now, reason: value })); },
    submit: () => command.submit(() => {
      const now = readForm();
      const target = now.target;
      return !ready(now) || !target ? null : {
        workspaceId: seed.workspaceId,
        contributionId: seed.contribution.id,
        reason: now.reason.trim(),
        ...(target.kind === "plan" ? { targetPlanId: target.planId } : {}),
        idempotencyKey: transport.newKey(),
      };
    }),
  };
}
