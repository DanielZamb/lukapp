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
  const editable = loaded && !busy && !state.pendingItemId;

  useEffect(() => {
    let active = true;
    setLoaded(false);
    void storage
      .load()
      .then((restored) => {
        if (!active) return;
        current.current = restored;
        setState(restored);
        setLoaded(true);
      })
      .catch((failure: unknown) => {
        if (active && !transport.reportFailure?.(failure))
          setError(
            "Could not restore the batch on this device. Reopen this page to try again.",
          );
      });
    return () => {
      active = false;
    };
  }, [storage, transport]);

  async function persist(next: StoredPostingBatch) {
    await storage.save(next);
    current.current = next;
    setState(next);
  }

  async function edit(
    change: (queue: StoredPostingBatch["queue"]) => StoredPostingBatch["queue"],
  ) {
    if (!editable || lock.current) return false;
    lock.current = true;
    setBusy(true);
    try {
      await persist({
        ...current.current,
        queue: change(current.current.queue),
      });
      setPosted(null);
      setError("");
      return true;
    } catch (failure) {
      if (!transport.reportFailure?.(failure))
        setError("Could not save the batch on this device. Try again.");
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function postAll() {
    if (!loaded || lock.current || current.current.queue.length === 0) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setPosted(null);
    try {
      const restored = await storage.load();
      current.current = restored;
      setState(restored);
      const queue = restored.queue;
      if (beforePost && !(await beforePost(queue))) return;
      for (const item of queue) {
        // Persist retry-only status before any transport operation can outlive this route.
        await persist({ ...current.current, pendingItemId: item.id });
        const saved = await transport.save(item.command, item.draftId);
        await persist({
          ...current.current,
          queue: current.current.queue.map((row) =>
            row.id === item.id
              ? { ...row, draftId: saved.id, command: saved.command }
              : row,
          ),
        });
        const receipt = await transport.post(saved.command);
        await transport.clear();
        await persist({
          queue: current.current.queue.filter((row) => row.id !== item.id),
          receipts: {
            count: current.current.receipts.count + 1,
            net: current.current.receipts.net + receipt.amount.minorUnits,
          },
        });
      }
      const receipt = current.current.receipts;
      await persist({ ...current.current, receipts: { count: 0, net: 0 } });
      setPosted(receipt);
    } catch (failure) {
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
          await persist({
            ...current.current,
            pendingItemId: undefined,
            queue: current.current.queue.map((row) =>
              row.id === current.current.pendingItemId &&
              (row.command.kind === "opening" || row.command.kind === "setup")
                ? { ...row, draftId: undefined }
                : row,
            ),
          });
          setError(
            "message" in data && typeof data.message === "string"
              ? data.message
              : "Entry was rejected. Edit the draft and try again.",
          );
        } catch {
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
      lock.current = false;
      setBusy(false);
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
