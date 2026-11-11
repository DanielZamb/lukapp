import { useFormState, withFields } from "../features/amount/useAmountState";
import { useClerk } from "@clerk/expo";
import { useAction, useQuery_experimental } from "convex/react";
import Constants from "expo-constants";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ConvexError } from "convex/values";
import { ActivityIndicator, Platform, Text } from "react-native";
import { api } from "../features/api";
import { useT } from "../i18n";
import { useLocalInstallId } from "../local-auth/installation";
import { useLocalEntryInteraction } from "../local-auth/interaction";
import { useDeviceAccessFailure } from "../local-auth/accessFailure";
import { Header, PrimaryButton, Screen, SecondaryButton, useUi } from "../ui/core";
import { admissionFailure, type AdmissionFailure } from "./failure";
import { useLocalEnrollment } from "../local-auth/enrollment";
import { OccupiedDeviceStep } from "./OccupiedDeviceStep";
import { NamedDeviceStep } from "./NamedDeviceStep";
import { DeviceActivity } from "./DeviceActivity";
import { IntakeDeviceAdmission } from "../features/intake/admission";
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
  const translator = useT();
  const { t } = translator;
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
  const intakeAdmission = useRef(false);
  intakeAdmission.current = status.status === "success" && status.data.status === "registered" && enrollment.ready;
  const intakeAdmitted = useCallback(() => intakeAdmission.current, []);
  useLayoutEffect(() => {
    if (status.status === "error") report(status.error);
    else if (status.status === "success" && status.data.status === "revoked")
      report(new ConvexError({ code: "device_revoked", wipeLocalInput: true, ...(status.data.movedTo ? { movedTo: status.data.movedTo } : {}) }));
  }, [status, report]);
  /** The names typed for this phone and whether one was sent; registering reads them at the press. */
  const [form, setForm, readForm] = useFormState(() => ({
    name: "", replacementName: t(platform === "ios" ? "access.defaultNameIos" : "access.defaultNameAndroid"), submitted: false,
  }));
  const { name, replacementName, submitted } = form;
  const setName = (value: string) => setForm((now) => withFields(now, { name: value }));
  const setReplacementName = (value: string) => setForm((now) => withFields(now, { replacementName: value }));
  const setSubmitted = (value: boolean) => setForm((now) => withFields(now, { submitted: value }));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<AdmissionFailure | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const named = (value: string) => value.trim().length > 0 && value.trim().length <= 80;
  const validName = named(name);
  const existingLabel = status.status === "success" && status.data.status === "unregistered"
    ? status.data.existingLabel : undefined;

  const occupier = status.status === "success" && status.data.status === "unregistered"
    ? status.data.occupier : undefined;

  async function registerNamed(label: string) {
    if (submitting.current || readForm().submitted || !nativePlatform || !appVersion || !validBuild ||
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
      if (mounted.current) setFailure(admissionFailure(error, translator));
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
    const now = readForm();
    if (!occupier || submitting.current || now.submitted || !nativePlatform || !appVersion || !validBuild || !named(now.replacementName)) return;
    submitting.current = true;
    setBusy(true);
    setFailure(null);
    try {
      if (!await enrollment.ensure() || !mounted.current) return;
      await replace({ installId, label: now.replacementName.trim(), platform: nativePlatform, appVersion,
        expectedOccupierId: occupier.deviceId, expectedSessionId: occupier.sessionId });
      if (mounted.current) setSubmitted(true);
    } catch (error) {
      if (report(error)) return;
      if (mounted.current) setFailure(admissionFailure(error, translator));
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
      if (mounted.current) setFailure({ kind: "denied", message: t("access.signOutFailed") });
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  const denied = status.status === "error" ? admissionFailure(status.error, translator)
    : status.status === "success" && status.data.status === "revoked"
      ? { kind: "denied", message: status.data.movedTo ? t("access.movedTo", { device: status.data.movedTo }) : t("access.revoked") } satisfies AdmissionFailure
      : failure?.kind === "denied" ? failure : null;
  const closed = denied ?? (existingLabel && failure && !(occupier && failure.kind === "occupied") ? failure : null);
  if (closed || !validBuild) return (
    <Screen>
      <Header title={t("access.deviceUnavailableTitle")} />
      <Text accessibilityRole="alert" style={ui.error}>
        {closed?.message ?? t("access.buildUnsupported")}
      </Text>
      {closed && closed.kind !== "denied" && <PrimaryButton label={t("common.retry")} onPress={retry} />}
      <SecondaryButton label={busy ? t("access.signingOut") : t("access.signOut")} disabled={busy} onPress={() => void leave()} />
    </Screen>
  );
  if (status.status === "success" && status.data.status === "registered" && enrollment.ready)
    return <IntakeDeviceAdmission.Provider value={intakeAdmitted}><DeviceActivity><ProtectedReadBoundary>{children}</ProtectedReadBoundary></DeviceActivity></IntakeDeviceAdmission.Provider>;
  if (occupier && nativePlatform && !submitted && (!existingLabel || failure?.kind === "occupied")) return (
    <OccupiedDeviceStep platform={nativePlatform} label={occupier.label} lastSeenAt={occupier.lastSeenAt}
      name={replacementName} busy={busy} error={failure?.message ?? ""}
      onNameChange={(value) => { interaction(); setReplacementName(value); }}
      onUse={() => void move()} onKeep={() => void leave()} />
  );
  if (status.status === "pending" || submitted || !!existingLabel ||
      (status.status === "success" && status.data.status === "registered")) return (
    <Screen>
      <ActivityIndicator />
      <Text style={ui.body}>{t("access.confirmingDevice")}</Text>
      <SecondaryButton label={t("access.checkAgain")} onPress={retry} />
      <SecondaryButton label={busy ? t("access.signingOut") : t("access.signOut")} disabled={busy} onPress={() => void leave()} />
    </Screen>
  );
  return (
    <NamedDeviceStep
      name={name}
      busy={busy}
      canSubmit={validName}
      error={failure?.message ?? ""}
      onNameChange={(value) => { interaction(); setName(value); }}
      onSubmit={() => { const typed = readForm().name; if (named(typed)) void registerNamed(typed.trim()); }}
      onSignOut={() => void leave()}
    />
  );
}
