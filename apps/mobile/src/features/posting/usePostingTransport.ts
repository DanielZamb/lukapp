import { useAction } from "convex/react";
import * as Crypto from "expo-crypto";
import { useMemo } from "react";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import {
  runLocalInputWrite,
  useLocalInputLease,
} from "../../local-auth/localInput";
import { api } from "../api";
import {
  clearPendingExpense,
  loadPendingPosting,
  savePendingPosting,
} from "../pendingExpense";
import type { PendingPosting } from "./pendingPostingSchema";
import type { PostingTransport } from "./usePostingEditor";

export function usePostingTransport(subject: string): PostingTransport {
  const lease = useLocalInputLease();
  const reportFailure = useDeviceAccessFailure();
  const expense = useAction(api.accounting.recordCashExpense);
  const income = useAction(api.accounting.recordCashIncome);
  const transfer = useAction(api.accounting.recordAccountTransfer);
  const opening = useAction(api.accounting.recordOpeningPosition);
  const setup = useAction(api.accounting.setupFinancialAccountProfile);
  return useMemo(
    () => ({
      load: () => loadPendingPosting(subject),
      save: (entry: PendingPosting) =>
        runLocalInputWrite(lease, () => savePendingPosting(subject, entry)),
      clear: () =>
        runLocalInputWrite(lease, () => clearPendingExpense(subject)),
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
