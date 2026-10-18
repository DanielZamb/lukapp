import { z } from "zod";
import { pendingPostingSchema } from "./pendingPostingSchema";

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
export type PostingBatchStorage = {
  load(): Promise<StoredPostingBatch>;
  update(
    change: (batch: StoredPostingBatch) => StoredPostingBatch,
  ): Promise<StoredPostingBatch>;
};
