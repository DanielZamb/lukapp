import * as Crypto from "expo-crypto";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { useLocalInputLease } from "../local-auth/localInput";
import {
  countDraftsInMonth,
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
  month?: { year: number; month: number };
}): {
  count: number | null;
  monthCount: number | null;
  items: DraftListItem[];
  error: string;
  countMonth: (period: { year: number; month: number }) => Promise<number>;
  port: LocalEntryDraftsPort;
} {
  const lease = useLocalInputLease();
  const [count, setCount] = useState<number | null>(null);
  const [monthCount, setMonthCount] = useState<number | null>(null);
  const [items, setItems] = useState<DraftListItem[]>([]);
  const [error, setError] = useState("");
  const monthKey = input.month
    ? `${input.month.year}-${input.month.month}`
    : "";
  const [countedMonth, setCountedMonth] = useState(monthKey);
  if (monthKey !== countedMonth) {
    setCountedMonth(monthKey);
    setMonthCount(null);
  }
  const refresh = useCallback(async () => {
    try {
      const document = await syncLocalEntryDocument(lease, input.subject);
      const now = Date.now();
      const view = viewDocument(document, input.workspaceId, now);
      setItems(view.items);
      setCount(view.count);
      setMonthCount(
        input.month
          ? countDraftsInMonth(document, input.workspaceId, input.month, now)
          : null,
      );
      setError("");
    } catch {
      setError("Could not load Drafts on this device.");
    }
  }, [input.subject, input.workspaceId, input.month?.year, input.month?.month, lease]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  const countMonth = useCallback(
    async (period: { year: number; month: number }) => {
      const found = await mutateLocalEntryDocument(
        lease,
        input.subject,
        (document, now, dirty) => ({
          document,
          write: dirty,
          result: countDraftsInMonth(document, input.workspaceId, period, now),
        }),
      );
      if (
        input.month &&
        input.month.year === period.year &&
        input.month.month === period.month
      )
        setMonthCount(found);
      return found;
    },
    [input.subject, input.workspaceId, input.month?.year, input.month?.month, lease],
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
  return { count, monthCount, items, error, countMonth, port };
}
