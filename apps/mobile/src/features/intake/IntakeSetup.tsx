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
import { intakeActionError } from "./presentation";
import { formatDateTime, useT, type MessageKey } from "../../i18n";

export const INTAKE_DISCLOSURE_VERSION = "notification-disclosure@3";
/** The acknowledgement checkbox's English accessibility label, which tests use to find it. */
export const INTAKE_ACKNOWLEDGEMENT = "I've read the notification intake disclosure";
type AccountCatalog =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "ready"; workspace: FunctionReturnType<typeof api.accounting.openWorkspace>;
      profiles: FunctionReturnType<typeof api.accounting.listFinancialAccountProfiles>;
      sources: Awaited<ReturnType<IntakeService["listSources"]>> };
/** Where to go once the disclosure is acknowledged. */
type Then = { kind: "hub" } | { kind: "addApp" } | { kind: "settings" } | { kind: "reconsent" } | { kind: "app"; packageName: string } | { kind: "place"; packageName: string };
type Step =
  | { kind: "hub" }
  | { kind: "disclosure"; then: Then; entry: boolean }
  | { kind: "app"; packageName: string }
  | { kind: "place"; packageName: string; profileId: string | null }
  | { kind: "wipe" }
  | { kind: "inspect" };

const NOTICE_LABELS: Record<NativeStatus["notices"][number]["kind"], MessageKey> = {
  security: "inbox.noticeSecurity", ambiguous: "inbox.noticeAmbiguous", no_amount: "inbox.noticeNoAmount",
  multiple_amounts: "inbox.noticeMultiple", overflow: "inbox.noticeOverflow", conflict: "inbox.noticeConflict",
};
const GAP_LABELS: Record<NonNullable<NativeStatus["gap"]>["reason"], MessageKey> = {
  overflow: "inbox.gapOverflow", storage: "inbox.gapStorage", recovery: "inbox.gapRecovery",
};

