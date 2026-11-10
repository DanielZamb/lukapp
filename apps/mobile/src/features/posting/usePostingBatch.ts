import { useEffect, useRef, useState } from "react";
import { ConvexError } from "convex/values";
import { useT } from "../../i18n";
import { rejectionMessage } from "./rejection";
import type { PendingPosting } from "./pendingPostingSchema";
import type { PostingTransport } from "./usePostingEditor";
import {
  dispatchedItem,
  type PostingBatchChange,
  type PostingBatchStorage,
  type StoredPostingBatch,
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
  const { t } = useT();
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
          setError(t("posting.batchRestoreFailed"));
      });
    return () => {
      owner.active = false;
    };
  }, [storage, transport]);

  async function apply(owner: { active: boolean }, change: PostingBatchChange) {
    const result = await storage.apply(change);
    if (owner.active) {
      current.current = result.batch;
      setState(result.batch);
    }
    return result;
  }

  async function edit(change: Extract<PostingBatchChange, { kind: "keep" | "remove" }>) {
    const owner = lifetime.current;
    if (!owner.active || !editable || lock.current) return false;
    lock.current = true;
    setBusy(true);
    try {
      const { batch, applied } = await apply(owner, change);
      if (!owner.active) return false;
      setPosted(null);
      setError(
        applied
          ? ""
          : t(batch.pendingItemId ? "posting.batchWaiting" : "posting.batchChanged"),
      );
      return applied;
    } catch (failure) {
      if (!owner.active) return false;
      if (!transport.reportFailure?.(failure))
        setError(t("posting.batchSaveFailed"));
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
    let dispatched: string | undefined;
    try {
      const restored = await storage.load();
      if (!owner.active) return;
      current.current = restored;
      setState(restored);
      if (beforePost && !(await beforePost(restored.queue))) return;
      if (!owner.active) return;
      const reviewed = restored.queue.map((row) => row.id);
      for (;;) {
        const claimed = await apply(owner, { kind: "dispatch", among: reviewed });
        if (!owner.active) return;
        const item = dispatchedItem(claimed.batch);
        if (!item) break;
        dispatched = item.id;
        const saved = await transport.save(item.command, item.draftId);
        if (!owner.active) return;
        await apply(owner, { kind: "saved", id: item.id, draftId: saved.id, command: saved.command });
        if (!owner.active) return;
        const receipt = await transport.post(saved.command);
        if (!owner.active) return;
        await transport.clear();
        if (!owner.active) return;
        await apply(owner, { kind: "posted", id: item.id, minorUnits: receipt.amount.minorUnits });
        if (!owner.active) return;
      }
      const receipt = current.current.receipts;
      await apply(owner, { kind: "finish" });
      if (owner.active) setPosted(receipt);
    } catch (failure) {
      if (!owner.active) return;
      if (transport.reportFailure?.(failure)) return;
      const data: unknown =
        failure instanceof ConvexError ? failure.data : null;
      if (
        dispatched &&
        data &&
        typeof data === "object" &&
        "kind" in data &&
        data.kind === "accounting"
      ) {
        try {
          await transport.abort();
          if (!owner.active) return;
          await apply(owner, { kind: "rejected", id: dispatched });
          if (!owner.active) return;
          setError(rejectionMessage(t, failure, "posting.batchRejected"));
        } catch {
          if (!owner.active) return;
          setError(t("posting.batchClearFailed"));
        }
      } else {
        setError(t("posting.batchConfirmUncertain"));
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
    waiting: !!state.pendingItemId,
    error,
    posted,
    keep: (draft: BatchDraft, editingId?: string) =>
      edit({
        kind: "keep",
        item: { ...draft, id: editingId ?? draft.command.payload.idempotencyKey },
        editingId,
      }),
    postAll,
    remove: (id: string) => edit({ kind: "remove", id }),
  };
}
