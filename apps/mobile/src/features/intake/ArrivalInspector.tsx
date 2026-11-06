import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { Header, Screen, SecondaryButton, Text, useTheme, useUi } from "../../ui/core";
import { radius, spacing } from "../../ui/tokens";
import { useIntakeService, useIntakeSnapshot } from "./IntakeProvider";
import type { DiagnosticList, DiagnosticRecord } from "../../../modules/notification-intake";
import { ActionBar, AlertLine, Card, FactRow, IconTile, Muted, NavRow, SectionHeading } from "./IntakeParts";

const when = (time: number) => new Date(time).toLocaleString();

export function ArrivalInspector({ onBack }: { onBack(): void }) {
  const ui = useUi();
  const theme = useTheme();
  const service = useIntakeService();
  const snapshot = useIntakeSnapshot();
  const [list, setList] = useState<DiagnosticList | null>(null);
  const [detail, setDetail] = useState<DiagnosticRecord | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const enabled = snapshot.status && "epoch" in snapshot.status && snapshot.status.diagnostics?.enabled === true;
  useEffect(() => {
    let current = true;
    if (!enabled) return;
    void service.listDiagnostics().then((value) => { if (current) setList(value); })
      .catch(() => { if (current) setError("Could not read encrypted diagnostics. Refresh or clear the diagnostic store."); });
    return () => { current = false; };
  }, [service, revision, enabled]);
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); service.assertAdmitted(); setRevision((value) => value + 1); }
    catch { setDetail(null); setError("Diagnostic action unavailable. Unlock and refresh intake before retrying."); }
    finally { setBusy(false); }
  }

  if (detail) return <Screen footer={<ActionBar>
    <SecondaryButton label="Delete this raw arrival" tone="danger" disabled={busy}
      onPress={() => { void perform(async () => { await service.deleteDiagnostic(detail.id); setDetail(null); }); }} />
  </ActionBar>}>
    <Header title={detail.packageName} eyebrow="RAW ARRIVAL" onBack={() => setDetail(null)} />
    {error ? <AlertLine>{error}</AlertLine> : null}
    <Muted>{`${detail.parser.outcome} · ${detail.parser.reasons.join(", ") || "no reasons"}`}</Muted>
    <Text selectable preset="body" tone="muted">Capture {detail.captureId} · arrival {detail.id} · {when(detail.capturedAt)}</Text>
    <View style={{ backgroundColor: theme.secondary, borderRadius: radius.md, borderWidth: 1, borderColor: theme.border, padding: spacing.lg }}>
      <Text selectable preset="systemFootnote" tone="default" style={{ fontFamily: Platform.OS === "android" ? "monospace" : "Menlo" }}>
        {JSON.stringify(detail, null, 2)}
      </Text>
    </View>
  </Screen>;

  return <Screen footer={enabled ? <ActionBar>
    <SecondaryButton label="Refresh arrivals" disabled={busy} onPress={() => setRevision((value) => value + 1)} />
    <SecondaryButton label="Clear all raw diagnostics" tone="danger" disabled={busy}
      onPress={() => { void perform(async () => { await service.clearDiagnostics(); }); }} />
  </ActionBar> : null}>
    <Header title="Arrival diagnostics" eyebrow="BETA · ON THIS PHONE" onBack={onBack} />
    {!enabled ? <AlertLine>Raw diagnostics are disabled in this native build.</AlertLine> : <>
      <View style={{ gap: spacing.xl }}>
        <FactRow icon="lock-closed-outline" title="Original text, encrypted for 24 hours"
          detail="Includes security messages from the apps you chose. Never uploaded, and never posts money." />
        <FactRow icon="layers-outline" tone="neutral" title="Up to 32 arrivals"
          detail="512 KiB each, 4 MiB in total. A full store doesn't stop candidate capture." />
      </View>
      {error ? <AlertLine>{error}</AlertLine> : null}
      <View style={ui.section}>
        <SectionHeading title="Arrivals" meta={list
          ? `${list.health.state} · ${list.health.recordCount} records · ${list.health.byteCount} bytes · ${list.health.overflowCount} overflow · ${list.health.errorCount} storage errors`
          : undefined} />
        {!list ? <ActivityIndicator accessibilityLabel="Loading arrivals" />
          : !list.records.length ? <Muted>No arrivals stored right now.</Muted>
          : <Card>{list.records.map((row, index) => <NavRow key={row.id} last={index === list.records.length - 1}
              leading={<IconTile icon={row.parser.outcome === "normalized" ? "checkmark-circle" : row.parser.outcome === "discarded" ? "eye-off-outline" : "alert-circle"}
                tone={row.parser.outcome === "normalized" ? "positive" : row.parser.outcome === "discarded" ? "neutral" : "warning"} />}
              title={row.packageName} status={`${row.parser.outcome} · ${when(row.capturedAt)}`}
              accessibilityLabel={`Inspect arrival ${row.id}`} disabled={busy}
              onPress={() => { void perform(async () => { setDetail(await service.readDiagnostic(row.id)); }); }} />)}</Card>}
      </View>
    </>}
  </Screen>;
}
