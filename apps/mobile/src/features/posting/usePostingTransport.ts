import { useAction } from "convex/react";
import * as Crypto from "expo-crypto";
import { useMemo, useRef } from "react";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { useLocalInputLease } from "../../local-auth/localInput";
import { api } from "../api";
import {
  beginPostIn,
  mutateLocalEntryDocument,
  rejectPostIn,
  removeIn,
} from "../localEntryDrafts";
import type { PendingPosting } from "./pendingPostingSchema";
import type { LoadResult, PostingTransport } from "./usePostingEditor";

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
      load: (draftId?: string) =>
        mutateLocalEntryDocument<LoadResult>(
          lease,
          subject,
          (document, _now, dirty) => {
            const postings = document.drafts.filter(
              (draft) => draft.status === "posting",
            );
            const chosen = postings.find((draft) => draft.id === draftId);
            let result: LoadResult;
            if (chosen) {
              // The user picked this posting row from Drafts, so resume it even when others wait.
              postingId.current = chosen.id;
              result = { kind: "pending", id: chosen.id, command: chosen.command };
            } else if (postings.length === 1) {
              postingId.current = postings[0].id;
              result = {
                kind: "pending",
                id: postings[0].id,
                command: postings[0].command,
              };
            } else {
              postingId.current = undefined;
              result =
                postings.length === 0
                  ? { kind: "none" }
                  : { kind: "blocked" };
            }
            return { document, write: dirty, result };
          },
        ),
      save: (entry: PendingPosting, draftId?: string) =>
        mutateLocalEntryDocument(lease, subject, (document, now) => {
          const begun = beginPostIn(
            document,
            { draftId: draftId ?? postingId.current, command: entry },
            now,
            Crypto.randomUUID,
          );
          postingId.current = begun.draft.id;
          return {
            document: begun.document,
            write: true,
            result: {
              id: begun.draft.id,
              command: begun.draft.command,
            },
          };
        }),
      clear: () =>
        mutateLocalEntryDocument(lease, subject, (document, now, dirty) => {
          const id = postingId.current;
          postingId.current = undefined;
          if (!id)
            return { document, write: dirty, result: undefined };
          return {
            document: removeIn(document, id),
            write: true,
            result: undefined,
          };
        }),
      abort: () =>
        mutateLocalEntryDocument(lease, subject, (document, now, dirty) => {
          const id = postingId.current;
          postingId.current = undefined;
          if (!id)
            return { document, write: dirty, result: undefined };
          return {
            document: rejectPostIn(document, id),
            write: true,
            result: undefined,
          };
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
