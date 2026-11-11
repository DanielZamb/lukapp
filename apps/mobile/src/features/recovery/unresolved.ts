import type { FunctionArgs } from "convex/server";
import { useCallback, useEffect, useMemo } from "react";
import { z } from "zod";
import type { api } from "../api";
import { unresolvedRequests } from "../unresolvedRequests";
import type { RecoveryPlanView } from "./model";

export type MoveRequest = FunctionArgs<typeof api.savingsRecovery.recordContribution>;
export type ActivationRequest = FunctionArgs<typeof api.savingsRecovery.activatePlan>;

/**
 * A Move money or plan activation that was sent and whose outcome is not known yet: exactly the request to send again.
 * A plan holds at most one unconfirmed movement and an expense at most one unconfirmed activation.
 */
export type UnresolvedRecovery = { act: "move"; request: MoveRequest } | { act: "activate"; request: ActivationRequest };

export function unresolvedRecoveryKey(subject: string) {
  return `lukapp.recovery.unresolved.${subject}`;
}

const id = z.string().min(1);
const move = z.object({
  workspaceId: id,
  planId: id,
  sourceFinancialAccountProfileId: id,
  amount: z.object({ currency: z.string().min(1), minorUnits: z.number().int() }).strict(),
  accountingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string(),
  idempotencyKey: id,
}).strict();
const activation = z.object({
  workspaceId: id,
  sourceJournalEntryId: id,
  destinationFinancialAccountProfileId: id,
  installmentCount: z.number().int(),
  installmentMinorUnits: z.number().int(),
  idempotencyKey: id,
  replacesPlanId: id.optional(),
}).strict();

const slotOf = (entry: UnresolvedRecovery) => entry.act === "move"
  ? JSON.stringify(["move", entry.request.workspaceId, entry.request.planId])
  : JSON.stringify(["activate", entry.request.workspaceId, entry.request.sourceJournalEntryId]);

const recovery = unresolvedRequests<UnresolvedRecovery>({
  item: unresolvedRecoveryKey,
  field: "requests",
  entry: z.discriminatedUnion("act", [
    z.object({ act: z.literal("move"), request: move }).strict(),
    z.object({ act: z.literal("activate"), request: activation }).strict(),
  ]),
  slot: slotOf,
  scope: (entry) => entry.request.workspaceId,
  idempotencyKey: (entry) => entry.request.idempotencyKey,
  unreadable: "Unreadable unresolved Recovery requests",
});

/**
 * Whether the plans the server shows already settle a saved request. An activation is settled by a plan for its expense
 * that is not cancelled, since a resend could only replay it or be refused, or by a cancelled one with its terms. The
 * board carries no plan key, so the terms stand in for it: a same-terms plan from another phone settles it too, and
 * resending after that plan was cancelled would restart a plan the person ended.
 */
function settledByBoard(entry: UnresolvedRecovery, plans: readonly RecoveryPlanView[]) {
  if (entry.act === "move") {
    const { planId, idempotencyKey } = entry.request;
    return plans.some((plan) => plan.id === planId && plan.contributionHistory.some((item) => item.idempotencyKey === idempotencyKey));
  }
  const request = entry.request;
  return plans.some((plan) => plan.sourceJournalEntryId === request.sourceJournalEntryId && (plan.status !== "cancelled" || (
    plan.destinationFinancialAccountProfileId === request.destinationFinancialAccountProfileId
    && plan.installmentCount === request.installmentCount && plan.installmentMinorUnits === request.installmentMinorUnits
    && (request.replacesPlanId === undefined || plan.replacesPlanId === request.replacesPlanId))));
}

export const keepUnresolvedRecovery = recovery.keep;
export const readUnresolvedRecovery = recovery.read;

/** Part of the local input wiped on sign-out and device revocation. */
export const clearUnresolvedRecovery = recovery.clear;

/**
 * The movements and activations of one workspace that this phone sent without learning their outcome, as read when
 * Recovery opened, less those the server's plans already settle. Until one is settled, the screen for its plan or
 * expense can only resend it.
 */
export function useUnresolvedRecovery(workspaceId: string, plans: readonly RecoveryPlanView[] | undefined) {
  const { stored, keep, settle, retryRead } = recovery.useStored(workspaceId);
  const forget = useCallback((entry: UnresolvedRecovery) => settle(slotOf(entry), entry.request.idempotencyKey), [settle]);
  const [entries, settled] = useMemo(() => {
    const all = stored === undefined || stored === "unreadable" ? [] : stored;
    const answered = plans ? all.filter((entry) => settledByBoard(entry, plans)) : [];
    return [all.filter((entry) => !answered.includes(entry)), answered];
  }, [stored, plans]);
  useEffect(() => {
    for (const entry of settled) void forget(entry).catch(() => {});
  }, [settled, forget]);
  const moves = entries.flatMap((entry) => entry.act === "move" ? [entry.request] : []);
  const activations = entries.flatMap((entry) => entry.act === "activate" ? [entry.request] : []);
  return {
    reading: stored === undefined,
    unreadable: stored === "unreadable",
    move: (planId: string) => moves.find((request) => request.planId === planId) ?? null,
    activation: (expenseId: string) => activations.find((request) => request.sourceJournalEntryId === expenseId) ?? null,
    keepMove: (request: MoveRequest) => keep({ act: "move", request }),
    forgetMove: (request: MoveRequest) => forget({ act: "move", request }),
    keepActivation: (request: ActivationRequest) => keep({ act: "activate", request }),
    forgetActivation: (request: ActivationRequest) => forget({ act: "activate", request }),
    retryRead,
  };
}
