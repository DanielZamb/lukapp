import type { FunctionReturnType } from "convex/server";
import { useConvex } from "convex/react";
import * as Crypto from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Choice, Header, ListGroup, ListRow, PrimaryButton, Screen, SecondaryButton, useUi } from "../../ui/core";
import { touchTarget } from "../../ui/tokens";
import { api } from "../api";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import { useIntakeService, useIntakeSnapshot } from "./IntakeProvider";
import type { SourceMapping } from "./durableState";
import { IntakeSelectionPicker } from "./IntakeSelectionPicker";
import { ArrivalInspector } from "./ArrivalInspector";
import type { IntakeService } from "./service";

export const INTAKE_DISCLOSURE_VERSION = "notification-disclosure@2";
type AccountCatalog =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "ready"; workspace: FunctionReturnType<typeof api.accounting.openWorkspace>;
      profiles: FunctionReturnType<typeof api.accounting.listFinancialAccountProfiles>;
      sources: Awaited<ReturnType<IntakeService["listSources"]>> };
type SourceEditor = { kind: "closed" } | { kind: "mapping"; packageName: string; profileId: string | null };

export function intakeActionError(error: unknown): string {
  const code = error !== null && typeof error === "object" && "code" in error ? error.code : null;
  const message = error instanceof Error ? error.message : "";
  if (code === "NATIVE_WIPE_REQUIRED" || message === "NATIVE_WIPE_REQUIRED")
    return "NATIVE_WIPE_REQUIRED. Install the custom Android binary to finish wiping local intake. Intake remains blocked.";
  if (code === "CAPACITY_EXCEEDED" || message.includes("CAPACITY_EXCEEDED"))
    return "Intake capacity reached. At most 16 apps can be active and 64 mapping versions can be retained. Existing Candidates are preserved.";
  if (code === "CORRUPT_STATE" || message === "CORRUPT_STATE")
    return "Encrypted intake storage cannot be read. Disable and wipe intake to recover. This deletes local Candidates.";
  if (message === "Mapping unavailable")
    return "An account or workspace is unavailable or permission changed. Refresh accounts and review every configured source. The change is not confirmed.";
  return "Could not finish this action. The change is not confirmed. Refresh status and retry any pending operation.";
}

