import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { runLocalInputWrite, useLocalInputLease, type LocalInputLease } from "../local-auth/localInput";

/**
 * One kind of request this phone keeps while its outcome is unknown. A request is written before it first leaves and
 * removed once a receipt, a refusal that answers it, or the server's own state settles it. Until then it is the only
 * request its slot can send: resending it under its own key returns the original receipt if it committed, performs it
 * if it did not, or is refused; it never becomes a second request.
 */
export type UnresolvedKind<Entry> = {
  /** The SecureStore item holding one person's requests of this kind. */
  item: (subject: string) => string;
  /** The document field listing them, beside a version. */
  field: string;
  /** Exactly what resending needs; anything else makes the document unreadable rather than silently changed. */
  entry: z.ZodType<Entry>;
  /** At most one request per slot; a newer one replaces it. */
  slot: (entry: Entry) => string;
  /** The requests a screen reads together. */
  scope: (entry: Entry) => string;
  idempotencyKey: (entry: Entry) => string;
  unreadable: string;
};

export type StoredRequests<Entry> = readonly Entry[] | "unreadable" | undefined;

export function unresolvedRequests<Entry>(kind: UnresolvedKind<Entry>) {
  const document = z.object({ v: z.literal(1), [kind.field]: z.array(kind.entry) }).strict();

  async function readAll(subject: string): Promise<Entry[]> {
    const raw = await SecureStore.getItemAsync(kind.item(subject));
    if (raw === null) return [];
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new Error(kind.unreadable); }
    const read = document.safeParse(parsed);
    if (!read.success) throw new Error(kind.unreadable);
    return read.data[kind.field] as Entry[];
  }

  function writeAll(subject: string, entries: Entry[]) {
    return entries.length ? SecureStore.setItemAsync(kind.item(subject), JSON.stringify({ v: 1, [kind.field]: entries }))
      : SecureStore.deleteItemAsync(kind.item(subject));
  }

  /**
   * Requests whose outcome became known while the phone failed to delete them. Reads in this app run leave them out
   * and delete them again. After a restart one reads as unconfirmed again; sending it under its own key can't apply it twice.
   */
  const answered = new Set<string>();
  const answeredId = (subject: string, slot: string, key: string) => JSON.stringify([subject, slot, key]);
  const isAnswered = (subject: string, entry: Entry) => answered.has(answeredId(subject, kind.slot(entry), kind.idempotencyKey(entry)));

  async function read(subject: string, scope: string) {
    return (await readAll(subject)).filter((entry) => kind.scope(entry) === scope && !isAnswered(subject, entry));
  }

  /** Stored before the request is sent, replacing any earlier one in the same slot. */
  function keep(lease: LocalInputLease, entry: Entry) {
    return runLocalInputWrite(lease, async () => {
      const others = (await readAll(lease.subject)).filter((stored) => kind.slot(stored) !== kind.slot(entry));
      await writeAll(lease.subject, [...others, entry]);
    });
  }

  /** Forgets a request once its outcome is known. Only the request with this key is removed, so a newer one survives an old answer. */
  async function settle(lease: LocalInputLease, slot: string, key: string) {
    const id = answeredId(lease.subject, slot, key);
    try {
      await runLocalInputWrite(lease, async () => {
        const entries = await readAll(lease.subject);
        const kept = entries.filter((stored) => !(kind.slot(stored) === slot && kind.idempotencyKey(stored) === key));
        if (kept.length !== entries.length) await writeAll(lease.subject, kept);
      });
      answered.delete(id);
    } catch (error) {
      answered.add(id);
      throw error;
    }
  }

  /** Part of the local input wiped on sign-out and device revocation. */
  function clear(subject: string) {
    return SecureStore.deleteItemAsync(kind.item(subject));
  }

  /**
   * The requests this phone holds for one scope, as read when the screen opened; undefined while reading. A request
   * sent later on the same screen stays in that screen's own frozen command.
   */
  function useStored(scope: string) {
    const lease = useLocalInputLease();
    const [stored, setStored] = useState<StoredRequests<Entry>>(undefined);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
      let current = true;
      readAll(lease.subject)
        .then((entries) => {
          const inScope = entries.filter((entry) => kind.scope(entry) === scope);
          if (current) setStored(inScope.filter((entry) => !isAnswered(lease.subject, entry)));
          for (const entry of inScope.filter((item) => isAnswered(lease.subject, item)))
            void settle(lease, kind.slot(entry), kind.idempotencyKey(entry)).catch(() => {});
        })
        .catch(() => { if (current) setStored("unreadable"); });
      return () => { current = false; };
    }, [lease, scope, attempt]);
    const keepHere = useCallback((entry: Entry) => keep(lease, entry), [lease]);
    /** Even when the phone can't delete it, a request whose outcome is known no longer holds this screen. */
    const settleHere = useCallback(async (slot: string, key: string) => {
      try {
        await settle(lease, slot, key);
      } finally {
        setStored((current) => {
          if (current === undefined || current === "unreadable") return current;
          const left = current.filter((entry) => !(kind.slot(entry) === slot && kind.idempotencyKey(entry) === key));
          return left.length === current.length ? current : left;
        });
      }
    }, [lease]);
    const retryRead = useCallback(() => setAttempt((value) => value + 1), []);
    return { stored, keep: keepHere, settle: settleHere, retryRead };
  }

  return { read, keep, settle, clear, useStored };
}
