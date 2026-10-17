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
import { Header, PrimaryButton, Screen, SecondaryButton, ui } from "../ui/core";
import { admissionFailure, type AdmissionFailure } from "./failure";
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
  const installId = useLocalInstallId();
  const interaction = useLocalEntryInteraction();
  const report = useDeviceAccessFailure();
  const { signOut } = useClerk();
  const register = useAction(api.deviceAccess.register);
  const status = useQuery_experimental({ query: api.deviceAccess.status, args: {} });
  useLayoutEffect(() => {
    if (status.status === "error") report(status.error);
    else if (status.status === "success" && status.data.status === "revoked")
      report(new ConvexError({ code: "device_revoked", wipeLocalInput: true }));
  }, [status, report]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [failure, setFailure] = useState<AdmissionFailure | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const platform = Platform.OS;
  const appVersion = Constants.nativeAppVersion ?? Constants.expoConfig?.version;
  const validBuild = (platform === "ios" || platform === "android") &&
    !!appVersion && appVersion.length <= 40;
  const validName = name.trim().length > 0 && name.trim().length <= 80;

  async function submit() {
    if (submitting.current || submitted || !validName || !validBuild ||
      status.status !== "success" || status.data.status !== "unregistered") return;
    submitting.current = true;
    setBusy(true);
    setFailure(null);
    try {
      await register({ installId, label: name.trim(), platform, appVersion });
      if (mounted.current) setSubmitted(true);
    } catch (error) {
      if (report(error)) return;
      if (mounted.current) setFailure(admissionFailure(error));
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }
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
      ? { kind: "denied", message: "This device’s access was revoked." } satisfies AdmissionFailure
      : failure?.kind === "denied" ? failure : null;
  if (denied || !validBuild) return (
    <Screen>
      <Header title="Device access unavailable" />
      <Text accessibilityRole="alert" style={ui.error}>
        {denied?.message ?? "This build does not support native device registration."}
      </Text>
      {denied?.kind === "retry" && <PrimaryButton label="Try again" onPress={retry} />}
      <SecondaryButton label={busy ? "Signing out…" : "Sign out"} disabled={busy} onPress={() => void leave()} />
    </Screen>
  );
  if (status.status === "success" && status.data.status === "registered")
    return <ProtectedReadBoundary>{children}</ProtectedReadBoundary>;
  if (status.status === "pending" || submitted) return (
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
      onSubmit={() => void submit()}
      onSignOut={() => void leave()}
    />
  );
}
