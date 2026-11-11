import { ConvexError } from "convex/values";
import { z } from "zod";
import type { Translator } from "../../../../src/i18n";

const securityError = z.object({
  code: z.string(),
  occupiedLabel: z.string().trim().min(1).max(80).optional(),
});
export type AdmissionFailure = {
  kind: "retry" | "denied" | "occupied";
  message: string;
};

export function admissionFailure(error: unknown, { t }: Translator): AdmissionFailure {
  const parsed = securityError.safeParse(
    error instanceof ConvexError ? error.data : undefined,
  );
  const code = parsed.success ? parsed.data.code : undefined;
  const occupiedLabel = parsed.success ? parsed.data.occupiedLabel : undefined;
  switch (code) {
    case "device_occupier_changed":
      return { kind: "retry", message: t("access.occupierChanged") };
    case "device_slot_occupied":
      return {
        kind: "occupied",
        message: occupiedLabel
          ? t("access.slotOccupiedBy", { device: occupiedLabel })
          : t("access.slotOccupied"),
      };
    case "device_revoked":
      return { kind: "denied", message: t("access.revoked") };
    case "membership_required":
    case "permission_denied":
    case "owner_required":
      return { kind: "denied", message: t("access.noAccess") };
    case "authentication_required":
    case "session_required":
    case "session_inactive":
    case "session_owner_mismatch":
      return { kind: "denied", message: t("access.sessionNotAdmitted") };
    case "device_conflict":
      return { kind: "denied", message: t("access.sessionOtherInstall") };
    case "device_metadata_invalid":
      return { kind: "denied", message: t("access.metadataInvalid") };
    default:
      return { kind: "retry", message: t("access.deviceUnconfirmed") };
  }
}
