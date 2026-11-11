import { useCallback, useMemo } from "react";
import { useT } from "../i18n";
import { useIntakeService, useIntakeSnapshot } from "./intake/IntakeProvider";
import { intakeSourcesStatus, intakeWarning } from "./intake/presentation";
import { viewInbox } from "./intake/candidates";
import type { DiscardNotice } from "./localDiscardNotices";

export function useIntakeCandidates(input: { subject: string; workspaceId: string; currency: string }) {
  const translator = useT();
  const service = useIntakeService();
  const snapshot = useIntakeSnapshot();
  const candidates = useMemo(() => service.candidates(), [service, snapshot]);
  const view = viewInbox({ v: 1, candidates }, input.workspaceId, Date.now(), input.currency);
  const read = useCallback(async (id: string) => {
    const row = service.read(id);
    return row?.workspaceId === input.workspaceId ? row : null;
  }, [service, input.workspaceId]);
  const notices: DiscardNotice[] = snapshot.status && "epoch" in snapshot.status
    ? snapshot.status.notices.map((notice) => ({
      reason: ({ security: "Security alert", no_amount: "Missing amount or direction", multiple_amounts: "Multiple amounts",
        ambiguous: "Ambiguous amount", overflow: "Queue full", conflict: "Conflicting capture" } satisfies Record<typeof notice.kind, DiscardNotice["reason"]>)[notice.kind],
      time: notice.lastAt,
    })) : [];
  const dismissNotices = useCallback(async () => {
    const status = service.getSnapshot().status;
    if (status && "epoch" in status) await service.dismissNotices(status.notices.map((notice) => notice.id));
    await service.refresh();
  }, [service]);
  return { ...view, warning: intakeWarning(snapshot, translator), sources: intakeSourcesStatus(snapshot, translator), supported: snapshot.status ? "epoch" in snapshot.status : null, status: snapshot.status, count: snapshot.loaded ? view.count : null, error: snapshot.error,
    refresh: service.refresh, read, notices, dismissNotices, service };
}
