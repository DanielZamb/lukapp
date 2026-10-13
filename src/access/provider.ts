import { api } from "../../convex/_generated/api";
import type { FunctionArgs, FunctionReturnType } from "convex/server";

export const providerFunctions = {
  checkSession: api.clerkProvider.checkSession,
  beginRecovery: api.clerkProvider.beginRecovery,
  completeRecovery: api.clerkProvider.completeRecovery,
  workStatus: api.providerWork.status,
  developmentReadiness: api.authConnection.developmentReadiness,
};
export type ProviderSessionStatus = FunctionReturnType<typeof providerFunctions.checkSession>;
export type RecoveryIntent = FunctionReturnType<typeof providerFunctions.beginRecovery>;
export type CompleteRecovery = FunctionArgs<typeof providerFunctions.completeRecovery>;
export type ProviderWorkStatus = FunctionReturnType<typeof providerFunctions.workStatus>;