export function IntakeSetup({ workspaceId, onBack, onInbox }: {
  workspaceId: string; onBack(): void; onInbox(): void;
}) {
  const ui = useUi();
  const service = useIntakeService();
  const snapshot = useIntakeSnapshot();
  const convex = useConvex();
  const reportFailure = useDeviceAccessFailure();
  const [catalog, setCatalog] = useState<AccountCatalog>({ kind: "loading" });
  const [revision, setRevision] = useState(0);
  const [acknowledged, setAcknowledged] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [editor, setEditor] = useState<SourceEditor>({ kind: "closed" });
  const [inspecting, setInspecting] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const busy = useRef(false);
  const [error, setError] = useState("");
  const status = snapshot.status && "epoch" in snapshot.status ? snapshot.status : null;
  const supported = status !== null;

  useEffect(() => {
    if (!supported) return;
    let current = true;
    setCatalog({ kind: "loading" });
    void Promise.all([
      convex.query(api.accounting.openWorkspace, { workspaceId }),
      convex.query(api.accounting.listFinancialAccountProfiles, { workspaceId }),
      service.listSources(),
    ]).then(([workspace, profiles, sources]) => {
      if (current) setCatalog({ kind: "ready", workspace, profiles, sources });
    }).catch((failure: unknown) => {
      if (!current) return;
      reportFailure(failure);
      setCatalog({ kind: "failed" });
    });
    return () => { current = false; };
  }, [convex, service, workspaceId, supported, revision, reportFailure]);

  async function perform(label: string, action: () => Promise<unknown>, refresh = true) {
    if (busy.current) return;
    busy.current = true;
    setPending(label);
    setError("");
    try {
      await action();
      if (refresh) await service.refresh();
    } catch (failure) {
      reportFailure(failure);
      setError(intakeActionError(failure));
    } finally {
      busy.current = false;
      setPending(null);
    }
  }

  const active = snapshot.state.mappings.filter((mapping) => snapshot.state.activeSelectionIds.includes(mapping.sourceSelectionId));
  const blocked = pending !== null || !snapshot.loaded || !status || status.storageState !== "healthy" || snapshot.wipePending || snapshot.state.pendingConfigure !== null;
  const canConfigure = !blocked && acknowledged && status?.access === "granted";
  const candidates = service.candidates();

  async function configure(next: SourceMapping[]) {
    if (!canConfigure) throw new Error("Configuration blocked");
    const added = next.filter((mapping) => !snapshot.state.mappings.some((old) => old.sourceSelectionId === mapping.sourceSelectionId));
    if (next.length > 16 || snapshot.state.mappings.length + added.length > 64) throw new Error("CAPACITY_EXCEEDED");
    await service.configure(next, INTAKE_DISCLOSURE_VERSION);
    setEditor({ kind: "closed" });
    setCatalogOpen(false);
  }

  if (inspecting) return <ArrivalInspector onBack={() => setInspecting(false)} />;
  return (
    <Screen>
      <Header title="Notification intake" eyebrow="PRIVATE DEVICE SETUP" onBack={pending ? undefined : onBack} />
      <View style={ui.section}>
        <Text accessibilityRole="header" style={ui.sectionHeading}>Review before enabling</Text>
        <Text style={ui.body}>Lukapp reads notifications only from apps you select. Normalized suggestions are encrypted on this device and expire 15 days after their first capture. {status?.diagnostics?.enabled ? "This dev/beta build also encrypts original delivered notification contents, including security messages, in a separate local diagnostic store for up to 24 hours. Nothing from that store is uploaded." : "Raw notification text is not retained."}</Text>
        <Text style={ui.body}>Notifications may be missed or delayed. Reconcile with your accounts. Every Candidate requires review before financial posting.</Text>
        <Text style={ui.muted}>Your saved purchase-alert preference does not grant device access. Acknowledging this disclosure does not enable capture.</Text>
        <Pressable accessibilityRole="checkbox" accessibilityLabel="I acknowledge the notification intake disclosure"
          accessibilityState={{ checked: acknowledged, disabled: pending !== null }} disabled={pending !== null}
          style={{ minHeight: touchTarget, justifyContent: "center" }} onPress={() => setAcknowledged((value) => !value)}>
          <Text style={ui.body}>{acknowledged ? "✓ " : "□ "}I acknowledge the notification intake disclosure</Text>
        </Pressable>
      </View>
      {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}
      {snapshot.error && snapshot.error !== "UNSUPPORTED" ? <Text accessibilityRole="alert" style={ui.error}>{intakeActionError(new Error(snapshot.error))}</Text> : null}
      {!snapshot.status ? <ActivityIndicator accessibilityLabel="Observing notification access" /> : !status ? (
        <Text accessibilityRole="alert" style={ui.error}>{"reason" in snapshot.status && (snapshot.status.reason === "native_module_missing" || snapshot.status.reason === "native_api_incompatible")
          ? snapshot.status.reason === "native_api_incompatible" ? "Update the Android APK to notification intake API v2, then refresh status." : "Custom Android binary missing. Install a build with the notification intake module, then refresh status."
          : "Notification intake is supported only in the custom Android app."}</Text>
      ) : (
        <>
          {status.diagnostics?.enabled ? <View style={ui.section}>
            <Text style={ui.sectionHeading}>Dev/beta arrival diagnostics</Text>
            <Text style={ui.body}>{status.diagnostics.recordCount} records · {status.diagnostics.overflowCount} overflow · {status.diagnostics.errorCount} errors · {status.diagnostics.state}</Text>
            <SecondaryButton label="Inspect raw arrivals on this device" disabled={blocked} onPress={() => setInspecting(true)} />
          </View> : null}
          <ListGroup>
            <ListRow title="Notification access" value={status.access === "granted" ? "Granted" : "Not granted"} />
            <ListRow title="Listener connection" value={status.connection === "connected" ? "Connected" : status.connection === "disconnected" ? "Disconnected" : "Unknown"} />
            <ListRow title="Observed access and health" detail={new Date(status.checkedAt).toLocaleString()} />
            <ListRow title="Last listener connection" detail={status.lastConnectedAt === null ? "No connection observed" : new Date(status.lastConnectedAt).toLocaleString()} />
          </ListGroup>
          {status.access !== "granted" ? <Text style={ui.body}>Grant Android notification access, then return here to select apps and accounts.</Text> : null}
          {status.storageState !== "healthy" ? <Text accessibilityRole="alert" style={ui.error}>{status.storageState === "key_unavailable"
            ? "Encryption key unavailable. Intake is blocked. Disable and wipe to recover; local Candidates will be deleted."
            : "Encrypted storage is corrupt. Intake is blocked. Disable and wipe to recover; local Candidates will be deleted."}</Text> : null}
          <SecondaryButton label="Open Android notification access settings" disabled={!acknowledged || blocked}
            onPress={() => { if (acknowledged && !blocked) void perform("Opening settings", () => service.openAccessSettings()); }} />
          {status.connection !== "connected" ? <>
            <Text style={ui.body}>Access and listener connection are separate. If access is granted, retry the listener connection. Notifications may have been missed.</Text>
            <SecondaryButton label="Retry listener connection" disabled={blocked || status.access !== "granted"}
              onPress={() => { if (!blocked && status.access === "granted") void perform("Retrying connection", () => service.retryConnection()); }} />
          </> : null}
          {status.gap ? <View accessibilityLiveRegion="polite" style={ui.section}>
            <Text style={ui.sectionHeading}>Activity may be missing</Text>
            <Text style={ui.body}>{status.gap.reason} gap observed since {new Date(status.gap.since).toLocaleString()}. Rejected captures: {status.gap.rejectedCount}. Reconcile with your financial accounts. This warning does not block Month Close.</Text>
          </View> : null}
          {status.notices.length ? <View style={ui.section}>
            <Text style={ui.sectionHeading}>Capture notices</Text>
            <Text style={ui.muted}>These notices contain no notification text. Missed activity may need reconciliation.</Text>
            {status.notices.map((notice) => <View key={notice.id}>
              <Text style={ui.body}>{notice.kind} · {notice.count} · {new Date(notice.firstAt).toLocaleString()} to {new Date(notice.lastAt).toLocaleString()}</Text>
              <SecondaryButton label={`Dismiss ${notice.kind} notice`} disabled={pending !== null || snapshot.wipePending}
                onPress={() => { void perform("Dismissing notice", () => service.dismissNotices([notice.id])); }} />
            </View>)}
          </View> : null}
          {snapshot.drain && (snapshot.drain.unresolved > 0 || snapshot.drain.conflicts > 0) ?
            <Text accessibilityRole="alert" style={ui.error}>{snapshot.drain.unresolved} captures have unavailable mappings. {snapshot.drain.conflicts} captures conflict. Review sources and reconcile missed activity.</Text> : null}
        </>
      )}
      <SecondaryButton label="Refresh status and accounts" disabled={pending !== null || snapshot.wipePending}
        onPress={() => { setRevision((value) => value + 1); void perform("Refreshing status", () => service.refresh(), false); }} />
      {snapshot.state.pendingConfigure ? <>
        <Text accessibilityRole="alert" style={ui.error}>Source configuration is pending. Its outcome is not confirmed. Retry the saved configuration before changing sources.</Text>
        <PrimaryButton label="Retry saved configuration" disabled={pending !== null || !acknowledged || snapshot.wipePending}
          onPress={() => { if (acknowledged) void perform("Retrying configuration", () => service.retryConfigure()); }} />
      </> : null}
      {pending ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{pending}</Text> : null}
      <View style={ui.section}>
        <Text accessibilityRole="header" style={ui.sectionHeading}>Configured sources</Text>
        <Text style={ui.body}>{active.length === 0 ? "No sources configured. Capture is not set up." : `${active.length} sources configured. ${status?.enabled ? "Capture enabled" : "Capture not observed as enabled"}. Configuration alone does not prove a notification was captured.`}</Text>
        {active.map((mapping) => <View key={mapping.sourceSelectionId} style={ui.section}>
          <Text style={ui.body}>{catalog.kind === "ready" ? catalog.sources.find((source) => source.packageName === mapping.packageName)?.label ?? mapping.packageName : mapping.packageName}</Text>
          <Text style={ui.muted}>{mapping.packageName}</Text>
          <Text style={ui.body}>Workspace {mapping.workspaceId} · Account {catalog.kind === "ready" && mapping.workspaceId === workspaceId
            ? catalog.profiles.find((profile) => profile.id === mapping.financialAccountProfileId)?.name ?? `Unavailable (${mapping.financialAccountProfileId})`
            : mapping.financialAccountProfileId} · {mapping.currency} · {mapping.timeZone}</Text>
          {catalog.kind === "ready" && !catalog.sources.some((source) => source.packageName === mapping.packageName) ? <Text style={ui.error}>App unavailable in the installed catalog.</Text> : null}
          <SecondaryButton label={`Change account for ${mapping.packageName}`} disabled={!canConfigure || catalog.kind !== "ready"}
            onPress={() => { if (canConfigure) setEditor({ kind: "mapping", packageName: mapping.packageName, profileId: null }); }} />
          <SecondaryButton label={`Remove ${mapping.packageName}`} disabled={!canConfigure}
            onPress={() => { if (canConfigure) void perform("Removing source", () => configure(active.filter((source) => source.packageName !== mapping.packageName))); }} />
        </View>)}
        <Text style={ui.muted}>Removing a source stops future intake from that app. Previously captured Candidates and their saved mappings remain until expiry or explicit deletion.</Text>
      </View>
      {supported ? <View style={ui.section}>
        <Text accessibilityRole="header" style={ui.sectionHeading}>Choose an installed app and account</Text>
        {catalog.kind === "loading" ? <ActivityIndicator accessibilityLabel="Loading installed apps and admitted accounts" /> : catalog.kind === "failed" ?
          <Text accessibilityRole="alert" style={ui.error}>Could not load installed apps or current account permissions. Refresh status and accounts to try again. No new source can be saved.</Text> : <>
            <Text style={ui.body}>Current workspace {catalog.workspace.kind} · {catalog.workspace.id} · {catalog.workspace.functionalCurrency} · {catalog.workspace.timeZone}</Text>
            <Text style={ui.muted}>Choose an account explicitly. Sources saved in other workspaces keep their saved identity unless you change or remove that app here.</Text>
            {!catalog.profiles.length ? <Text style={ui.error}>No admitted Financial Account Profiles are available in this workspace.</Text> : null}
            {!catalog.sources.length ? <Text style={ui.muted}>No installed notification source apps are available. Install your source app, then refresh.</Text> : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Add source" accessibilityState={{ expanded: catalogOpen, disabled: !canConfigure }}
              accessibilityHint="Open a searchable list of installed apps" disabled={!canConfigure} style={{ minHeight: touchTarget, justifyContent: "center" }}
              onPress={() => { if (canConfigure) { setEditor({ kind: "closed" }); setCatalogOpen((value) => !value); } }}>
              <Text style={ui.body}>Add source · {catalog.sources.length} installed apps</Text>
            </Pressable>
            {catalogOpen ? <IntakeSelectionPicker title="Choose an app" searchLabel="Search apps by name or package"
              options={catalog.sources.map((source) => ({ id: source.packageName, label: `Select ${source.label}`, detail: source.packageName }))}
              selected={null} disabled={!canConfigure || !catalog.profiles.length} empty="No installed notification source apps are available. Refresh the catalog."
              onClose={() => setCatalogOpen(false)} onSelect={(packageName) => { setCatalogOpen(false); setEditor({ kind: "mapping", packageName, profileId: null }); }} /> : null}
            {editor.kind === "mapping" ? <IntakeSelectionPicker
              title={`Account for ${catalog.sources.find((source) => source.packageName === editor.packageName)?.label ?? editor.packageName}`}
              searchLabel="Search accounts" options={catalog.profiles.filter((profile) => profile.workspaceId === workspaceId).map((profile) => ({
                id: profile.id, label: `${profile.name} · ${catalog.workspace.kind} · ${catalog.workspace.functionalCurrency}`, detail: `Workspace ${workspaceId} · Account ${profile.id}` }))}
              selected={editor.profileId} disabled={!canConfigure} empty="No admitted accounts are available in this workspace."
              onSelect={(profileId) => { if (canConfigure) setEditor({ ...editor, profileId }); }}
              onClose={() => { if (!pending) setEditor({ kind: "closed" }); }}
              footer={<View style={ui.section}>
                <Text style={ui.body}>Selected app {editor.packageName}</Text>
                <Text style={ui.body}>Selected account {catalog.profiles.find((profile) => profile.id === editor.profileId)?.name ?? "Choose an account"}</Text>
              <PrimaryButton label="Save source and account" disabled={!canConfigure || editor.profileId === null} onPress={() => {
                if (!canConfigure || editor.profileId === null) return;
                const profile = catalog.profiles.find((profile) => profile.id === editor.profileId && profile.workspaceId === workspaceId);
                const currency = catalog.workspace.functionalCurrency;
                if (!profile || (currency !== "COP" && currency !== "USD")) { setError("Account or currency unavailable. Refresh accounts before saving."); return; }
                const existing = active.find((mapping) => mapping.packageName === editor.packageName);
                const same = existing && existing.workspaceId === workspaceId && existing.financialAccountProfileId === profile.id && existing.currency === currency && existing.timeZone === catalog.workspace.timeZone;
                const mapping: SourceMapping = same ? existing : { sourceSelectionId: Crypto.randomUUID(), packageName: editor.packageName,
                  workspaceId, financialAccountProfileId: profile.id, currency, timeZone: catalog.workspace.timeZone };
                void perform("Saving source", () => configure([...active.filter((old) => old.packageName !== mapping.packageName), mapping]));
              }} />
                <SecondaryButton label="Choose another app" disabled={pending !== null} onPress={() => { setEditor({ kind: "closed" }); setCatalogOpen(true); }} />
                <SecondaryButton label="Cancel account selection" disabled={pending !== null} onPress={() => setEditor({ kind: "closed" })} />
              </View>} /> : null}
          </>}
      </View> : null}
      <View style={ui.section}>
        <Text style={ui.sectionHeading}>Capture and Candidates</Text>
        <Text style={ui.body}>{candidates.length ? `${candidates.length} local Candidates await review across saved workspaces.` : "No Candidates observed. Notifications from enabled sources become Candidates here. Access or configuration alone does not confirm capture."}</Text>
        {status ? <Text style={ui.muted}>{status.pendingCount} native captures pending at the observed health check.</Text> : null}
        <PrimaryButton label="Open Candidate inbox" onPress={onInbox} disabled={pending !== null} />
      </View>
      <View style={ui.section}>
        <Text accessibilityRole="header" style={ui.sectionHeading}>Disable and delete local intake</Text>
        {snapshot.wipePending ? <>
          <Text accessibilityRole="alert" style={ui.error}>Wipe is pending. Intake remains blocked until the saved wipe finishes.</Text>
          <PrimaryButton label="Retry pending wipe" disabled={pending !== null}
            onPress={() => { void perform("Retrying wipe", () => service.retryPendingControl(), false); }} />
        </> : confirmWipe ? <>
          <Text style={ui.body}>Disable intake and delete all local notification Candidates, including saved review edits and pending submission commands, pending captures, source/account mappings, replay markers, intake consent configuration, capture notices, and all raw arrival diagnostics. Posted ledger entries and manual Drafts are kept. Android notification access is managed separately in system settings.</Text>
          <SecondaryButton label="Disable intake and delete local Candidates" tone="danger" disabled={pending !== null}
            onPress={() => { void perform("Wiping local intake", async () => { await service.disableAndWipe(); setConfirmWipe(false); setAcknowledged(false); }, false); }} />
          <SecondaryButton label="Keep intake" disabled={pending !== null} onPress={() => setConfirmWipe(false)} />
        </> : <SecondaryButton label="Disable and wipe intake…" tone="danger" disabled={pending !== null} onPress={() => setConfirmWipe(true)} />}
      </View>
    </Screen>
  );
}
