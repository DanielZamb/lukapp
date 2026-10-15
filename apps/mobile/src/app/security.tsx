import { useEffect, useState, useSyncExternalStore } from "react";
import { router } from "expo-router";
import { useRuntime } from "../access/RuntimeProvider";
import { Copy, Header, PrimaryButton, Screen, SecondaryButton } from "../ui";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../../convex/_generated/api";

export default function Security() {
  const { controller } = useRuntime();
  const cleanup = useSyncExternalStore(controller.subscribe, controller.getProviderCleanup);
  const [devices, setDevices] = useState<FunctionReturnType<typeof api.devices.list> | null>(null);
  const revocations = useSyncExternalStore(controller.subscribe, controller.getRevocations);
  useEffect(() => {
    if (!controller.securityFresh()) { void controller.admit(true); return; }
    let stopped = false;
    void controller.execute((_, rpc) => rpc.query(api.devices.list, {})).then(value => { if (!stopped) setDevices(value); }).catch(() => {});
    return () => { stopped = true; };
  }, [controller]);
  return <Screen><Header title="Security and devices" back={{ label: "Back to user", onPress: () => router.back() }} />
    <Copy title="Your named devices" detail="Each security action needs fresh biometrics. Revoke an old binding before replacing it." />
    {cleanup?.state.kind === "pending" && <>
      <Copy title="Provider sign-out is pending" detail="Old device access is revoked. The last online check still reported pending provider cleanup." />
      <SecondaryButton label="Check provider cleanup" onPress={() => { void controller.refreshProviderCleanup().catch(() => {}); }} />
    </>}
    {devices?.map(device => <SecondaryButton key={device.id} label={device.name + (device.state.kind === "revoked" ? " · Revoked" : " · Revoke")}
      disabled={device.state.kind === "revoked"} onPress={() => {
        void controller.revokeDevice(device.id).catch(() => {});
      }} />)}
    {revocations.map(({ record, refreshed }) => <Copy key={record.deviceId} title="Device sign-out"
      detail={record.outcome.kind === "response-unknown" ? "The request result is unknown. Retry explicitly to check the same device." :
        (refreshed ? "Online result: " : "Last observed result: ") + (record.outcome.result.kind === "pending" ? "device access revoked; provider sign-out pending." : "provider sign-out completed.")} />)}
    {revocations.filter(item => item.record.outcome.kind === "response-unknown").map(({ record }) =>
      <SecondaryButton key={record.deviceId} label="Retry unresolved device sign-out" onPress={() => { void controller.revokeDevice(record.deviceId).catch(() => {}); }} />)}
    {revocations.length > 0 && <SecondaryButton label="Refresh device sign-out results" onPress={() => { void controller.refreshProviderCleanup().catch(() => {}); }} />}
    <Copy title="Recover device access" detail="Recovery ends old device sessions. You'll sign out and make a new full Google sign-in after the server starts recovery." />
    <PrimaryButton label="Begin recovery and sign out" onPress={() => { void controller.beginRecovery().catch(() => {}); }} />
  </Screen>;
}
