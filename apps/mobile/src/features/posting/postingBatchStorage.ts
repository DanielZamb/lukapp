import { useMemo } from "react";
import {
  useLocalInputLease,
  type LocalInputLease,
} from "../../local-auth/localInput";
import { mutateLocalEntryDocument } from "../localEntryDrafts";
import type { PostingBatchStorage } from "./postingBatchSchema";

export function createPostingBatchStorage(
  lease: LocalInputLease,
  subject: string,
  workspaceId: string,
): PostingBatchStorage {
  return {
    load: () =>
      mutateLocalEntryDocument(lease, subject, (document, _now, dirty) => {
        const batch = document.postingBatches?.[workspaceId] ?? {
          queue: [],
          receipts: { count: 0, net: 0 },
        };
        let pendingItemId = batch.pendingItemId;
        const queue = batch.queue.map((row) => {
          const posting = document.drafts.find(
            (draft) =>
              draft.status === "posting" &&
              draft.command.payload.idempotencyKey ===
                row.command.payload.idempotencyKey,
          );
          if (posting?.status === "posting") {
            pendingItemId = row.id;
            return { ...row, draftId: posting.id, command: posting.command };
          }
          return row.draftId &&
            !document.drafts.some((draft) => draft.id === row.draftId)
            ? { ...row, draftId: undefined }
            : row;
        });
        return {
          document,
          write: dirty,
          result: { ...batch, queue, pendingItemId },
        };
      }),
    update: (change) =>
      mutateLocalEntryDocument(lease, subject, (document) => {
        const batch = change(document.postingBatches?.[workspaceId] ?? {
          queue: [],
          receipts: { count: 0, net: 0 },
        });
        return {
          document: {
            ...document,
            postingBatches: { ...document.postingBatches, [workspaceId]: batch },
          },
          write: true,
          result: batch,
        };
      }),
  };
}

export function usePostingBatchStorage(subject: string, workspaceId: string) {
  const lease = useLocalInputLease();
  return useMemo(
    () => createPostingBatchStorage(lease, subject, workspaceId),
    [lease, subject, workspaceId],
  );
}
