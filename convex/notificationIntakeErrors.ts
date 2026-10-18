import { ConvexError } from "convex/values";
import { IntakeError } from "../src/notificationIntake/policy";

export async function runIntake<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof IntakeError)
      throw new ConvexError({ kind: "intake", code: error.code, message: error.code });
    throw error;
  }
}
