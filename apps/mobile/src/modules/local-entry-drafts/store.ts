import { z } from "zod";
import type { Custody } from "../../access/native";
import { validAccountingDate } from "./money";

const request = z.object({
  workspaceId: z.string().min(1), financialAccountProfileId: z.string().min(1),
  amount: z.object({ currency: z.string().length(3), minorUnits: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }),
  accountingDate: z.string().refine(validAccountingDate),
  description: z.string().trim().min(1), idempotencyKey: z.string().min(1),
});
export const expenseDraft = z.discriminatedUnion("stage", [
  z.object({ kind: z.literal("expense"), id: z.string(), workspaceId: z.string(), stage: z.literal("editing"),
    amount: z.string(), date: z.string(), profileId: z.string(), description: z.string() }),
  z.object({ kind: z.literal("expense"), id: z.string(), workspaceId: z.string(), stage: z.literal("confirmed"), request }),
]);
export type ExpenseDraft = z.infer<typeof expenseDraft>;
export type LocalInputCustody = Pick<Custody, "inputList" | "inputPut" | "inputDelete">;
export function draftStore(native: LocalInputCustody, generation: number, workspaceId: string) {
  return {
    list: async () => (await native.inputList("draft", generation)).map(value => {
      const draft = expenseDraft.parse(JSON.parse(value));
      if (draft.workspaceId !== workspaceId || (draft.stage === "confirmed" &&
        (draft.request.workspaceId !== workspaceId || draft.id !== draft.request.idempotencyKey))) throw new Error("Draft ownership mismatch");
      return draft;
    }),
    put: async (draft: ExpenseDraft) => {
      const parsed = expenseDraft.parse(draft);
      if (parsed.workspaceId !== workspaceId || (parsed.stage === "confirmed" &&
        (parsed.request.workspaceId !== workspaceId || parsed.request.idempotencyKey !== parsed.id))) throw new Error("Draft ownership mismatch");
      const existing = (await native.inputList("draft", generation))
        .map(value => expenseDraft.parse(JSON.parse(value))).find(value => value.id === parsed.id);
      if (existing?.stage === "confirmed" && JSON.stringify(existing) !== JSON.stringify(parsed)) throw new Error("Confirmed request cannot change");
      await native.inputPut("draft", parsed.id, JSON.stringify(parsed), generation);
    },
    remove: (id: string) => native.inputDelete("draft", id, generation),
  };
}
