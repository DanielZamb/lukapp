import { z } from "zod";
import { pendingPostingSchema, type PendingPosting } from "./pendingPostingSchema";

export const queuedPostingSchema = z.object({
  id: z.string().min(1),
  command: pendingPostingSchema,
  draftId: z.string().min(1).optional(),
});
export const postingBatchSchema = z.object({
  queue: z.array(queuedPostingSchema),
  pendingItemId: z.string().optional(),
  receipts: z.object({
    count: z.number().int().nonnegative(),
    net: z.number().int(),
  }),
});
export type QueuedPosting = z.infer<typeof queuedPostingSchema>;
export type StoredPostingBatch = z.infer<typeof postingBatchSchema>;

export type PostingBatchChange =
  | { kind: "keep"; item: QueuedPosting; editingId?: string }
  | { kind: "remove"; id: string }
  | { kind: "dispatch"; among: readonly string[] }
  | { kind: "saved"; id: string; draftId: string; command: PendingPosting }
  | { kind: "posted"; id: string; minorUnits: number }
  | { kind: "rejected"; id: string }
  | { kind: "finish" };
export type PostingBatchStorage = {
  load(): Promise<StoredPostingBatch>;
  apply(
    change: PostingBatchChange,
  ): Promise<{ batch: StoredPostingBatch; applied: boolean }>;
};

export function dispatchedItem(batch: StoredPostingBatch) {
  return batch.queue.find((row) => row.id === batch.pendingItemId);
}

/**
 * The only way a stored batch changes. While a dispatched command is unsettled the queue is frozen:
 * edits are refused and dispatch returns that same row, so a retry sends its identical command.
 * Otherwise dispatch takes the first stored row among those the person reviewed before posting.
 */
export function applyPostingBatchChange(
  batch: StoredPostingBatch,
  change: PostingBatchChange,
): { batch: StoredPostingBatch; applied: boolean } {
  const refused = { batch, applied: false };
  const dispatched = dispatchedItem(batch);
  switch (change.kind) {
    case "keep": {
      if (dispatched) return refused;
      if (change.editingId === undefined)
        return { batch: { ...batch, queue: [...batch.queue, change.item] }, applied: true };
      if (!batch.queue.some((row) => row.id === change.editingId)) return refused;
      return {
        batch: {
          ...batch,
          queue: batch.queue.map((row) => (row.id === change.editingId ? change.item : row)),
        },
        applied: true,
      };
    }
    case "remove":
      if (dispatched || !batch.queue.some((row) => row.id === change.id)) return refused;
      return {
        batch: { ...batch, queue: batch.queue.filter((row) => row.id !== change.id) },
        applied: true,
      };
    case "dispatch": {
      const next = dispatched ?? batch.queue.find((row) => change.among.includes(row.id));
      return { batch: { ...batch, pendingItemId: next?.id }, applied: next !== undefined };
    }
    case "saved":
      if (dispatched?.id !== change.id) return refused;
      return {
        batch: {
          ...batch,
          queue: batch.queue.map((row) =>
            row.id === change.id ? { ...row, draftId: change.draftId, command: change.command } : row,
          ),
        },
        applied: true,
      };
    case "posted":
      if (!batch.queue.some((row) => row.id === change.id)) return refused;
      return {
        batch: {
          ...batch,
          pendingItemId: dispatched?.id === change.id ? undefined : batch.pendingItemId,
          queue: batch.queue.filter((row) => row.id !== change.id),
          receipts: {
            count: batch.receipts.count + 1,
            net: batch.receipts.net + change.minorUnits,
          },
        },
        applied: true,
      };
    case "rejected":
      if (dispatched?.id !== change.id) return refused;
      return {
        batch: {
          ...batch,
          pendingItemId: undefined,
          queue: batch.queue.map((row) =>
            row.id === change.id && (row.command.kind === "opening" || row.command.kind === "setup")
              ? { ...row, draftId: undefined }
              : row,
          ),
        },
        applied: true,
      };
    case "finish":
      return { batch: { ...batch, receipts: { count: 0, net: 0 } }, applied: true };
  }
}
