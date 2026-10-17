import { ConvexError } from "convex/values";
import { BudgetError } from "../src/budget/policy";

export async function runBudget<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); }
  catch (error) {
    if (error instanceof BudgetError) throw new ConvexError({ kind: "budget", code: error.code });
    throw error;
  }
}
