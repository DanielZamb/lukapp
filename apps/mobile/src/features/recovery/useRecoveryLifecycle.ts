import { useState } from "react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useT, type MessageKey } from "../../i18n";
import type { api } from "../api";
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

export function useRecoveryCancel(
  seed: { workspaceId: string; plan: RecoveryPlanView },
  transport: RecoveryCancelTransport,
) {
  const { t } = useT();
  const [reason, setReason] = useState("");
  const command = useFrozenCommand({ send: transport.cancel, reportFailure: transport.reportFailure, onDone: transport.onCancelled });
  const { state } = command;
  const trimmed = reason.trim();
  const valid = trimmed.length <= REASON_LIMIT;
  const error = state.name === "uncertain" ? t("planning.cancelUncertain")
    : state.name === "open" && state.refusal ? t(cancelRefusals[state.refusal.code] ?? "planning.cancelRejected")
      : valid ? "" : t("planning.cancelReasonInvalid");
  return {
    reason,
    error,
    busy: command.busy,
    pending: state.name === "uncertain",
    editable: !command.frozen,
    canDismiss: !command.frozen,
    canSubmit: !command.busy && (state.name === "uncertain" || (isCancellable(seed.plan) && valid)),
    onReason: (value: string) => { if (command.canEdit()) setReason(value); },
    submit: () => command.submit(() => !isCancellable(seed.plan) || !valid ? null : {
      workspaceId: seed.workspaceId,
      planId: seed.plan.id,
      ...(trimmed ? { reason: trimmed } : {}),
      idempotencyKey: transport.newKey(),
    }),
  };
}

export function useRecoveryCorrection(
  seed: { workspaceId: string; plan: RecoveryPlanView; plans: RecoveryPlanView[]; contribution: RecoveryContribution },
  transport: RecoveryCorrectionTransport,
) {
  const { t } = useT();
  const [target, setTarget] = useState<CorrectionTarget | null>(null);
  const [reason, setReason] = useState("");
  const command = useFrozenCommand({ send: transport.correct, reportFailure: transport.reportFailure, onDone: transport.onCorrected });
  const { state } = command;
  const targets = correctionTargets(seed.plans, seed.plan, seed.contribution);
  const trimmed = reason.trim();
  const ready = seed.contribution.status === "active" && trimmed.length > 0 && trimmed.length <= REASON_LIMIT
    && (target?.kind === "remove" || (target?.kind === "plan" && targets.some((plan) => plan.id === target.planId)));
  const refusedTitle = (request: CorrectRequest) =>
    seed.plans.find((plan) => plan.id === (request.targetPlanId ?? seed.plan.id))?.title ?? seed.plan.title;
  const error = state.name === "uncertain" ? t("planning.fixUncertain")
    : state.name === "open" && state.refusal
      ? t(correctionRefusals[state.refusal.code] ?? "planning.fixRejected", { plan: refusedTitle(state.refusal.request) })
      : trimmed.length > REASON_LIMIT ? t("planning.fixReasonInvalid") : "";
  return {
    target,
    targets,
    reason,
    error,
    busy: command.busy,
    pending: state.name === "uncertain",
    editable: !command.frozen,
    canDismiss: !command.frozen,
    canSubmit: !command.busy && (state.name === "uncertain" || ready),
    onTarget: (next: CorrectionTarget) => { if (command.canEdit()) setTarget(next); },
    onReason: (value: string) => { if (command.canEdit()) setReason(value); },
    submit: () => command.submit(() => !ready || !target ? null : {
      workspaceId: seed.workspaceId,
      contributionId: seed.contribution.id,
      reason: trimmed,
      ...(target.kind === "plan" ? { targetPlanId: target.planId } : {}),
      idempotencyKey: transport.newKey(),
    }),
  };
}
