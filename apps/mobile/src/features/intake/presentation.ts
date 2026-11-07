import type { IntakeSnapshot } from "./service";
import type { SourcesStatus } from "../DraftsScreen";

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

/** The intake state in one fact, for the Notification intake row on Candidates. */
export function intakeSourcesStatus(snapshot: IntakeSnapshot): SourcesStatus | undefined {
  const status = snapshot.status;
  if (!status || !("epoch" in status)) return undefined;
  const apps = snapshot.state.activeSelectionIds.length;
  if (status.storageState !== "healthy" || snapshot.wipePending) return { state: { label: "Blocked", tone: "danger", icon: "lock-closed-outline" }, text: "nothing new is read" };
  if (status.access !== "granted") return { state: { label: "Needs access", tone: "warning", icon: "notifications-outline" } };
  if (status.connection !== "connected") return { state: { label: "Not connected", tone: "warning", icon: "pulse-outline" } };
  return { state: { label: "Connected", tone: "positive", icon: "checkmark" }, text: apps ? `reading ${apps === 1 ? "1 app" : `${apps} apps`}` : "not reading any app" };
}
