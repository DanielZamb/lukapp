import { ConvexError } from "convex/values";
import { expect, test } from "vitest";
import { isWipeBearingError } from "./policy";

test("wipe-bearing authorization errors keep wipeLocalInput", () => {
  expect(
    isWipeBearingError(
      new ConvexError({ code: "device_revoked", wipeLocalInput: true }),
    ),
  ).toBe(true);
  expect(
    isWipeBearingError(new ConvexError({ code: "device_revoked" })),
  ).toBe(false);
  expect(isWipeBearingError(new Error("device_revoked"))).toBe(false);
});
