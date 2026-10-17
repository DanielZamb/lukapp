import { ConvexError } from "convex/values";
import { AccountingError } from "../src/accounting/errors";

export async function run<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AccountingError) {
      throw new ConvexError({
        kind: "accounting",
        code: error.code,
        message: error.message,
      });
    }
    throw error;
  }
}
