import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Header, PrimaryButton, Screen, SecondaryButton, useUi } from "../../ui/core";
import { useIntakeService, useIntakeSnapshot } from "./IntakeProvider";
import type { DiagnosticList, DiagnosticRecord } from "../../../modules/notification-intake";

export function ArrivalInspector({ onBack }: { onBack(): void }) {
  const ui = useUi();
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
  return <Screen>
    <Header title="Arrival diagnostics" eyebrow="DEV / BETA ONLY · ON THIS DEVICE" onBack={onBack} />
    {!enabled ? <Text style={ui.error}>Raw diagnostics are disabled in this native build.</Text> : <>
      <Text style={ui.body}>Selected apps' original delivered contents, including security messages, are encrypted locally for up to 24 hours. Diagnostics never post money or upload contents. Field limits and unsupported values are marked in each snapshot.</Text>
      <Text style={ui.muted}>Limits are 32 arrivals, 512 KiB per record and 4 MiB total. A full diagnostic store does not stop Candidate capture.</Text>
      {error ? <Text accessibilityRole="alert" style={ui.error}>{error}</Text> : null}
      {list ? <Text accessibilityLiveRegion="polite" style={ui.body}>{list.health.state} · {list.health.recordCount} records · {list.health.byteCount} bytes · {list.health.overflowCount} overflow · {list.health.errorCount} storage errors</Text> : <ActivityIndicator />}
      <SecondaryButton label="Refresh arrivals" disabled={busy} onPress={() => { setDetail(null); setRevision((value) => value + 1); }} />
      <SecondaryButton label="Clear all raw diagnostics" tone="danger" disabled={busy} onPress={() => { void perform(async () => { await service.clearDiagnostics(); setDetail(null); }); }} />
      {detail ? <View style={ui.section}>
        <Text style={ui.sectionHeading}>{detail.packageName}</Text>
        <Text selectable style={ui.muted}>Capture {detail.captureId} · arrival {detail.id} · {new Date(detail.capturedAt).toLocaleString()}</Text>
        <Text selectable style={ui.body}>{JSON.stringify(detail, null, 2)}</Text>
        <SecondaryButton label="Delete this raw arrival" tone="danger" disabled={busy} onPress={() => { void perform(async () => { await service.deleteDiagnostic(detail.id); setDetail(null); }); }} />
      </View> : list?.records.map((row) => <View key={row.id} style={ui.section}>
        <Text style={ui.sectionHeading}>{row.packageName}</Text>
        <Text selectable style={ui.muted}>Capture {row.captureId} · {new Date(row.capturedAt).toLocaleString()} · expires {new Date(row.expiresAt).toLocaleString()}</Text>
        <Text style={ui.body}>{row.parser.outcome} · {row.parser.reasons.join(", ")}</Text>
        <PrimaryButton label={`Inspect arrival ${row.id}`} disabled={busy} onPress={() => { void perform(async () => { setDetail(await service.readDiagnostic(row.id)); }); }} />
        <SecondaryButton label={`Delete arrival ${row.id}`} tone="danger" disabled={busy} onPress={() => { void perform(async () => { await service.deleteDiagnostic(row.id); }); }} />
      </View>)}
    </>}
  </Screen>;
}
