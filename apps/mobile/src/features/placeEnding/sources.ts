import { useEffect, useMemo, useState } from "react";
import type { CandidateState } from "../intake/durableState";
import { useIntakeService, useIntakeSnapshot } from "../intake/IntakeProvider";
import type { IntakeSnapshot } from "../intake/service";
import type { SourceBlocker } from "./model";

/**
 * Notification sources whose alerts land in this Place. Mappings live only on this phone, so the server cannot see
 * them: a source counts while it is active or while a configuration naming it is still waiting to be applied.
 */
export function mappedSources(state: CandidateState, workspaceId: string, profileId: string) {
  const selected = new Set([...state.activeSelectionIds, ...(state.pendingConfigure?.sources.map((source) => source.sourceSelectionId) ?? [])]);
  return state.mappings.filter((mapping) => selected.has(mapping.sourceSelectionId)
    && mapping.workspaceId === workspaceId && mapping.financialAccountProfileId === profileId);
}

function blockerFor(snapshot: IntakeSnapshot, workspaceId: string, profileId: string, labels: Record<string, string>) {
  if (!snapshot.loaded) return snapshot.error ? { code: "notification_sources_unread" } as const : undefined;
  const mapped = mappedSources(snapshot.state, workspaceId, profileId);
  return mapped.length ? { code: "notification_sources", apps: mapped.map((mapping) => labels[mapping.packageName] ?? mapping.packageName) } as const : null;
}

/**
 * The device blocker for ending a Place: `blocker` follows the phone as the screen renders (undefined while it is
 * still being read), and `atSend` reads the phone's mappings again at the moment a command is about to leave, so a
 * mapping made after the last render still stops it. A phone that cannot be read at that moment also stops it.
 */
export function useSourceBlocker(workspaceId: string, profileId: string) {
  const service = useIntakeService();
  const snapshot = useIntakeSnapshot();
  const mapped = useMemo(() => mappedSources(snapshot.state, workspaceId, profileId), [snapshot.state, workspaceId, profileId]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const wanted = mapped.map((mapping) => mapping.packageName).join("\n");
  useEffect(() => {
    if (!wanted) return;
    let current = true;
    service.listSources()
      .then((sources) => { if (current) setLabels(Object.fromEntries(sources.map((source) => [source.packageName, source.label]))); })
      .catch(() => {});
    return () => { current = false; };
  }, [service, wanted]);
  return {
    blocker: blockerFor(snapshot, workspaceId, profileId, labels) as SourceBlocker | null | undefined,
    atSend: (): SourceBlocker | null => {
      const found = blockerFor(service.getSnapshot(), workspaceId, profileId, labels);
      return found === undefined ? { code: "notification_sources_unread" } : found;
    },
  };
}
