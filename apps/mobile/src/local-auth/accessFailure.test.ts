import { ConvexError } from "convex/values";
import { expect, test } from "vitest";
import { requiresLocalWipe } from "./accessFailure";

test("only explicit authenticated server wipe signals trigger destructive cleanup", () => {
  for (const code of ["session_inactive", "device_revoked", "membership_required"])
    expect(requiresLocalWipe(new ConvexError({ code, wipeLocalInput: true }))).toBe(true);
  for (const error of [
    new Error("Disconnected"),
    { data: { code: "device_revoked", wipeLocalInput: true } },
    new ConvexError({ code: "provider_unavailable" }),
    new ConvexError({ code: "permission_denied" }),
    new ConvexError({ code: "session_required" }),
    new ConvexError({ code: "device_revoked", wipeLocalInput: false }),
  ]) expect(requiresLocalWipe(error)).toBe(false);
});
