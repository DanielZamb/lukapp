import type { FunctionReturnType } from "convex/server";
import type { api } from "../api";

export type HistoryRow = FunctionReturnType<typeof api.accounting.postedHistory>["page"][number];
export type EntryDetail = FunctionReturnType<typeof api.accounting.postedEntry>;
export type EntryPlace = Pick<FunctionReturnType<typeof api.accounting.listFinancialAccountProfiles>[number], "id" | "emoji" | "productKind">;
