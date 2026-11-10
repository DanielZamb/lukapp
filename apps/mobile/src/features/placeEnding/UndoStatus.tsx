import { useQuery } from "convex/react";
import { Text, View } from "react-native";
import { useT } from "../../i18n";
import { useTheme, useUi } from "../../ui/core";
import { radius, spacing } from "../../ui/tokens";
import { api } from "../api";
import { undoStatusView, type UndoOperation } from "./model";

/** The backend's Undo status for a Place, read again whenever it changes, so it survives closing and reopening the app. */
export function useUndoStatus(workspaceId: string, profileId: string, enabled: boolean) {
  return useQuery(api.accounting.placeUndoStatus, enabled ? { workspaceId, financialAccountProfileId: profileId } : "skip");
}

export function UndoStatusCard({ operation, timeZone }: { operation: UndoOperation; timeZone: string }) {
  const ui = useUi();
  const theme = useTheme();
  const translator = useT();
  const view = undoStatusView(operation, translator, timeZone);
  const attention = operation.state.kind === "needs_attention";
  return <View accessibilityLiveRegion="polite" style={{ gap: spacing.xs, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1,
    borderColor: view.tone === "warning" ? theme.danger : theme.border }}>
    <Text accessibilityRole="header" style={ui.title}>{view.title}</Text>
    {view.lines.map((line) => <Text key={line} style={ui.body}>{line}</Text>)}
    {attention && <Text style={ui.muted}>{translator.t("placeEnding.statusAttentionHelp")}</Text>}
  </View>;
}

/** One short line for a list row: the state and how many movements are reversed so far. */
export function undoStatusLine(operation: UndoOperation | null | undefined, translator: ReturnType<typeof useT>, timeZone: string) {
  if (!operation) return translator.t("placeEnding.statusRunningTitle");
  const view = undoStatusView(operation, translator, timeZone);
  return `${view.title} · ${translator.tn("placeEnding.statusReversed", operation.reversedCount)}`;
}
