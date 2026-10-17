import * as Crypto from "expo-crypto";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  runLocalInputWrite,
  useLocalInputLease,
} from "../local-auth/localInput";
import {
  findLiveDraft,
  keepIn,
  parseLocalEntryDocument,
  readRaw,
  viewDocument,
  writeDocument,
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
    const now = Date.now();
    try {
      const parsed = parseLocalEntryDocument(await readRaw(input.subject), now);
      if (parsed.dirty)
        await runLocalInputWrite(lease, () =>
          writeDocument(input.subject, parsed.document),
        );
      const view = viewDocument(parsed.document, input.workspaceId, now);
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
        let id = "";
        const now = Date.now();
        await runLocalInputWrite(lease, async () => {
          const parsed = parseLocalEntryDocument(
            await readRaw(input.subject),
            now,
          );
          const kept = keepIn(parsed.document, form, now, Crypto.randomUUID);
          await writeDocument(input.subject, kept.document);
          id = kept.id;
        });
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
