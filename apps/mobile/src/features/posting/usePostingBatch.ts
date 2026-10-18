import { useRef, useState } from "react";
import { ConvexError } from "convex/values";
import type { PendingPosting } from "./pendingPostingSchema";
import type { PostingTransport } from "./usePostingEditor";

export type BatchDraft = { command: PendingPosting; draftId?: string };
export type QueuedPosting = BatchDraft & { id: string };
export type BatchReceipt = { count: number; net: number };

export function signedBatchAmount(command: PendingPosting) {
  return (
    (command.kind === "expense" || command.kind === "transfer" ? -1 : 1) *
    command.payload.amount.minorUnits
  );
}

export function usePostingBatch(transport: PostingTransport) {
  const [queue, setQueue] = useState<QueuedPosting[]>([]);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");
  const [posted, setPosted] = useState<BatchReceipt | null>(null);
  const lock = useRef(false);
  const pendingId = useRef<string | undefined>(undefined);
  const receipts = useRef<BatchReceipt>({ count: 0, net: 0 });
  const editable = !busy && !retrying;

  function keep(draft: BatchDraft, editingId?: string) {
    if (!editable || lock.current) return false;
    const item = {
      ...draft,
      id: editingId ?? draft.command.payload.idempotencyKey,
    };
    setQueue((current) =>
      editingId
        ? current.map((row) => (row.id === editingId ? item : row))
        : [...current, item],
    );
    setPosted(null);
    setError("");
    return true;
  }

  async function postAll() {
    if (lock.current || queue.length === 0) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setPosted(null);
    try {
      for (const item of queue) {
        const saved = await transport.save(
          item.command,
          pendingId.current ?? item.draftId,
        );
        pendingId.current = saved.id;
        setQueue((current) =>
          current.map((row) =>
            row.id === item.id
              ? { ...row, draftId: saved.id, command: saved.command }
              : row,
          ),
        );
        setRetrying(true);
        const receipt = await transport.post(saved.command);
        await transport.clear();
        pendingId.current = undefined;
        setRetrying(false);
        receipts.current = {
          count: receipts.current.count + 1,
          net: receipts.current.net + receipt.amount.minorUnits,
        };
        setQueue((current) => current.filter((row) => row.id !== item.id));
      }
      setPosted(receipts.current);
      receipts.current = { count: 0, net: 0 };
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
          pendingId.current = undefined;
          setRetrying(false);
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
    queue,
    busy,
    editable,
    error,
    posted,
    keep,
    postAll,
    remove: (id: string) => {
      if (editable && !lock.current)
        setQueue((current) => current.filter((row) => row.id !== id));
    },
  };
}
