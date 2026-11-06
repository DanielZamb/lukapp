import { ConvexError } from "convex/values";
import { expect, test } from "vitest";
import { intakeConfirmOutcome } from "./outcome";

test("a payload conflict without a kind is still a definite failure", () => {
  expect(intakeConfirmOutcome(new ConvexError({ code: "idempotency_key_conflict" })))
    .toBe("fail");
});