export function IntakeSetup({ workspaceId, onBack, onPrototype }: {
  workspaceId: string; onBack(): void; onPrototype?(): void;
}) {
  const { t, tn, language } = useT();
  const when = (time: number) => formatDateTime(language, time);
  const emailWarning = t("inbox.emailWarning");
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
  const [pending, setPending] = useState<MessageKey | null>(null);
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

  async function perform(label: MessageKey, action: () => Promise<unknown>, refresh = true): Promise<boolean> {
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
      setError(intakeActionError(t, failure));
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
  const ready = catalog.kind === "ready" ? catalog : null;
  // First visit with nothing set up opens on the disclosure; it stays until Continue or Back.
  const firstRun = supported && snapshot.loaded && active.length === 0 && !blocked;
  const current: Step = step ?? (firstRun ? { kind: "disclosure", then: { kind: "hub" }, entry: true } : { kind: "hub" });

  const appLabel = (packageName: string) => ready?.sources.find((source) => source.packageName === packageName)?.label ?? packageName;
  const accountName = (mapping: SourceMapping) => {
    if (mapping.workspaceId !== workspaceId) return t("inbox.anotherWorkspace");
    if (!ready) return "…";
    return ready.profiles.find((profile) => profile.id === mapping.financialAccountProfileId)?.name ?? t("inbox.unavailablePlace");
  };
  const accountMissing = (mapping: SourceMapping) => !!ready && mapping.workspaceId === workspaceId
    && !ready.profiles.some((profile) => profile.id === mapping.financialAccountProfileId);
  const appMissing = (mapping: SourceMapping) => !!ready && !ready.sources.some((source) => source.packageName === mapping.packageName);

  function go(then: Then) {
    if (then.kind === "settings") {
      setStep({ kind: "hub" });
      if (!blocked) void perform("inbox.pendingOpeningSettings", () => service.openAccessSettings());
    } else if (then.kind === "addApp") { setStep({ kind: "hub" }); setCatalogOpen(true); }
    else if (then.kind === "reconsent") {
      // Same apps, same mappings, saved again under the current disclosure.
      setStep({ kind: "hub" });
      void perform("inbox.pendingSaving", () => configure(active));
    }
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
    {snapshot.error && snapshot.error !== "UNSUPPORTED" ? <AlertLine>{intakeActionError(t, new Error(snapshot.error))}</AlertLine> : null}
  </>;
  const pendingLine = pending ? <Text accessibilityLiveRegion="polite" style={ui.muted}>{t("inbox.pendingLine", { action: t(pending) })}</Text> : null;

  if (current.kind === "inspect") return <ArrivalInspector onBack={() => setStep({ kind: "hub" })} />;

  if (current.kind === "disclosure") {
    const diagnostics = status?.diagnostics?.enabled === true;
    return <Screen footer={<ActionBar>
      <PrimaryButton label={t("inbox.disclosureContinue")} disabled={!acknowledged || pending !== null} onPress={() => { if (acknowledged) go(current.then); }} />
    </ActionBar>}>
      <Header title={t("inbox.disclosureTitle")} eyebrow={t("inbox.eyebrow")}
        onBack={() => current.entry ? onBack() : setStep(current.then.kind === "app" ? current.then : { kind: "hub" })} />
      <View style={{ gap: spacing.xl }}>
        <FactRow icon="apps-outline" title={t("inbox.disclosureOnlyApps")} detail={t("inbox.disclosureOnlyAppsDetail")} />
        <FactRow icon="lock-closed-outline" title={t("inbox.disclosurePhone")} detail={t("inbox.disclosurePhoneDetail")} />
        <FactRow icon="warning-outline" tone="warning" title={t("inbox.disclosureMiss")} detail={t("inbox.disclosureMissDetail")} />
        <FactRow icon="mail-outline" tone="warning" title={t("inbox.disclosureEmail")} detail={emailWarning} />
      </View>
      {diagnostics ? <View style={ui.section}>
        <Text style={ui.label}>{t("inbox.disclosureBeta")}</Text>
        <Muted>{t("inbox.disclosureBetaBody")}</Muted>
      </View> : null}
      <View style={ui.section}>
        <TextButton label={readFull ? t("inbox.disclosureHide") : t("inbox.disclosureRead")} expanded={readFull} onPress={() => setReadFull((value) => !value)} />
        {readFull ? <>
          <Text style={ui.body}>{t(diagnostics ? "inbox.disclosureFullDiagnostics" : "inbox.disclosureFull")}</Text>
          <Text style={ui.body}>{t("inbox.disclosureReconcile")}</Text>
          <Text style={ui.muted}>{t("inbox.disclosurePreference")}</Text>
        </> : null}
      </View>
      <Card>
        <CheckRow label={t("inbox.disclosureCheck")} detail={status?.access === "granted" ? t("inbox.disclosureNextApps") : t("inbox.disclosureNextAccess")}
          accessibilityLabel={t("inbox.acknowledgement")} checked={acknowledged} disabled={pending !== null} onPress={() => setAcknowledged((value) => !value)} />
      </Card>
    </Screen>;
  }

  if (current.kind === "wipe") {
    return <Screen footer={<ActionBar>
      {pendingLine}
      <SecondaryButton label={t("inbox.wipeAction")} tone="danger" disabled={pending !== null} onPress={() => {
        void perform("inbox.pendingWiping", async () => { await service.disableAndWipe(); setAcknowledged(false); }, false)
          .then(() => setStep({ kind: "hub" }));
      }} />
      <SecondaryButton label={t("inbox.wipeKeep")} disabled={pending !== null} onPress={() => setStep({ kind: "hub" })} />
    </ActionBar>}>
      <Header title={t("inbox.wipeTitle")} eyebrow={t("inbox.eyebrow")} onBack={pending ? undefined : () => setStep({ kind: "hub" })} />
      {errors}
      <View style={{ gap: spacing.xl }}>
        <FactRow icon="notifications-off-outline" tone="danger" title={t("inbox.wipeStops")}
          detail={t("inbox.wipeStopsDetail")} />
        <FactRow icon="trash-outline" tone="danger" title={t("inbox.wipeDeletes")}
          detail={t("inbox.wipeDeletesDetail")} />
        <FactRow icon="receipt-outline" tone="neutral" title={t("inbox.wipeKeeps")} detail={t("inbox.wipeKeepsDetail")} />
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
      if (!profile || (currency !== "COP" && currency !== "USD")) { setError(t("inbox.placeUnavailable")); return; }
      const same = existing && existing.workspaceId === workspaceId && existing.financialAccountProfileId === profile.id && existing.currency === currency;
      const mapping: SourceMapping = same ? existing : { sourceSelectionId: Crypto.randomUUID(), packageName: current.packageName,
        workspaceId, financialAccountProfileId: profile.id, currency, timeZone: ready.workspace.timeZone };
      void perform("inbox.pendingSaving", () => configure([...active.filter((old) => old.packageName !== mapping.packageName), mapping]))
        .then((saved) => { if (saved || service.getSnapshot().state.pendingConfigure) setStep({ kind: "hub" }); });
    };
    return <Screen footer={<ActionBar>
      {pendingLine}
      <PrimaryButton label={existing ? t("inbox.placeSave") : t("inbox.placeStart", { app: label })} trailingIcon="checkmark"
        disabled={!canConfigure || current.profileId === null} pending={pending !== null} onPress={save} />
      {existing ? null : <SecondaryButton label={t("inbox.placeAnotherApp")} disabled={pending !== null} onPress={() => { setStep({ kind: "hub" }); setCatalogOpen(true); }} />}
    </ActionBar>}>
      <Header title={t("inbox.placeTitle", { app: label })} eyebrow={existing ? t("inbox.placeEyebrowChange") : t("inbox.placeEyebrowAdd")} onBack={pending ? undefined : leave} />
      {errors}
      {ready ? <Muted>{t("inbox.workspaceLine", { currency: ready.workspace.functionalCurrency, city: timeZoneCity(ready.workspace.timeZone) })}</Muted> : null}
      {!ready ? <ActivityIndicator accessibilityLabel={t("inbox.placeLoadingA11y")} />
        : !profiles.length ? <AlertLine>{t("inbox.placeNone")}</AlertLine>
        : <View accessibilityRole="radiogroup" style={{ gap: spacing.sm }}>
          {profiles.map((profile) => <Choice key={profile.id} label={profile.name} detail={productKindLabel(t, profile.productKind)}
            selected={current.profileId === profile.id} disabled={!canConfigure}
            onPress={() => { if (canConfigure) setStep({ ...current, profileId: profile.id }); }} />)}
        </View>}
      <Muted>{t("inbox.placeLater", { app: label })}</Muted>
    </Screen>;
  }

  // An app removed elsewhere falls back to the hub.
  const mapping = current.kind === "app" ? active.find((row) => row.packageName === current.packageName) : undefined;
  if (mapping) {
    const label = appLabel(mapping.packageName);
    return <Screen footer={<ActionBar>
      {pendingLine}
      <PrimaryButton label={t("inbox.appChangePlace")} disabled={!canChange || !ready}
        onPress={() => withAcknowledgement({ kind: "place", packageName: mapping.packageName })} />
      <SecondaryButton label={t("inbox.appStop", { app: label })} tone="danger" disabled={!canChange} onPress={() => {
        if (!acknowledged) { withAcknowledgement({ kind: "app", packageName: mapping.packageName }); return; }
        void perform("inbox.pendingRemoving", () => configure(active.filter((row) => row.packageName !== mapping.packageName)))
          .then((removed) => { if (removed || service.getSnapshot().state.pendingConfigure) setStep({ kind: "hub" }); });
      }} />
    </ActionBar>}>
      <Header title={label} eyebrow={t("inbox.appEyebrow")} onBack={pending ? undefined : () => setStep({ kind: "hub" })} />
      {errors}
      {appMissing(mapping) ? <AlertLine>{t("inbox.appMissing")}</AlertLine> : null}
      <Card>
        <NavRow leading={<IconTile icon="wallet-outline" tone={accountMissing(mapping) ? "danger" : "accent"} />} title={t("inbox.appAlertsGoTo")}
          status={accountName(mapping)} statusTone={accountMissing(mapping) ? "danger" : undefined}
          accessibilityLabel={t("inbox.appAlertsGoToA11y", { place: accountName(mapping) })} />
        <NavRow last leading={<IconTile letter={appInitial(label)} tone="accent" />} title={t("inbox.appPackage")} status={mapping.packageName}
          accessibilityLabel={t("inbox.appPackageA11y", { package: mapping.packageName })} />
      </Card>
      {mapping.workspaceId !== workspaceId ? <Muted>{t("inbox.appOtherWorkspace")}</Muted> : null}
      <Muted>{t("inbox.appStopNote")}</Muted>
    </Screen>;
  }

  // The hub.
  const hero = !status ? null
    : status.storageState !== "healthy" || snapshot.wipePending
      ? { icon: "lock-closed-outline", tone: "danger", title: t("inbox.heroBlocked"), status: t("inbox.heroBlockedStatus") } as const
    : snapshot.state.pendingConfigure
      ? { icon: "hourglass-outline", tone: "warning", title: t("inbox.heroWaiting"), status: t("inbox.heroWaitingStatus") } as const
    : status.access !== "granted"
      ? { icon: "notifications-outline", tone: "warning", title: t("inbox.heroAccess"), status: t("inbox.heroAccessStatus") } as const
    : status.connection !== "connected"
      ? { icon: "pulse-outline", tone: "warning", title: t("inbox.heroListener"), status: t("inbox.heroListenerStatus") } as const
    : !active.length
      ? { icon: "notifications-off-outline", tone: "warning", title: t("inbox.heroNoApps"), status: t("inbox.heroNoAppsStatus") } as const
      : { icon: "pulse-outline", tone: "positive", title: tn("inbox.heroReading", active.length),
          status: status.enabled ? t("inbox.heroWorking") : t("inbox.heroUnconfirmed"),
          statusTone: (status.enabled ? "positive" : "warning") as Tone } as const;
  const next = !status || blocked && pending === null || active.length > 0 ? null
    // Setting up: acknowledge, then allow access, then add the first app.
    : !acknowledged ? { label: t("inbox.nextReview"), icon: "arrow-forward" as const, onPress: () => withAcknowledgement({ kind: "hub" }) }
    : status.access !== "granted" ? { label: t("inbox.nextAccess"), icon: "arrow-forward" as const, onPress: () => go({ kind: "settings" }) }
    : { label: t("inbox.nextAddApp"), icon: "add" as const, disabled: !canConfigure || !ready, onPress: () => setCatalogOpen(true) };
  const accessStatus = status?.access === "granted" ? t("inbox.accessGranted") : t("inbox.accessNotGranted");
  const listenerStatus = status?.connection === "connected" ? t("inbox.listenerConnected")
    : status?.connection === "disconnected" ? t("inbox.listenerDisconnected") : t("inbox.listenerUnknown");
  const unsupportedMessage = snapshot.status && !status && "reason" in snapshot.status
    ? snapshot.status.reason === "native_api_incompatible" ? t("inbox.unsupportedApk")
      : snapshot.status.reason === "native_module_missing" ? t("inbox.unsupportedModule")
      : t("inbox.errorUnsupported")
    : null;

  return <Screen footer={next || pending ? <ActionBar>
    {pendingLine}
    {next ? <PrimaryButton label={next.label} trailingIcon={next.icon} disabled={pending !== null || ("disabled" in next && next.disabled)} onPress={next.onPress} /> : null}
  </ActionBar> : null}>
    <Header title={t("inbox.setupTitle")} eyebrow={t("inbox.setupEyebrow")} onBack={pending ? undefined : onBack} />
    {errors}
    {snapshot.wipePending ? <NoteCard tone="danger" icon="trash-outline" title={t("inbox.wipePendingTitle")}
      body={t("inbox.wipePendingBody")}
      action={{ label: t("inbox.wipePendingRetry"), disabled: pending !== null, onPress: () => { void perform("inbox.pendingRetryingWipe", () => service.retryPendingControl(), false); } }} /> : null}
    {status && status.storageState !== "healthy" && !snapshot.wipePending ? <NoteCard tone="danger" icon="lock-closed-outline"
      title={status.storageState === "key_unavailable" ? t("inbox.storageKeyUnavailable") : t("inbox.storageCorrupt")}
      body={t("inbox.storageBody")}
      action={{ label: t("inbox.wipeAction"), danger: true, disabled: pending !== null, onPress: () => setStep({ kind: "wipe" }) }} /> : null}
    {snapshot.state.pendingConfigure && !snapshot.wipePending ? <NoteCard tone="warning" icon="hourglass-outline" title={t("inbox.configureTitle")}
      body={t("inbox.configureBody")}
      action={{ label: t("inbox.configureRetry"), disabled: pending !== null, onPress: () => {
        if (!acknowledged) { withAcknowledgement({ kind: "hub" }); return; }
        void perform("inbox.pendingRetryingConfiguration", () => service.retryConfigure());
      } }} /> : null}
    {status && active.length > 0 && !blocked && status.consentVersion !== undefined && status.consentVersion !== INTAKE_DISCLOSURE_VERSION
      ? <NoteCard tone="accent" icon="document-text-outline" title={t("inbox.reconsentTitle")}
        body={t("inbox.reconsentBody")}
        action={{ label: t("inbox.reconsentAction"), disabled: pending !== null || !canChange, onPress: () => withAcknowledgement({ kind: "reconsent" }) }} /> : null}
    {snapshot.drain && (snapshot.drain.unresolved > 0 || snapshot.drain.conflicts > 0)
      ? <AlertLine>{t("inbox.drainAlert", { unresolved: snapshot.drain.unresolved, conflicts: snapshot.drain.conflicts })}</AlertLine> : null}

    {!snapshot.status ? <ActivityIndicator accessibilityLabel={t("inbox.checkingAccessA11y")} />
      : unsupportedMessage ? <HeroState icon="notifications-off-outline" tone="warning" title={t("inbox.notAvailable")} status={unsupportedMessage} alert />
      : hero ? <HeroState icon={hero.icon} tone={hero.tone} title={hero.title} status={hero.status} statusTone={"statusTone" in hero ? hero.statusTone : undefined} /> : null}

    {status?.gap ? <NoteCard tone="warning" icon="warning-outline" title={t("inbox.gapTitle")}
      body={tn("inbox.gapBody", status.gap.rejectedCount, { reason: t(GAP_LABELS[status.gap.reason]), since: when(status.gap.since) })} /> : null}

    {status ? <View style={ui.section}>
      <SectionHeading title={t("inbox.appsHeading")} meta={ready ? tn("inbox.appsOnPhone", ready.sources.length) : undefined} />
      <NoteCard tone="warning" icon="mail-outline" title={t("inbox.emailTitle")} body={emailWarning} />
      {active.length ? <Card>
        {active.map((mapping, index) => {
          const label = appLabel(mapping.packageName);
          const problem = appMissing(mapping) ? t("inbox.problemNotInstalled") : accountMissing(mapping) ? t("inbox.problemPlaceUnavailable") : null;
          const line = problem ? t("inbox.rowProblemTo", { problem, place: accountName(mapping) }) : t("inbox.rowTo", { place: accountName(mapping) });
          return <NavRow key={mapping.sourceSelectionId} last={index === active.length - 1} leading={<IconTile letter={appInitial(label)} tone="accent" />}
            title={label} status={line} statusTone={problem ? "danger" : undefined} accessibilityLabel={t("inbox.rowA11y", { app: label, line })}
            onPress={() => setStep({ kind: "app", packageName: mapping.packageName })} />;
        })}
      </Card> : <Muted>{t("inbox.noApps")}</Muted>}
      {catalog.kind === "loading" ? <ActivityIndicator accessibilityLabel={t("inbox.loadingAppsA11y")} />
        : catalog.kind === "failed" ? <AlertLine>{t("inbox.catalogFailed")}</AlertLine>
        : !catalog.sources.length ? <Muted>{t("inbox.noInstalledApps")}</Muted> : null}
      {active.length ? <>
        <SecondaryButton label={t("inbox.addAnotherApp")} disabled={!canChange || !ready} onPress={() => withAcknowledgement({ kind: "addApp" })} />
        <Muted>{t("inbox.addProof")}</Muted>
      </> : null}
    </View> : null}

    {status ? <View style={ui.section}>
      <SectionHeading title={t("inbox.phoneHeading")} />
      <Card>
        <NavRow leading={<IconTile icon="notifications-outline" tone={status.access === "granted" ? "positive" : "warning"} />}
          title={t("inbox.accessRow")} status={accessStatus}
          statusTone={status.access === "granted" ? "positive" : "warning"} accessibilityLabel={t("inbox.rowStatusA11y", { title: t("inbox.accessRow"), status: accessStatus })} />
        <NavRow last leading={<IconTile icon="pulse-outline" tone={status.connection === "connected" ? "positive" : "warning"} />}
          title={t("inbox.listenerRow")} status={listenerStatus}
          statusTone={status.connection === "connected" ? "positive" : "warning"}
          accessibilityLabel={t("inbox.rowStatusA11y", { title: t("inbox.listenerRow"), status: listenerStatus })} />
      </Card>
      <Muted>{status.lastConnectedAt === null ? t("inbox.checkedNever", { checked: when(status.checkedAt) })
        : t("inbox.checkedLast", { checked: when(status.checkedAt), connected: when(status.lastConnectedAt) })}</Muted>
      {status.pendingCount > 0 ? <Muted>{tn("inbox.pendingCaptures", status.pendingCount)}</Muted> : null}
      {status.connection !== "connected" ? <SecondaryButton label={t("inbox.retryListener")} disabled={blocked || status.access !== "granted"}
        onPress={() => { if (!blocked && status.access === "granted") void perform("inbox.pendingRetryingConnection", () => service.retryConnection()); }} /> : null}
      <SecondaryButton label={t("inbox.androidSettings")} disabled={blocked} onPress={() => withAcknowledgement({ kind: "settings" })} />
    </View> : null}

    <SecondaryButton label={t("inbox.refreshStatus")} disabled={pending !== null || snapshot.wipePending}
      onPress={() => { setRevision((value) => value + 1); void perform("inbox.pendingRefreshing", () => service.refresh(), false); }} />

    {status?.notices.length ? <View style={ui.section}>
      <SectionHeading title={t("inbox.skippedHeading")} meta={t("inbox.skippedMeta")} />
      {status.notices.map((notice) => <View key={notice.id} style={{ gap: spacing.sm }}>
        <FactRow icon="eye-off-outline" tone="neutral" title={t(NOTICE_LABELS[notice.kind])}
          detail={tn("inbox.skippedDetail", notice.count, { from: when(notice.firstAt), to: when(notice.lastAt) })} />
        <SecondaryButton label={t("inbox.dismiss")} accessibilityLabel={t("inbox.dismissA11y", { kind: t(NOTICE_LABELS[notice.kind]) })} disabled={pending !== null || snapshot.wipePending}
          onPress={() => { void perform("inbox.pendingDismissing", () => service.dismissNotices([notice.id])); }} />
      </View>)}
    </View> : null}

    {status?.diagnostics?.enabled || (onPrototype && typeof __DEV__ !== "undefined" && __DEV__) ? <Card>
      {onPrototype && (status?.diagnostics?.enabled || (typeof __DEV__ !== "undefined" && __DEV__)) ? <NavRow leading={<IconTile icon="sparkles-outline" tone="accent" />}
        title={t("inbox.prototypeTitle")} status={t("inbox.prototypeStatus")} last={!status?.diagnostics?.enabled}
        accessibilityLabel={t("inbox.prototypeA11y")} disabled={pending !== null} onPress={onPrototype} /> : null}
      {status?.diagnostics?.enabled ? <NavRow last leading={<IconTile icon="pulse-outline" />} title={t("inbox.diagnosticsTitle")}
        status={t("inbox.diagnosticsStatus", { records: status.diagnostics.recordCount, overflow: status.diagnostics.overflowCount, errors: status.diagnostics.errorCount, state: status.diagnostics.state })}
        accessibilityLabel={t("inbox.diagnosticsA11y")} disabled={blocked} onPress={() => setStep({ kind: "inspect" })} /> : null}
    </Card> : null}

    {ready ? <Muted>{t("inbox.workspaceLine", { currency: ready.workspace.functionalCurrency, city: timeZoneCity(ready.workspace.timeZone) })}</Muted> : null}
    {supported && !snapshot.wipePending ? <SecondaryButton label={t("inbox.wipeAction")} tone="danger" disabled={pending !== null} onPress={() => setStep({ kind: "wipe" })} /> : null}

    {catalogOpen && ready ? <IntakeSelectionPicker title={t("inbox.pickerTitle")} eyebrow={t("inbox.pickerEyebrow", { count: ready.sources.length })} searchLabel={t("inbox.pickerSearch")} guidance={emailWarning}
      options={orderSources(ready.sources).map((source) => ({ id: source.packageName, label: source.label, detail: source.packageName,
        initial: appInitial(source.label), likely: likelyBankApp(source) }))}
      disabled={!canConfigure} empty={t("inbox.noInstalledApps")}
      onClose={() => setCatalogOpen(false)}
      onSelect={(packageName) => { setCatalogOpen(false); setStep({ kind: "place", packageName, profileId: null }); }} /> : null}
  </Screen>;
}
