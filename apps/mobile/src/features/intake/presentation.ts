import { formatDateTime, type Translator } from "../../i18n";
import type { IntakeSnapshot } from "./service";

const gapWarnings = {
  overflow: "inbox.intakeWarningGapOverflow",
  storage: "inbox.intakeWarningGapStorage",
  recovery: "inbox.intakeWarningGapRecovery",
} as const;

export function intakeWarning(snapshot: IntakeSnapshot, { t, language }: Translator): string | undefined {
  const status = snapshot.status;
  if (status && "reason" in status && status.reason === "native_api_incompatible") return t("inbox.intakeWarningApk");
  if (!status || !("epoch" in status)) return undefined;
  if (status.gap) return t(gapWarnings[status.gap.reason], { since: formatDateTime(language, status.gap.since) });
  if (status.storageState !== "healthy") return t("inbox.intakeWarningStorage");
  if (snapshot.drain && (snapshot.drain.unresolved || snapshot.drain.conflicts)) return t("inbox.intakeWarningDrain");
  if (status.enabled && (status.access !== "granted" || status.connection !== "connected")) return t("inbox.intakeWarningInterrupted");
  if (status.notices.length) return t("inbox.intakeWarningNotices");
  return undefined;
}

/** A failed intake action or an unreadable intake store, as a sentence. Native codes never reach the screen raw. */
export function intakeActionError(t: Translator["t"], error: unknown): string {
  const code = error !== null && typeof error === "object" && "code" in error ? error.code : null;
  const message = error instanceof Error ? error.message : "";
  if (code === "NATIVE_WIPE_REQUIRED" || message === "NATIVE_WIPE_REQUIRED") return t("inbox.errorWipeRequired");
  if (code === "CAPACITY_EXCEEDED" || message.includes("CAPACITY_EXCEEDED")) return t("inbox.errorCapacity");
  if (code === "CORRUPT_STATE" || message === "CORRUPT_STATE") return t("inbox.errorCorrupt");
  if (message === "Mapping unavailable") return t("inbox.errorMapping");
  if (code === "UNSUPPORTED" || message === "UNSUPPORTED") return t("inbox.errorUnsupported");
  return t("inbox.errorGeneric");
}
