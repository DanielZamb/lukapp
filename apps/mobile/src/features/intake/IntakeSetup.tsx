import type { FunctionReturnType } from "convex/server";
import { useConvex } from "convex/react";
import * as Crypto from "expo-crypto";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Choice, Header, PrimaryButton, Screen, SecondaryButton, useUi } from "../../ui/core";
import { spacing } from "../../ui/tokens";
import { api } from "../api";
import { useDeviceAccessFailure } from "../../local-auth/accessFailure";
import type { NativeStatus } from "../../../modules/notification-intake";
import { useIntakeService, useIntakeSnapshot } from "./IntakeProvider";
import type { SourceMapping } from "./durableState";
import { IntakeSelectionPicker } from "./IntakeSelectionPicker";
import { ArrivalInspector } from "./ArrivalInspector";
import type { IntakeService } from "./service";
import { ActionBar, AlertLine, Card, CheckRow, FactRow, HeroState, IconTile, Muted, NavRow, NoteCard, SectionHeading, TextButton, type Tone } from "./IntakeParts";
import { appInitial, likelyBankApp, orderSources, productKindLabel, timeZoneCity } from "./appCatalog";

export const INTAKE_DISCLOSURE_VERSION = "notification-disclosure@2";
export const INTAKE_ACKNOWLEDGEMENT = "I've read the notification intake disclosure";
type AccountCatalog =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "ready"; workspace: FunctionReturnType<typeof api.accounting.openWorkspace>;
      profiles: FunctionReturnType<typeof api.accounting.listFinancialAccountProfiles>;
      sources: Awaited<ReturnType<IntakeService["listSources"]>> };
/** Where to go once the disclosure is acknowledged. */
type Then = { kind: "hub" } | { kind: "addApp" } | { kind: "settings" } | { kind: "app"; packageName: string } | { kind: "place"; packageName: string };
type Step =
  | { kind: "hub" }
  | { kind: "disclosure"; then: Then; entry: boolean }
  | { kind: "app"; packageName: string }
  | { kind: "place"; packageName: string; profileId: string | null }
  | { kind: "wipe" }
  | { kind: "inspect" };

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

