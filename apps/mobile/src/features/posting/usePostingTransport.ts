import { useAction } from "convex/react";
import * as Crypto from "expo-crypto";
import { useMemo, useRef } from "react";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import {
  runLocalInputWrite,
  useLocalInputLease,
} from "../../local-auth/localInput";
import { api } from "../api";
import {
  beginPostIn,
  parseLocalEntryDocument,
  readRaw,
  removeIn,
  writeDocument,
} from "../localEntryDrafts";
import type { PendingPosting } from "./pendingPostingSchema";
import type { PostingTransport } from "./usePostingEditor";

export function usePostingTransport(subject: string): PostingTransport {
  const lease = useLocalInputLease();
  const reportFailure = useDeviceAccessFailure();
  const postingId = useRef<string | undefined>(undefined);
  const expense = useAction(api.accounting.recordCashExpense);
  const income = useAction(api.accounting.recordCashIncome);
  const transfer = useAction(api.accounting.recordAccountTransfer);
  const opening = useAction(api.accounting.recordOpeningPosition);
  const setup = useAction(api.accounting.setupFinancialAccountProfile);
  return useMemo(
    () => ({
      load: async () => {
        const now = Date.now();
        const parsed = parseLocalEntryDocument(await readRaw(subject), now);
        if (parsed.dirty)
          await runLocalInputWrite(lease, () =>
            writeDocument(subject, parsed.document),
          );
        const postings = parsed.document.drafts.filter(
          (draft) => draft.status === "posting",
        );
        if (postings.length !== 1) {
          postingId.current = undefined;
          return null;
        }
        postingId.current = postings[0].id;
        return postings[0].command;
      },
      save: (entry: PendingPosting, draftId?: string) =>
        runLocalInputWrite(lease, async () => {
          const now = Date.now();
          const parsed = parseLocalEntryDocument(await readRaw(subject), now);
          const begun = beginPostIn(
            parsed.document,
            { draftId: draftId ?? postingId.current, command: entry },
            now,
            Crypto.randomUUID,
          );
          postingId.current = begun.draft.id;
          await writeDocument(subject, begun.document);
        }),
      clear: () =>
        runLocalInputWrite(lease, async () => {
          const id = postingId.current;
          if (!id) return;
          const now = Date.now();
          const parsed = parseLocalEntryDocument(await readRaw(subject), now);
          await writeDocument(subject, removeIn(parsed.document, id));
          postingId.current = undefined;
        }),
      reportFailure,
      newKey: Crypto.randomUUID,
      post: async (entry: PendingPosting) => {
        switch (entry.kind) {
          case "expense": {
            const receipt = await expense(entry.payload);
            return {
              ...receipt,
              amount: {
                ...receipt.amount,
                minorUnits: -receipt.amount.minorUnits,
              },
            };
          }
          case "income":
            return income(entry.payload);
          case "transfer": {
            const receipt = await transfer(entry.payload);
            return {
              ...receipt,
              amount: {
                ...receipt.amount,
                minorUnits: -receipt.amount.minorUnits,
              },
            };
          }
          case "opening": {
            const receipt = await opening(entry.payload);
            return (
              receipt ?? {
                description: "Zero starting amount, no entry needed",
                amount: entry.payload.amount,
                title: "Confirmed",
              }
            );
          }
          case "setup": {
            const receipt = await setup(entry.payload);
            return {
              description: receipt.financialAccountProfile.name,
              amount: entry.payload.amount,
              financialAccountProfileId: receipt.financialAccountProfile.id,
              title: "Place added",
            };
          }
        }
      },
    }),
    [subject, lease, reportFailure, expense, income, transfer, opening, setup],
  );
}
