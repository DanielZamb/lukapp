import { useClerk } from "@clerk/expo";
import { useAction, useQuery_experimental } from "convex/react";
import Constants from "expo-constants";
import React, { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ConvexError } from "convex/values";
import { ActivityIndicator, Platform, Text } from "react-native";
import { api } from "../features/api";
import { useLocalInstallId } from "../local-auth/installation";
import { useLocalEntryInteraction } from "../local-auth/interaction";
import { useDeviceAccessFailure } from "../local-auth/accessFailure";
import { Header, PrimaryButton, Screen, SecondaryButton, useUi } from "../ui/core";
import { admissionFailure, type AdmissionFailure } from "./failure";
import { useLocalEnrollment } from "../local-auth/enrollment";
import { OccupiedDeviceStep } from "./OccupiedDeviceStep";
import { NamedDeviceStep } from "./NamedDeviceStep";
import { ProtectedReadBoundary } from "./ProtectedReadBoundary";

export function DeviceAdmissionGate({ children }: { children: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  return (
    <AdmissionAttempt key={attempt} retry={() => setAttempt((n) => n + 1)}>
      {children}
    </AdmissionAttempt>
  );
}

function AdmissionAttempt({ children, retry }: { children: ReactNode; retry: () => void }) {
  const ui = useUi();
  const installId = useLocalInstallId();
  const interaction = useLocalEntryInteraction();
  const report = useDeviceAccessFailure();
  const { signOut } = useClerk();
  const register = useAction(api.deviceAccess.register);
  const replace = useAction(api.deviceAccess.replace);
  const enrollment = useLocalEnrollment();
  const platform = Platform.OS;
  const appVersion = Constants.nativeAppVersion ?? Constants.expoConfig?.version;
  const nativePlatform = platform === "ios" || platform === "android" ? platform : null;
  const validBuild = !!nativePlatform && !!appVersion && appVersion.length <= 40;
  const status = useQuery_experimental({
    query: api.deviceAccess.status,
    args: nativePlatform ? { installId, platform: nativePlatform } : { installId },
  });
  useLayoutEffect(() => {
    if (status.status === "error") report(status.error);
    else if (status.status === "success" && status.data.status === "revoked")
      report(new ConvexError({ code: "device_revoked", wipeLocalInput: true, ...(status.data.movedTo ? { movedTo: status.data.movedTo } : {}) }));
  }, [status, report]);
  const [name, setName] = useState("");
  const [replacementName, setReplacementName] = useState(platform === "ios" ? "My iPhone" : "My Android phone");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [failure, setFailure] = useState<AdmissionFailure | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const validName = name.trim().length > 0 && name.trim().length <= 80;
  const existingLabel = status.status === "success" && status.data.status === "unregistered"
    ? status.data.existingLabel : undefined;

  const occupier = status.status === "success" && status.data.status === "unregistered"
    ? status.data.occupier : undefined;

  async function registerNamed(label: string) {
    if (submitting.current || submitted || !nativePlatform || !appVersion || !validBuild ||
      status.status !== "success" || status.data.status !== "unregistered") return;
    submitting.current = true;
    setBusy(true);
    setFailure(null);
    try {
      if (!await enrollment.ensure() || !mounted.current) return;
      await register({ installId, label, platform: nativePlatform, appVersion });
      if (mounted.current) setSubmitted(true);
    } catch (error) {
      if (report(error)) return;
      if (mounted.current) setFailure(admissionFailure(error));
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (!existingLabel) return;
    void registerNamed(existingLabel);
  }, [existingLabel]);
  async function move() {
    if (!occupier || submitting.current || submitted || !nativePlatform || !appVersion || !validBuild ||
        !replacementName.trim() || replacementName.trim().length > 80) return;
    submitting.current = true;
    setBusy(true);
    setFailure(null);
    try {
      if (!await enrollment.ensure() || !mounted.current) return;
      await replace({ installId, label: replacementName.trim(), platform: nativePlatform, appVersion,
        expectedOccupierId: occupier.deviceId, expectedSessionId: occupier.sessionId });
      if (mounted.current) setSubmitted(true);
    } catch (error) {
      if (report(error)) return;
      if (mounted.current) setFailure(admissionFailure(error));
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (status.status === "success" && status.data.status === "registered" && !enrollment.ready)
      void enrollment.ensure();
  }, [status, enrollment.ready, enrollment.ensure]);
  async function leave() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await signOut();
    } catch {
      if (mounted.current) setFailure({ kind: "denied", message: "Sign-out could not finish. Try signing out again." });
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const denied = status.status === "error" ? admissionFailure(status.error)
    : status.status === "success" && status.data.status === "revoked"
      ? { kind: "denied", message: status.data.movedTo ? `Access moved to ${status.data.movedTo}` : "This device’s access was revoked." } satisfies AdmissionFailure
      : failure?.kind === "denied" ? failure : null;
  const closed = denied ?? (existingLabel && failure ? failure : null);
  if (closed || !validBuild) return (
    <Screen>
      <Header title="Device access unavailable" />
      <Text accessibilityRole="alert" style={ui.error}>
        {closed?.message ?? "This build does not support native device registration."}
      </Text>
      {closed?.kind === "retry" && <PrimaryButton label="Try again" onPress={retry} />}
      <SecondaryButton label={busy ? "Signing out…" : "Sign out"} disabled={busy} onPress={() => void leave()} />
    </Screen>
  );
  if (status.status === "success" && status.data.status === "registered" && enrollment.ready)
    return <ProtectedReadBoundary>{children}</ProtectedReadBoundary>;
  if (occupier && nativePlatform && !submitted) return (
    <OccupiedDeviceStep platform={nativePlatform} label={occupier.label} lastSeenAt={occupier.lastSeenAt}
      name={replacementName} busy={busy} error={failure?.message ?? ""}
      onNameChange={(value) => { interaction(); setReplacementName(value); }}
      onUse={() => void move()} onKeep={() => void leave()} />
  );
  if (status.status === "pending" || submitted || !!existingLabel ||
      (status.status === "success" && status.data.status === "registered")) return (
    <Screen>
      <ActivityIndicator />
      <Text style={ui.body}>Confirming device access…</Text>
      <SecondaryButton label="Check again" onPress={retry} />
      <SecondaryButton label={busy ? "Signing out…" : "Sign out"} disabled={busy} onPress={() => void leave()} />
    </Screen>
  );
  return (
    <NamedDeviceStep
      name={name}
      busy={busy}
      canSubmit={validName}
      error={failure?.message ?? ""}
      onNameChange={(value) => { interaction(); setName(value); }}
      onSubmit={() => { if (validName) void registerNamed(name.trim()); }}
      onSignOut={() => void leave()}
    />
  );
}
