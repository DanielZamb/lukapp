import { ConvexError } from "convex/values";
import { expect, test } from "vitest";
import { requiresLocalWipe, movedAccessLabel } from "./accessFailure";

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

test("a replacement label is display-only and malformed copy never suppresses required cleanup", () => {
  const error = new ConvexError({ code: "device_revoked", wipeLocalInput: true, movedTo: "New Android" });
  expect(requiresLocalWipe(error)).toBe(true);
  expect(movedAccessLabel(error)).toBe("New Android");
  for (const movedTo of [42, "", "x".repeat(81)]) {
    const invalid = new ConvexError({ code: "device_revoked", wipeLocalInput: true, movedTo });
    expect(requiresLocalWipe(invalid)).toBe(true);
    expect(movedAccessLabel(invalid)).toBeUndefined();
  }
  expect(movedAccessLabel(new ConvexError({ code: "membership_required", wipeLocalInput: true, movedTo: "New Android" }))).toBeUndefined();
});
