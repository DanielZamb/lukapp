import { useEffect, useMemo, useState } from "react";
import type { CandidateState } from "../intake/durableState";
import { useIntakeService, useIntakeSnapshot } from "../intake/IntakeProvider";
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

/** The device blocker for ending a Place, or null when no source maps to it. Undefined while the phone is still being read. */
export function useSourceBlocker(workspaceId: string, profileId: string): SourceBlocker | null | undefined {
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
  if (!snapshot.loaded) return snapshot.error ? { code: "notification_sources_unread" } : undefined;
  return mapped.length ? { code: "notification_sources", apps: mapped.map((mapping) => labels[mapping.packageName] ?? mapping.packageName) } : null;
}
