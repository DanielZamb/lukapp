import type { IntakeSnapshot } from "./service";

export function intakeWarning(snapshot: IntakeSnapshot): string | undefined {
  const status = snapshot.status;
  if (status && "reason" in status && status.reason === "native_api_incompatible") return "Update the Android APK to review notification captures with this app version.";
  if (!status || !("epoch" in status)) return undefined;
  if (status.gap) return `Notification capture has a ${status.gap.reason} gap since ${new Date(status.gap.since).toLocaleString()}. Reconcile missed activity with your accounts.`;
  if (status.storageState !== "healthy") return "Notification intake storage needs recovery. Reconcile missed activity with your accounts.";
  if (snapshot.drain && (snapshot.drain.unresolved || snapshot.drain.conflicts)) return "Some notification captures need source review. Reconcile missed activity with your accounts.";
  if (status.enabled && (status.access !== "granted" || status.connection !== "connected")) return "Notification capture may be interrupted. Check Sources and reconcile missed activity with your accounts.";
  if (status.notices.length) return "Notification capture notices need review. Reconcile missed activity with your accounts.";
  return undefined;
}
