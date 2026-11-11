import { useCallback } from "react";
import { z } from "zod";
import type { LocalInputLease } from "../../local-auth/localInput";
import { unresolvedRequests } from "../unresolvedRequests";
import type { CloseRequest, UndoRequest } from "./model";

export function unresolvedEndingKey(subject: string) {
  return `lukapp.placeEnding.unresolved.${subject}`;
}

const id = z.string().min(1);
const money = z.object({ currency: z.string().min(1), minorUnits: z.number().int() }).strict();
const description = z.string().optional();
const closeRequest = z.object({
  workspaceId: id,
  financialAccountProfileId: id,
  idempotencyKey: id,
  reviewedBalance: money,
  reviewedAccountingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  replacementDefaultFinancialAccountProfileId: id.optional(),
  closingAdjustmentExpenseName: z.string().optional(),
  closingAdjustmentIncomeName: z.string().optional(),
  lines: z.array(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("transfer"), otherFinancialAccountProfileId: id, amount: money, description }).strict(),
    z.object({ kind: z.literal("expense"), userCategoryId: id, amount: money, description }).strict(),
    z.object({ kind: z.literal("adjustment"), amount: money, description }).strict(),
  ])),
}).strict();
const undoRequest = z.object({
  workspaceId: id,
  financialAccountProfileId: id,
  idempotencyKey: id,
  previewFingerprint: z.string(),
  replacementDefaultFinancialAccountProfileId: id.optional(),
  reversalDescriptionPrefix: z.string().optional(),
}).strict();

/**
 * A Close or Undo that was sent and whose outcome is not known yet: exactly the request to send again, nothing more.
 * Resending it under its own key returns the original receipt if it committed, performs it if it did not, or is
 * refused as stale; it never becomes a new request.
 */
export type UnresolvedEnding = { act: "close"; request: CloseRequest } | { act: "undo"; request: UndoRequest };

type RequestKey = Pick<CloseRequest, "workspaceId" | "financialAccountProfileId" | "idempotencyKey">;

const placeSlot = (workspaceId: string, placeId: string) => JSON.stringify([workspaceId, placeId]);
const slotOf = (request: RequestKey) => placeSlot(request.workspaceId, request.financialAccountProfileId);

const endings = unresolvedRequests<UnresolvedEnding>({
  item: unresolvedEndingKey,
  field: "endings",
  entry: z.discriminatedUnion("act", [
    z.object({ act: z.literal("close"), request: closeRequest }).strict(),
    z.object({ act: z.literal("undo"), request: undoRequest }).strict(),
  ]),
  slot: (ending) => slotOf(ending.request),
  scope: (ending) => slotOf(ending.request),
  idempotencyKey: (ending) => ending.request.idempotencyKey,
  unreadable: "Unreadable unresolved Place endings",
});

export async function readUnresolvedEnding(subject: string, workspaceId: string, placeId: string) {
  return (await endings.read(subject, placeSlot(workspaceId, placeId)))[0] ?? null;
}

/** Stored before the request is sent, replacing any earlier one for the same Place. */
export function keepUnresolvedEnding(lease: LocalInputLease, ending: UnresolvedEnding) {
  return endings.keep(lease, ending);
}

/** Forgets a request once its outcome is known. Only the request with this key is removed, so a newer one survives an old answer. */
export function settleUnresolvedEnding(lease: LocalInputLease, request: RequestKey) {
  return endings.settle(lease, slotOf(request), request.idempotencyKey);
}

/** Part of the local input wiped on sign-out and device revocation. */
export const clearUnresolvedEndings = endings.clear;

export type UnresolvedRead = UnresolvedEnding | null | "unreadable" | undefined;

/**
 * The unresolved Close or Undo this phone holds for one Place, as read when the screen opened; undefined while
 * reading. A request sent later on the same screen stays in that screen's own frozen command.
 */
export function useUnresolvedEnding(workspaceId: string, placeId: string) {
  const { stored, keep, settle, retryRead } = endings.useStored(placeSlot(workspaceId, placeId));
  const read: UnresolvedRead = stored === undefined || stored === "unreadable" ? stored : stored[0] ?? null;
  const settleRequest = useCallback((request: RequestKey) => settle(slotOf(request), request.idempotencyKey), [settle]);
  return { stored: read, keep, settle: settleRequest, retryRead };
}
