import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { Header, Screen, SecondaryButton, useTheme, useUi } from "../../ui/core";
import { radius, spacing } from "../../ui/tokens";
import { useIntakeService, useIntakeSnapshot } from "./IntakeProvider";
import type { DiagnosticList, DiagnosticRecord } from "../../../modules/notification-intake";
import { ActionBar, AlertLine, Card, FactRow, IconTile, Muted, NavRow, SectionHeading } from "./IntakeParts";
import { formatDateTime, useT } from "../../i18n";

export function ArrivalInspector({ onBack }: { onBack(): void }) {
  const { t, language } = useT();
  const when = (time: number) => formatDateTime(language, time);
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
      .catch(() => { if (current) setError(t("inbox.inspectReadFailed")); });
    return () => { current = false; };
  }, [service, revision, enabled]);
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); service.assertAdmitted(); setRevision((value) => value + 1); }
    catch { setDetail(null); setError(t("inbox.inspectActionFailed")); }
    finally { setBusy(false); }
  }

  if (detail) return <Screen footer={<ActionBar>
    <SecondaryButton label={t("inbox.inspectDelete")} tone="danger" disabled={busy}
      onPress={() => { void perform(async () => { await service.deleteDiagnostic(detail.id); setDetail(null); }); }} />
  </ActionBar>}>
    <Header title={detail.packageName} eyebrow={t("inbox.inspectEyebrowDetail")} onBack={() => setDetail(null)} />
    {error ? <AlertLine>{error}</AlertLine> : null}
    <Muted>{t("inbox.inspectOutcome", { outcome: detail.parser.outcome, reasons: detail.parser.reasons.join(", ") || t("inbox.inspectNoReasons") })}</Muted>
    <Text selectable style={ui.muted}>{t("inbox.inspectIds", { capture: detail.captureId, arrival: detail.id, when: when(detail.capturedAt) })}</Text>
    <View style={{ backgroundColor: theme.secondary, borderRadius: radius.md, borderWidth: 1, borderColor: theme.border, padding: spacing.lg }}>
      <Text selectable style={[ui.body, { fontFamily: Platform.OS === "android" ? "monospace" : "Menlo", fontSize: 13, lineHeight: 19 }]}>
        {JSON.stringify(detail, null, 2)}
      </Text>
    </View>
  </Screen>;

  return <Screen footer={enabled ? <ActionBar>
    <SecondaryButton label={t("inbox.inspectRefresh")} disabled={busy} onPress={() => setRevision((value) => value + 1)} />
    <SecondaryButton label={t("inbox.inspectClear")} tone="danger" disabled={busy}
      onPress={() => { void perform(async () => { await service.clearDiagnostics(); }); }} />
  </ActionBar> : null}>
    <Header title={t("inbox.inspectTitle")} eyebrow={t("inbox.inspectEyebrow")} onBack={onBack} />
    {!enabled ? <AlertLine>{t("inbox.inspectDisabled")}</AlertLine> : <>
      <View style={{ gap: spacing.xl }}>
        <FactRow icon="lock-closed-outline" title={t("inbox.inspectOriginal")}
          detail={t("inbox.inspectOriginalDetail")} />
        <FactRow icon="layers-outline" tone="neutral" title={t("inbox.inspectLimit")}
          detail={t("inbox.inspectLimitDetail")} />
      </View>
      {error ? <AlertLine>{error}</AlertLine> : null}
      <View style={ui.section}>
        <SectionHeading title={t("inbox.inspectArrivals")} meta={list
          ? t("inbox.inspectHealth", { state: list.health.state, records: list.health.recordCount, bytes: list.health.byteCount,
            overflow: list.health.overflowCount, errors: list.health.errorCount })
          : undefined} />
        {!list ? <ActivityIndicator accessibilityLabel={t("inbox.inspectLoadingA11y")} />
          : !list.records.length ? <Muted>{t("inbox.inspectNone")}</Muted>
          : <Card>{list.records.map((row, index) => <NavRow key={row.id} last={index === list.records.length - 1}
              leading={<IconTile icon={row.parser.outcome === "normalized" ? "checkmark-circle" : row.parser.outcome === "discarded" ? "eye-off-outline" : "alert-circle"}
                tone={row.parser.outcome === "normalized" ? "positive" : row.parser.outcome === "discarded" ? "neutral" : "warning"} />}
              title={row.packageName} status={t("inbox.inspectRowStatus", { outcome: row.parser.outcome, when: when(row.capturedAt) })}
              accessibilityLabel={t("inbox.inspectRowA11y", { id: row.id })} disabled={busy}
              onPress={() => { void perform(async () => { setDetail(await service.readDiagnostic(row.id)); }); }} />)}</Card>}
      </View>
    </>}
  </Screen>;
}
