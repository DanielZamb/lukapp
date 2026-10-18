import { useEffect, useRef, useState } from "react";
import { ConvexError } from "convex/values";
import type { PendingPosting } from "./pendingPostingSchema";
import type { PostingTransport } from "./usePostingEditor";
import type {
  PostingBatchStorage,
  StoredPostingBatch,
} from "./postingBatchSchema";
export type { QueuedPosting } from "./postingBatchSchema";

export type BatchDraft = { command: PendingPosting; draftId?: string };
export type BatchReceipt = { count: number; net: number };

export function signedBatchAmount(command: PendingPosting) {
  return (
    (command.kind === "expense" || command.kind === "transfer" ? -1 : 1) *
    command.payload.amount.minorUnits
  );
}

export function usePostingBatch(
  transport: PostingTransport,
  storage: PostingBatchStorage,
  beforePost?: (queue: BatchDraft[]) => Promise<boolean>,
) {
  const [state, setState] = useState<StoredPostingBatch>({
    queue: [],
    receipts: { count: 0, net: 0 },
  });
  const current = useRef(state);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [posted, setPosted] = useState<BatchReceipt | null>(null);
  const lock = useRef(false);
  const lifetime = useRef({ active: false });
  const editable = loaded && !busy && !state.pendingItemId;

  useEffect(() => {
    const owner = { active: true };
    lifetime.current = owner;
    lock.current = false;
    setBusy(false);
    setLoaded(false);
    void storage
      .load()
      .then((restored) => {
        if (!owner.active) return;
        current.current = restored;
        setState(restored);
        setLoaded(true);
      })
      .catch((failure: unknown) => {
        if (owner.active && !transport.reportFailure?.(failure))
          setError(
            "Could not restore the batch on this device. Reopen this page to try again.",
          );
      });
    return () => {
      owner.active = false;
    };
  }, [storage, transport]);

  async function persist(
    owner: { active: boolean },
    change: (batch: StoredPostingBatch) => StoredPostingBatch,
  ) {
    const next = await storage.update((batch) =>
      owner.active ? change(batch) : batch,
    );
    if (!owner.active) return;
    current.current = next;
    setState(next);
  }

  async function edit(
    change: (queue: StoredPostingBatch["queue"]) => StoredPostingBatch["queue"],
  ) {
    const owner = lifetime.current;
    if (!owner.active || !editable || lock.current) return false;
    lock.current = true;
    setBusy(true);
    try {
      await persist(owner, (batch) => ({ ...batch, queue: change(batch.queue) }));
      if (!owner.active) return false;
      setPosted(null);
      setError("");
      return true;
    } catch (failure) {
      if (!owner.active) return false;
      if (!transport.reportFailure?.(failure))
        setError("Could not save the batch on this device. Try again.");
      return false;
    } finally {
      if (owner.active) {
        lock.current = false;
        setBusy(false);
      }
    }
  }

  async function postAll() {
    const owner = lifetime.current;
    if (
      !owner.active || !loaded || lock.current || current.current.queue.length === 0
    ) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setPosted(null);
    try {
      const restored = await storage.load();
      if (!owner.active) return;
      current.current = restored;
      setState(restored);
      const queue = restored.queue;
      if (beforePost && !(await beforePost(queue))) return;
      if (!owner.active) return;
      for (const item of queue) {
        // Persist retry-only status before any transport operation can outlive this route.
        await persist(owner, (batch) => ({ ...batch, pendingItemId: item.id }));
        if (!owner.active) return;
        const saved = await transport.save(item.command, item.draftId);
        if (!owner.active) return;
        await persist(owner, (batch) => ({
          ...batch,
          queue: batch.queue.map((row) =>
            row.id === item.id
              ? { ...row, draftId: saved.id, command: saved.command }
              : row,
          ),
        }));
        if (!owner.active) return;
        const receipt = await transport.post(saved.command);
        if (!owner.active) return;
        await transport.clear();
        if (!owner.active) return;
        await persist(owner, (batch) => {
          if (!batch.queue.some((row) => row.id === item.id)) return batch;
          return {
            ...batch,
            pendingItemId:
              batch.pendingItemId === item.id ? undefined : batch.pendingItemId,
            queue: batch.queue.filter((row) => row.id !== item.id),
            receipts: {
              count: batch.receipts.count + 1,
              net: batch.receipts.net + receipt.amount.minorUnits,
            },
          };
        });
        if (!owner.active) return;
      }
      const receipt = current.current.receipts;
      await persist(owner, (batch) => ({
        ...batch,
        receipts: { count: 0, net: 0 },
      }));
      if (owner.active) setPosted(receipt);
    } catch (failure) {
      if (!owner.active) return;
      if (transport.reportFailure?.(failure)) return;
      const data: unknown =
        failure instanceof ConvexError ? failure.data : null;
      if (
        data &&
        typeof data === "object" &&
        "kind" in data &&
        data.kind === "accounting"
      ) {
        try {
          await transport.abort();
          if (!owner.active) return;
          await persist(owner, (batch) => ({
            ...batch,
            pendingItemId: undefined,
            queue: batch.queue.map((row) =>
              row.id === batch.pendingItemId &&
              (row.command.kind === "opening" || row.command.kind === "setup")
                ? { ...row, draftId: undefined }
                : row,
            ),
          }));
          if (!owner.active) return;
          setError(
            "message" in data && typeof data.message === "string"
              ? data.message
              : "Entry was rejected. Edit the draft and try again.",
          );
        } catch {
          if (!owner.active) return;
          setError(
            "Could not clear the saved entry. Post again to check its status.",
          );
        }
      } else {
        setError(
          "Could not confirm the batch. Post again to safely retry the remaining drafts.",
        );
      }
    } finally {
      if (owner.active) {
        lock.current = false;
        setBusy(false);
      }
    }
  }

  return {
    queue: state.queue,
    busy,
    editable,
    error,
    posted,
    keep: (draft: BatchDraft, editingId?: string) =>
      edit((queue) => {
        const item = {
          ...draft,
          id: editingId ?? draft.command.payload.idempotencyKey,
        };
        return editingId
          ? queue.map((row) => (row.id === editingId ? item : row))
          : [...queue, item];
      }),
    postAll,
    remove: (id: string) =>
      edit((queue) => queue.filter((row) => row.id !== id)),
  };
}