const NOTICE_LABELS: Record<NativeStatus["notices"][number]["kind"], string> = {
  security: "Security messages skipped", ambiguous: "Unclear alerts", no_amount: "No amount found",
  multiple_amounts: "Several amounts in one alert", overflow: "Too many alerts at once", conflict: "Conflicting captures",
};
const GAP_LABELS: Record<NonNullable<NativeStatus["gap"]>["reason"], string> = {
  overflow: "Too many alerts arrived at once", storage: "Local storage failed", recovery: "Intake was recovering",
};
const when = (time: number) => new Date(time).toLocaleString();
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

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
  const [readFull, setReadFull] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [step, setStep] = useState<Step | null>(null);
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

  async function perform(label: string, action: () => Promise<unknown>, refresh = true): Promise<boolean> {
    if (busy.current) return false;
    busy.current = true;
    setPending(label);
    setError("");
    try {
      await action();
      if (refresh) await service.refresh();
      return true;
    } catch (failure) {
      reportFailure(failure);
      setError(intakeActionError(failure));
      return false;
    } finally {
      busy.current = false;
      setPending(null);
    }
  }

  const active = snapshot.state.mappings.filter((mapping) => snapshot.state.activeSelectionIds.includes(mapping.sourceSelectionId));
  const blocked = pending !== null || !snapshot.loaded || !status || status.storageState !== "healthy" || snapshot.wipePending || snapshot.state.pendingConfigure !== null;
  const canChange = !blocked && status?.access === "granted";
  const canConfigure = canChange && acknowledged;
  const candidates = service.candidates();
  const ready = catalog.kind === "ready" ? catalog : null;
  // First visit with nothing set up opens on the disclosure; it stays until Continue or Back.
  const firstRun = supported && snapshot.loaded && active.length === 0 && !blocked;
  const current: Step = step ?? (firstRun ? { kind: "disclosure", then: { kind: "hub" }, entry: true } : { kind: "hub" });

  const appLabel = (packageName: string) => ready?.sources.find((source) => source.packageName === packageName)?.label ?? packageName;
  const accountName = (mapping: SourceMapping) => {
    if (mapping.workspaceId !== workspaceId) return "another workspace";
    if (!ready) return "…";
    return ready.profiles.find((profile) => profile.id === mapping.financialAccountProfileId)?.name ?? "an unavailable place";
  };
  const accountMissing = (mapping: SourceMapping) => !!ready && mapping.workspaceId === workspaceId
    && !ready.profiles.some((profile) => profile.id === mapping.financialAccountProfileId);
  const appMissing = (mapping: SourceMapping) => !!ready && !ready.sources.some((source) => source.packageName === mapping.packageName);

  function go(then: Then) {
    if (then.kind === "settings") {
      setStep({ kind: "hub" });
      if (!blocked) void perform("Opening Android settings", () => service.openAccessSettings());
    } else if (then.kind === "addApp") { setStep({ kind: "hub" }); setCatalogOpen(true); }
    else if (then.kind === "place") setStep({ kind: "place", packageName: then.packageName, profileId: null });
    else setStep(then);
  }
  /** Changes need the disclosure acknowledged in this visit; route through it first. */
  function withAcknowledgement(then: Then) {
    if (acknowledged) go(then);
    else setStep({ kind: "disclosure", then, entry: false });
  }

  async function configure(next: SourceMapping[]) {
    if (!canConfigure) throw new Error("Configuration blocked");
    const added = next.filter((mapping) => !snapshot.state.mappings.some((old) => old.sourceSelectionId === mapping.sourceSelectionId));
    if (next.length > 16 || snapshot.state.mappings.length + added.length > 64) throw new Error("CAPACITY_EXCEEDED");
    await service.configure(next, INTAKE_DISCLOSURE_VERSION);
  }

  const errors = <>
    {error ? <AlertLine>{error}</AlertLine> : null}
    {snapshot.error && snapshot.error !== "UNSUPPORTED" ? <AlertLine>{intakeActionError(new Error(snapshot.error))}</AlertLine> : null}
  </>;
  const pendingLine = pending ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{pending}…</Text> : null;

  if (current.kind === "inspect") return <ArrivalInspector onBack={() => setStep({ kind: "hub" })} />;

  if (current.kind === "disclosure") {
    const diagnostics = status?.diagnostics?.enabled === true;
    return <Screen footer={<ActionBar>
      <PrimaryButton label="Continue" disabled={!acknowledged || pending !== null} onPress={() => { if (acknowledged) go(current.then); }} />
    </ActionBar>}>
      <Header title="Before you turn it on" eyebrow="NOTIFICATION INTAKE"
        onBack={() => current.entry ? onBack() : setStep(current.then.kind === "app" ? current.then : { kind: "hub" })} />
      <View style={{ gap: spacing.xl }}>
        <FactRow icon="apps-outline" title="Only apps you choose" detail="Lukapp reads nothing else." />
        <FactRow icon="lock-closed-outline" title="Stays on this phone" detail="Encrypted. Suggestions expire 15 days after capture." />
        <FactRow icon="warning-outline" tone="warning" title="Can miss or delay alerts" detail="Every candidate needs your review before it's posted." />
      </View>
      {diagnostics ? <View style={ui.section}>
        <Text style={ui.label}>BETA BUILD</Text>
        <Muted>This beta also keeps the original notification text, encrypted, for up to 24 hours. It's never uploaded.</Muted>
      </View> : null}
      <View style={ui.section}>
        <TextButton label={readFull ? "Hide the full disclosure" : "Read the full disclosure"} expanded={readFull} onPress={() => setReadFull((value) => !value)} />
        {readFull ? <>
          <Text style={ui.body}>Lukapp reads notifications only from apps you select. Normalized suggestions are encrypted on this device and expire 15 days after their first capture. {diagnostics ? "This dev/beta build also encrypts original delivered notification contents, including security messages, in a separate local diagnostic store for up to 24 hours. Nothing from that store is uploaded." : "Raw notification text is not retained."}</Text>
          <Text style={ui.body}>Notifications may be missed or delayed. Reconcile with your accounts. Every Candidate requires review before financial posting.</Text>
          <Text style={ui.muted}>Your saved purchase-alert preference does not grant device access. Acknowledging this disclosure does not enable capture.</Text>
        </> : null}
      </View>
      <Card>
        <CheckRow label="I've read this" detail={status?.access === "granted" ? "Choosing apps is the next step" : "Allowing notification access is the next step"}
          accessibilityLabel={INTAKE_ACKNOWLEDGEMENT} checked={acknowledged} disabled={pending !== null} onPress={() => setAcknowledged((value) => !value)} />
      </Card>
    </Screen>;
  }

  if (current.kind === "wipe") {
    return <Screen footer={<ActionBar>
      {pendingLine}
      <SecondaryButton label="Turn off and wipe" tone="danger" disabled={pending !== null} onPress={() => {
        void perform("Wiping local intake", async () => { await service.disableAndWipe(); setAcknowledged(false); }, false)
          .then(() => setStep({ kind: "hub" }));
      }} />
      <SecondaryButton label="Keep it on" disabled={pending !== null} onPress={() => setStep({ kind: "hub" })} />
    </ActionBar>}>
      <Header title="Turn off and wipe?" eyebrow="NOTIFICATION INTAKE" onBack={pending ? undefined : () => setStep({ kind: "hub" })} />
      {errors}
      <View style={{ gap: spacing.xl }}>
        <FactRow icon="notifications-off-outline" tone="danger" title="Stops reading every app"
          detail="Android notification access is managed separately in system settings." />
        <FactRow icon="trash-outline" tone="danger" title="Deletes what's on this phone"
          detail="Candidates, including saved review edits and pending submission commands, pending captures, app-to-place choices, notices and raw arrival diagnostics." />
        <FactRow icon="receipt-outline" tone="neutral" title="Posted entries stay" detail="Posted ledger entries and manual Drafts are kept." />
      </View>
    </Screen>;
  }

  if (current.kind === "place") {
    const label = appLabel(current.packageName);
    const existing = active.find((mapping) => mapping.packageName === current.packageName);
    const profiles = ready?.profiles.filter((profile) => profile.workspaceId === workspaceId) ?? [];
    const leave = () => setStep(existing ? { kind: "app", packageName: existing.packageName } : { kind: "hub" });
    const save = () => {
      if (!canConfigure || !ready || current.profileId === null) return;
      const profile = ready.profiles.find((row) => row.id === current.profileId && row.workspaceId === workspaceId);
      const currency = ready.workspace.functionalCurrency;
      if (!profile || (currency !== "COP" && currency !== "USD")) { setError("Account or currency unavailable. Refresh accounts before saving."); return; }
      const same = existing && existing.workspaceId === workspaceId && existing.financialAccountProfileId === profile.id && existing.currency === currency && existing.timeZone === ready.workspace.timeZone;
      const mapping: SourceMapping = same ? existing : { sourceSelectionId: Crypto.randomUUID(), packageName: current.packageName,
        workspaceId, financialAccountProfileId: profile.id, currency, timeZone: ready.workspace.timeZone };
      void perform("Saving", () => configure([...active.filter((old) => old.packageName !== mapping.packageName), mapping]))
        .then((saved) => { if (saved || service.getSnapshot().state.pendingConfigure) setStep({ kind: "hub" }); });
    };
    return <Screen footer={<ActionBar>
      {pendingLine}
      <PrimaryButton label={existing ? "Save" : `Start reading ${label}`} trailingIcon="checkmark"
        disabled={!canConfigure || current.profileId === null} pending={pending !== null} onPress={save} />
      {existing ? null : <SecondaryButton label="Choose another app" disabled={pending !== null} onPress={() => { setStep({ kind: "hub" }); setCatalogOpen(true); }} />}
    </ActionBar>}>
      <Header title={`Where do ${label} alerts go?`} eyebrow={existing ? "CHANGE AN APP" : "ADD AN APP"} onBack={pending ? undefined : leave} />
      {errors}
      {ready ? <Muted>{`${ready.workspace.kind} · ${ready.workspace.functionalCurrency} · ${timeZoneCity(ready.workspace.timeZone)}`}</Muted> : null}
      {!ready ? <ActivityIndicator accessibilityLabel="Loading places" />
        : !profiles.length ? <AlertLine>No places in this workspace yet. Add one in My finances, then come back.</AlertLine>
        : <View accessibilityRole="radiogroup" style={{ gap: spacing.sm }}>
          {profiles.map((profile) => <Choice key={profile.id} label={profile.name} detail={productKindLabel(profile.productKind)}
            selected={current.profileId === profile.id} disabled={!canConfigure}
            onPress={() => { if (canConfigure) setStep({ ...current, profileId: profile.id }); }} />)}
        </View>}
      <Muted>{`You can change this later. Other workspaces keep their own place for ${label}.`}</Muted>
    </Screen>;
  }

  // An app removed elsewhere falls back to the hub.
  const mapping = current.kind === "app" ? active.find((row) => row.packageName === current.packageName) : undefined;
  if (mapping) {
    const label = appLabel(mapping.packageName);
    return <Screen footer={<ActionBar>
      {pendingLine}
      <PrimaryButton label="Change where alerts go" disabled={!canChange || !ready}
        onPress={() => withAcknowledgement({ kind: "place", packageName: mapping.packageName })} />
      <SecondaryButton label={`Stop reading ${label}`} tone="danger" disabled={!canChange} onPress={() => {
        if (!acknowledged) { withAcknowledgement({ kind: "app", packageName: mapping.packageName }); return; }
        void perform("Removing app", () => configure(active.filter((row) => row.packageName !== mapping.packageName)))
          .then((removed) => { if (removed || service.getSnapshot().state.pendingConfigure) setStep({ kind: "hub" }); });
      }} />
    </ActionBar>}>
      <Header title={label} eyebrow="APPS YOU READ FROM" onBack={pending ? undefined : () => setStep({ kind: "hub" })} />
      {errors}
      {appMissing(mapping) ? <AlertLine>This app isn't installed anymore. Its alerts can't be read.</AlertLine> : null}
      <Card>
        <NavRow leading={<IconTile icon="wallet-outline" tone={accountMissing(mapping) ? "danger" : "accent"} />} title="Alerts go to"
          status={accountName(mapping)} statusTone={accountMissing(mapping) ? "danger" : undefined}
          accessibilityLabel={`Alerts go to ${accountName(mapping)}`} />
        <NavRow last leading={<IconTile letter={appInitial(label)} tone="accent" />} title="App" status={mapping.packageName}
          accessibilityLabel={`App package ${mapping.packageName}`} />
      </Card>
      {mapping.workspaceId !== workspaceId ? <Muted>Saved in another workspace. Changing it sends its alerts to this workspace instead.</Muted> : null}
      <Muted>Stopping only affects new alerts. Candidates already captured, and the choices they were saved with, stay until they expire or you delete them.</Muted>
    </Screen>;
  }

  // The hub.
  const hero = !status ? null
    : status.storageState !== "healthy" || snapshot.wipePending
      ? { icon: "lock-closed-outline", tone: "danger", title: "Intake is blocked", status: "Nothing new is read until this is fixed." } as const
    : snapshot.state.pendingConfigure
      ? { icon: "hourglass-outline", tone: "warning", title: "Waiting on the last change", status: "Apps can't change until it's retried." } as const
    : status.access !== "granted"
      ? { icon: "notifications-outline", tone: "warning", title: "Allow notification access", status: "Android must let Lukapp read notifications before any app can be added." } as const
    : status.connection !== "connected"
      ? { icon: "pulse-outline", tone: "warning", title: "Listener isn't connected", status: "Alerts may be missed until it reconnects." } as const
    : !active.length
      ? { icon: "notifications-off-outline", tone: "warning", title: "Not reading any app yet", status: "Access and listener are ready" } as const
      : { icon: "pulse-outline", tone: "positive", title: `Reading ${plural(active.length, "app")}`,
          status: status.enabled ? "Working · listener connected" : "Capture not confirmed yet · refresh to check",
          statusTone: (status.enabled ? "positive" : "warning") as Tone } as const;
  const next = !status || blocked && pending === null ? null
    : active.length ? { label: candidates.length ? `Open candidate inbox · ${candidates.length}` : "Open candidate inbox", icon: "arrow-forward" as const, onPress: onInbox }
    // Setting up: acknowledge, then allow access, then add the first app.
    : !acknowledged ? { label: "Review and turn on", icon: "arrow-forward" as const, onPress: () => withAcknowledgement({ kind: "hub" }) }
    : status.access !== "granted" ? { label: "Allow notification access", icon: "arrow-forward" as const, onPress: () => go({ kind: "settings" }) }
    : { label: "Add an app", icon: "add" as const, disabled: !canConfigure || !ready, onPress: () => setCatalogOpen(true) };
  const unsupportedMessage = snapshot.status && !status && "reason" in snapshot.status
    ? snapshot.status.reason === "native_api_incompatible" ? "Update the Android APK to notification intake API v2, then refresh status."
      : snapshot.status.reason === "native_module_missing" ? "Custom Android binary missing. Install a build with the notification intake module, then refresh status."
      : "Notification intake is supported only in the custom Android app."
    : null;

  return <Screen footer={next || pending ? <ActionBar>
    {pendingLine}
    {next ? <PrimaryButton label={next.label} trailingIcon={next.icon} disabled={pending !== null || ("disabled" in next && next.disabled)} onPress={next.onPress} /> : null}
  </ActionBar> : null}>
    <Header title="Notification intake" eyebrow="PURCHASE ALERTS" onBack={pending ? undefined : onBack} />
    {errors}
    {snapshot.wipePending ? <NoteCard tone="danger" icon="trash-outline" title="Wipe is pending"
      body="Intake remains blocked until the saved wipe finishes."
      action={{ label: "Retry pending wipe", disabled: pending !== null, onPress: () => { void perform("Retrying wipe", () => service.retryPendingControl(), false); } }} /> : null}
    {status && status.storageState !== "healthy" && !snapshot.wipePending ? <NoteCard tone="danger" icon="lock-closed-outline"
      title={status.storageState === "key_unavailable" ? "Encryption key unavailable" : "Encrypted storage is corrupt"}
      body="Turn off and wipe to recover. Local candidates will be deleted."
      action={{ label: "Turn off and wipe", danger: true, disabled: pending !== null, onPress: () => setStep({ kind: "wipe" }) }} /> : null}
    {snapshot.state.pendingConfigure && !snapshot.wipePending ? <NoteCard tone="warning" icon="hourglass-outline" title="The last change didn't finish"
      body="Its outcome isn't confirmed. Retry the saved change before changing apps."
      action={{ label: "Retry saved configuration", disabled: pending !== null, onPress: () => {
        if (!acknowledged) { withAcknowledgement({ kind: "hub" }); return; }
        void perform("Retrying configuration", () => service.retryConfigure());
      } }} /> : null}
    {snapshot.drain && (snapshot.drain.unresolved > 0 || snapshot.drain.conflicts > 0)
      ? <AlertLine>{`${snapshot.drain.unresolved} captures have unavailable mappings. ${snapshot.drain.conflicts} captures conflict. Review apps and reconcile missed activity.`}</AlertLine> : null}

    {!snapshot.status ? <ActivityIndicator accessibilityLabel="Checking notification access" />
      : unsupportedMessage ? <HeroState icon="notifications-off-outline" tone="warning" title="Not available here" status={unsupportedMessage} alert />
      : hero ? <HeroState icon={hero.icon} tone={hero.tone} title={hero.title} status={hero.status} statusTone={"statusTone" in hero ? hero.statusTone : undefined} /> : null}

    {status?.gap ? <NoteCard tone="warning" icon="warning-outline" title="Activity may be missing"
      body={`${GAP_LABELS[status.gap.reason]} since ${when(status.gap.since)}. ${plural(status.gap.rejectedCount, "capture")} rejected. Reconcile with your accounts. This doesn't block Month Close.`} /> : null}

    {status ? <View style={ui.section}>
      <SectionHeading title="Apps you read from" meta={ready ? `${plural(ready.sources.length, "app")} on this phone` : undefined} />
      {active.length ? <Card>
        {active.map((mapping, index) => {
          const label = appLabel(mapping.packageName);
          const problem = appMissing(mapping) ? "Not installed" : accountMissing(mapping) ? "Place unavailable" : null;
          const line = `${problem ? `${problem} · ` : ""}To ${accountName(mapping)}`;
          return <NavRow key={mapping.sourceSelectionId} last={index === active.length - 1} leading={<IconTile letter={appInitial(label)} tone="accent" />}
            title={label} status={line} statusTone={problem ? "danger" : undefined} accessibilityLabel={`${label}, ${line}`}
            onPress={() => setStep({ kind: "app", packageName: mapping.packageName })} />;
        })}
      </Card> : <Muted>No apps yet. Choose the bank apps that send your purchase alerts.</Muted>}
      {catalog.kind === "loading" ? <ActivityIndicator accessibilityLabel="Loading installed apps and places" />
        : catalog.kind === "failed" ? <AlertLine>Couldn't load your apps or places. Refresh to try again. No app can be added until then.</AlertLine>
        : !catalog.sources.length ? <Muted>No installed apps can send alerts. Install your bank app, then refresh.</Muted> : null}
      {active.length ? <>
        <SecondaryButton label="Add another app" disabled={!canChange || !ready} onPress={() => withAcknowledgement({ kind: "addApp" })} />
        <Muted>Adding an app doesn't prove an alert was captured. Captured alerts show up in the candidate inbox.</Muted>
      </> : null}
    </View> : null}

    {status ? <View style={ui.section}>
      <SectionHeading title="This phone" />
      <Card>
        <NavRow leading={<IconTile icon="notifications-outline" tone={status.access === "granted" ? "positive" : "warning"} />}
          title="Notification access" status={status.access === "granted" ? "Granted" : "Not granted"}
          statusTone={status.access === "granted" ? "positive" : "warning"} accessibilityLabel={`Notification access, ${status.access === "granted" ? "Granted" : "Not granted"}`} />
        <NavRow last leading={<IconTile icon="pulse-outline" tone={status.connection === "connected" ? "positive" : "warning"} />}
          title="Listener" status={status.connection === "connected" ? "Connected" : status.connection === "disconnected" ? "Disconnected" : "Unknown"}
          statusTone={status.connection === "connected" ? "positive" : "warning"}
          accessibilityLabel={`Listener, ${status.connection === "connected" ? "Connected" : status.connection === "disconnected" ? "Disconnected" : "Unknown"}`} />
      </Card>
      <Muted>{`Checked ${when(status.checkedAt)} · ${status.lastConnectedAt === null ? "no connection seen yet" : `last connected ${when(status.lastConnectedAt)}`}`}</Muted>
      {status.pendingCount > 0 ? <Muted>{`${plural(status.pendingCount, "capture")} waiting to be read.`}</Muted> : null}
      {status.connection !== "connected" ? <SecondaryButton label="Retry listener connection" disabled={blocked || status.access !== "granted"}
        onPress={() => { if (!blocked && status.access === "granted") void perform("Retrying connection", () => service.retryConnection()); }} /> : null}
      <SecondaryButton label="Android notification settings" disabled={blocked} onPress={() => withAcknowledgement({ kind: "settings" })} />
    </View> : null}

    <SecondaryButton label="Refresh status" disabled={pending !== null || snapshot.wipePending}
      onPress={() => { setRevision((value) => value + 1); void perform("Refreshing status", () => service.refresh(), false); }} />

    {status?.notices.length ? <View style={ui.section}>
      <SectionHeading title="Skipped alerts" meta="No notification text is kept for these. Missed activity may need reconciling." />
      {status.notices.map((notice) => <View key={notice.id} style={{ gap: spacing.sm }}>
        <FactRow icon="eye-off-outline" tone="neutral" title={NOTICE_LABELS[notice.kind]}
          detail={`${plural(notice.count, "alert")} · ${when(notice.firstAt)} to ${when(notice.lastAt)}`} />
        <SecondaryButton label="Dismiss" accessibilityLabel={`Dismiss ${notice.kind} notice`} disabled={pending !== null || snapshot.wipePending}
          onPress={() => { void perform("Dismissing notice", () => service.dismissNotices([notice.id])); }} />
      </View>)}
    </View> : null}

    <Card>
      <NavRow leading={<IconTile icon="document-text-outline" />} title="Candidate inbox" last={!status?.diagnostics?.enabled}
        status={candidates.length ? `${candidates.length} waiting · across saved workspaces` : "Nothing waiting"}
        accessibilityLabel={`Candidate inbox, ${candidates.length ? `${candidates.length} waiting` : "nothing waiting"}`} disabled={pending !== null} onPress={onInbox} />
      {status?.diagnostics?.enabled ? <NavRow last leading={<IconTile icon="pulse-outline" />} title="Beta diagnostics"
        status={`${status.diagnostics.recordCount} records · ${status.diagnostics.overflowCount} overflow · ${status.diagnostics.errorCount} errors · ${status.diagnostics.state}`}
        accessibilityLabel="Inspect raw arrivals on this device" disabled={blocked} onPress={() => setStep({ kind: "inspect" })} /> : null}
    </Card>

    {ready ? <Muted>{`${ready.workspace.kind} · ${ready.workspace.functionalCurrency} · ${timeZoneCity(ready.workspace.timeZone)}`}</Muted> : null}
    {supported && !snapshot.wipePending ? <SecondaryButton label="Turn off and wipe" tone="danger" disabled={pending !== null} onPress={() => setStep({ kind: "wipe" })} /> : null}

    {catalogOpen && ready ? <IntakeSelectionPicker title="Add an app" eyebrow={`${ready.sources.length} ON THIS PHONE`} searchLabel="Search apps"
      options={orderSources(ready.sources).map((source) => ({ id: source.packageName, label: source.label, detail: source.packageName,
        initial: appInitial(source.label), likely: likelyBankApp(source) }))}
      disabled={!canConfigure} empty="No installed apps can send alerts. Install your bank app, then refresh."
      onClose={() => setCatalogOpen(false)}
      onSelect={(packageName) => { setCatalogOpen(false); setStep({ kind: "place", packageName, profileId: null }); }} /> : null}
  </Screen>;
}
