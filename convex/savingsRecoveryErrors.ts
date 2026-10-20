import { ConvexError } from "convex/values";
import { RecoveryError } from "../src/savingsRecovery/policy";

export async function runRecovery<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) {
    if (error instanceof RecoveryError) throw new ConvexError({ kind: "recovery", code: error.code });
    throw error;
  }
}
