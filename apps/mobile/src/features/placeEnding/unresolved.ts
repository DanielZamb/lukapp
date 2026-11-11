import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { runLocalInputWrite, useLocalInputLease, type LocalInputLease } from "../../local-auth/localInput";
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
const endingSchema = z.discriminatedUnion("act", [
  z.object({ act: z.literal("close"), request: closeRequest }).strict(),
  z.object({ act: z.literal("undo"), request: undoRequest }).strict(),
]);
const documentSchema = z.object({ v: z.literal(1), endings: z.array(endingSchema) }).strict();

/**
 * A Close or Undo that was sent and whose outcome is not known yet: exactly the request to send again, nothing more.
 * Resending it under its own key returns the original receipt if it committed, performs it if it did not, or is
 * refused as stale; it never becomes a new request.
 */
export type UnresolvedEnding = { act: "close"; request: CloseRequest } | { act: "undo"; request: UndoRequest };

const samePlace = (ending: UnresolvedEnding, workspaceId: string, placeId: string) =>
  ending.request.workspaceId === workspaceId && ending.request.financialAccountProfileId === placeId;

async function readAll(subject: string): Promise<UnresolvedEnding[]> {
  const raw = await SecureStore.getItemAsync(unresolvedEndingKey(subject));
  if (raw === null) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Unreadable unresolved Place endings"); }
  const document = documentSchema.safeParse(parsed);
  if (!document.success) throw new Error("Unreadable unresolved Place endings");
  return document.data.endings;
}

function writeAll(subject: string, endings: UnresolvedEnding[]) {
  return endings.length ? SecureStore.setItemAsync(unresolvedEndingKey(subject), JSON.stringify({ v: 1, endings }))
    : SecureStore.deleteItemAsync(unresolvedEndingKey(subject));
}

type RequestKey = Pick<CloseRequest, "workspaceId" | "financialAccountProfileId" | "idempotencyKey">;

/**
 * Requests whose outcome became known while the phone failed to delete them. Reads in this app run leave them out
 * and delete them again. After a restart one reads as unconfirmed again; sending it under its own key can't apply it twice.
 */
const answered = new Set<string>();
const answeredId = (subject: string, request: RequestKey) =>
  JSON.stringify([subject, request.workspaceId, request.financialAccountProfileId, request.idempotencyKey]);

async function readStored(subject: string, workspaceId: string, placeId: string) {
  return (await readAll(subject)).find((ending) => samePlace(ending, workspaceId, placeId)) ?? null;
}

export async function readUnresolvedEnding(subject: string, workspaceId: string, placeId: string) {
  const ending = await readStored(subject, workspaceId, placeId);
  return ending && !answered.has(answeredId(subject, ending.request)) ? ending : null;
}

/** Stored before the request is sent, replacing any earlier one for the same Place. */
export function keepUnresolvedEnding(lease: LocalInputLease, ending: UnresolvedEnding) {
  return runLocalInputWrite(lease, async () => {
    const others = (await readAll(lease.subject)).filter((stored) =>
      !samePlace(stored, ending.request.workspaceId, ending.request.financialAccountProfileId));
    await writeAll(lease.subject, [...others, ending]);
  });
}

/** Forgets a request once its outcome is known. Only the request with this key is removed, so a newer one survives an old answer. */
export async function settleUnresolvedEnding(lease: LocalInputLease, request: RequestKey) {
  const id = answeredId(lease.subject, request);
  try {
    await runLocalInputWrite(lease, async () => {
      const endings = await readAll(lease.subject);
      const kept = endings.filter((stored) => !(samePlace(stored, request.workspaceId, request.financialAccountProfileId)
        && stored.request.idempotencyKey === request.idempotencyKey));
      if (kept.length !== endings.length) await writeAll(lease.subject, kept);
    });
    answered.delete(id);
  } catch (error) {
    answered.add(id);
    throw error;
  }
}

/** Part of the local input wiped on sign-out and device revocation. */
export function clearUnresolvedEndings(subject: string) {
  return SecureStore.deleteItemAsync(unresolvedEndingKey(subject));
}

export type UnresolvedRead = UnresolvedEnding | null | "unreadable" | undefined;

/**
 * The unresolved Close or Undo this phone holds for one Place, as read when the screen opened; undefined while
 * reading. A request sent later on the same screen stays in that screen's own frozen command.
 */
export function useUnresolvedEnding(workspaceId: string, placeId: string) {
  const lease = useLocalInputLease();
  const [stored, setStored] = useState<UnresolvedRead>(undefined);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    readStored(lease.subject, workspaceId, placeId)
      .then((ending) => {
        const known = ending !== null && answered.has(answeredId(lease.subject, ending.request));
        if (current) setStored(known ? null : ending);
        if (known) void settleUnresolvedEnding(lease, ending.request).catch(() => {});
      })
      .catch(() => { if (current) setStored("unreadable"); });
    return () => { current = false; };
  }, [lease, workspaceId, placeId, attempt]);
  const keep = useCallback((ending: UnresolvedEnding) => keepUnresolvedEnding(lease, ending), [lease]);
  /** Even when the phone can't delete it, a request whose outcome is known no longer holds this screen. */
  const settle = useCallback(async (request: RequestKey) => {
    try {
      await settleUnresolvedEnding(lease, request);
    } finally {
      setStored((current) => current && current !== "unreadable" && current.request.idempotencyKey === request.idempotencyKey ? null : current);
    }
  }, [lease]);
  return { stored, keep, settle, retryRead: () => setAttempt((value) => value + 1) };
}
