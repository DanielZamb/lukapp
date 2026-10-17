import { ConvexError } from "convex/values";
import { z } from "zod";

const securityError = z.object({ code: z.string() });
export type AdmissionFailure = {
  kind: "retry" | "denied";
  message: string;
};

export function admissionFailure(error: unknown): AdmissionFailure {
  const parsed = securityError.safeParse(
    error instanceof ConvexError ? error.data : undefined,
  );
  switch (parsed.success ? parsed.data.code : undefined) {
    case "device_slot_occupied":
      return {
        kind: "retry",
        message:
          "A device already occupies this slot. Explicitly revoke that device before trying again. No device was replaced.",
      };
    case "device_revoked":
      return { kind: "denied", message: "This device’s access was revoked." };
    case "membership_required":
    case "permission_denied":
    case "owner_required":
      return { kind: "denied", message: "This account no longer has access." };
    case "authentication_required":
    case "session_required":
    case "session_inactive":
    case "session_owner_mismatch":
      return {
        kind: "denied",
        message: "This session cannot be admitted. Sign out and sign in again.",
      };
    case "device_conflict":
      return {
        kind: "denied",
        message:
          "This session is registered to another installation. Sign out and sign in again.",
      };
    case "device_metadata_invalid":
      return {
        kind: "denied",
        message: "This build could not identify the installation. Check the app build before trying again.",
      };
    default:
      return {
        kind: "retry",
        message: "Device access could not be confirmed. Check your connection and try again.",
      };
  }
}
