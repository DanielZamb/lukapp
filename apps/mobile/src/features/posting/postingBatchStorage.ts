import { useMemo } from "react";
import {
  useLocalInputLease,
  type LocalInputLease,
} from "../../local-auth/localInput";
import {
  mutateLocalEntryDocument,
  type LocalEntryDocument,
} from "../localEntryDrafts";
import {
  applyPostingBatchChange,
  type PostingBatchStorage,
  type StoredPostingBatch,
} from "./postingBatchSchema";

function storedBatch(
  document: LocalEntryDocument,
  workspaceId: string,
): StoredPostingBatch {
  const batch = document.postingBatches?.[workspaceId] ?? {
    queue: [],
    receipts: { count: 0, net: 0 },
  };
  let pendingItemId = batch.queue.some((row) => row.id === batch.pendingItemId)
    ? batch.pendingItemId
    : undefined;
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
  return { ...batch, queue, pendingItemId };
}

export function createPostingBatchStorage(
  lease: LocalInputLease,
  subject: string,
  workspaceId: string,
): PostingBatchStorage {
  return {
    load: () =>
      mutateLocalEntryDocument(lease, subject, (document, _now, dirty) => ({
        document,
        write: dirty,
        result: storedBatch(document, workspaceId),
      })),
    apply: (change) =>
      mutateLocalEntryDocument(lease, subject, (document) => {
        const result = applyPostingBatchChange(
          storedBatch(document, workspaceId),
          change,
        );
        return {
          document: {
            ...document,
            postingBatches: {
              ...document.postingBatches,
              [workspaceId]: result.batch,
            },
          },
          write: true,
          result,
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
