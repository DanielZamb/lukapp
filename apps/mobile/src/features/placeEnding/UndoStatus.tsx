import { useQuery } from "convex/react";
import { ActivityIndicator, Text, View } from "react-native";
import { useT } from "../../i18n";
import { ListGroup, ListRow, SecondaryButton, useTheme, useUi } from "../../ui/core";
import { radius, spacing } from "../../ui/tokens";
import { api } from "../api";
import { undoAbortable, undoProgress, undoStartedLines, undoStatusView, type UndoOperation } from "./model";

/** The backend's Undo status for a Place, read again whenever it changes, so it survives closing and reopening the app. */
export function useUndoStatus(workspaceId: string, profileId: string, enabled: boolean) {
  return useQuery(api.accounting.placeUndoStatus, enabled ? { workspaceId, financialAccountProfileId: profileId } : "skip");
}

/** Cancelling an Undo that stopped before reversing anything; the command lives with the page, which outlasts this card. */
export type UndoAbortControl = { busy: boolean; uncertain: boolean; error: string; onAbort: () => void };

export function UndoStatusCard({ operation, name, timeZone, abort }: {
  operation: UndoOperation; name: string; timeZone: string; abort?: UndoAbortControl;
}) {
  const ui = useUi();
  const theme = useTheme();
  const translator = useT();
  const { t } = translator;
  const view = undoStatusView(operation, name, translator, timeZone);
  const started = operation.state.kind === "aborted" ? null : undoStartedLines(operation, translator, timeZone);
  const attention = operation.state.kind === "needs_attention";
  const abortable = abort && undoAbortable(operation);
  return <View accessibilityLiveRegion="polite" style={{ gap: spacing.xs, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1,
    borderColor: view.tone === "warning" ? theme.danger : theme.border }}>
    <Text accessibilityRole="header" style={ui.title}>{view.title}</Text>
    {view.lines.map((line) => <Text key={line} style={ui.body}>{line}</Text>)}
    {started && <>
      {started.lines.map((line) => <Text key={line} style={ui.muted}>{line}</Text>)}
      {started.places.length > 0 && <>
        <Text style={ui.muted}>{t("placeEnding.undoOthersTitle")}</Text>
        <ListGroup>{started.places.map((place) => <ListRow key={place.id} title={place.name} value={place.change} />)}</ListGroup>
      </>}
    </>}
    {view.support.map((line) => <Text key={line} style={ui.muted}>{line}</Text>)}
    {attention && !abortable && <Text style={ui.muted}>{t("placeEnding.statusAttentionHelp")}</Text>}
    {abortable && <>
      <Text style={ui.body}>{t("placeEnding.abortExplain", { name })}</Text>
      {operation.replacementDefaultFinancialAccountProfileId && <Text style={ui.body}>{t("placeEnding.abortDefault", { name })}</Text>}
      {abort.busy && <ActivityIndicator accessibilityLabel={t("placeEnding.abortBusy")} />}
      {!!abort.error && <Text accessibilityRole="alert" style={ui.error}>{abort.error}</Text>}
      <SecondaryButton label={abort.uncertain ? t("placeEnding.abortRetry") : t("placeEnding.abortAction")}
        disabled={abort.busy} onPress={abort.onAbort} />
    </>}
  </View>;
}

/** One short line for a list row: the state and how far it is. */
export function undoStatusLine(operation: UndoOperation | null | undefined, name: string, translator: ReturnType<typeof useT>, timeZone: string) {
  if (!operation) return translator.t("placeEnding.statusRunningTitle");
  const view = undoStatusView(operation, name, translator, timeZone);
  return `${view.title} · ${undoProgress(operation, translator.tn)}`;
}
