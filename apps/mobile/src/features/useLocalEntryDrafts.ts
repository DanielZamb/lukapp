import * as Crypto from "expo-crypto";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { useLocalInputLease } from "../local-auth/localInput";
import {
  findLiveDraft,
  keepIn,
  mutateLocalEntryDocument,
  parseLocalEntryDocument,
  readRaw,
  syncLocalEntryDocument,
  viewDocument,
  type DraftListItem,
  type LocalEntryDraftsPort,
} from "./localEntryDrafts";

export function useLocalEntryDrafts(input: {
  subject: string;
  workspaceId: string;
}): {
  count: number | null;
  items: DraftListItem[];
  error: string;
  port: LocalEntryDraftsPort;
} {
  const lease = useLocalInputLease();
  const [count, setCount] = useState<number | null>(null);
  const [items, setItems] = useState<DraftListItem[]>([]);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const document = await syncLocalEntryDocument(lease, input.subject);
      const view = viewDocument(
        document,
        input.workspaceId,
        Date.now(),
      );
      setItems(view.items);
      setCount(view.count);
      setError("");
    } catch {
      setError("Could not load Drafts on this device.");
    }
  }, [input.subject, input.workspaceId, lease]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  const port = useMemo<LocalEntryDraftsPort>(
    () => ({
      keep: async (form) => {
        const id = await mutateLocalEntryDocument(
          lease,
          input.subject,
          (document, now) => {
            const kept = keepIn(document, form, now, Crypto.randomUUID);
            return { document: kept.document, result: kept.id, write: true };
          },
        );
        await refresh();
        return id;
      },
      read: async (id) => {
        const now = Date.now();
        const parsed = parseLocalEntryDocument(
          await readRaw(input.subject),
          now,
        );
        return findLiveDraft(parsed.document, id, input.workspaceId, now);
      },
    }),
    [input.subject, input.workspaceId, lease, refresh],
  );
  return { count, items, error, port };
}
