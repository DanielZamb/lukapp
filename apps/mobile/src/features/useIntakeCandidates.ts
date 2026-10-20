import * as Crypto from "expo-crypto";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useLocalInputLease } from "../local-auth/localInput";
import {
  INTAKE_CANDIDATE_TTL_MS,
  acceptIn,
  consumeIn,
  failIn,
  mutateIntakeDocument,
  parseIntakeDocument,
  readIntakeRaw,
  viewInbox,
  type IntakeCandidate,
  type IntakeCandidateId,
} from "./intake/candidates";
import { captureToCandidate, type NotificationSource } from "./intake/source";

export function useIntakeCandidates(input: {
  subject: string;
  workspaceId: string;
  currency: string;
  source?: NotificationSource | null;
}) {
  const lease = useLocalInputLease();
  const [now, setNow] = useState<IntakeCandidate[]>([]);
  const [wait, setWait] = useState<IntakeCandidate[]>([]);
  const [ready, setReady] = useState<IntakeCandidate[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      if (input.source) {
        const captures = await input.source.pull();
        if (captures.length)
          await mutateIntakeDocument(lease, input.subject, (document, clock) => {
            let next = document;
            for (const capture of captures) {
              if (capture.workspaceId !== input.workspaceId) continue;
              next = acceptIn(
                next,
                captureToCandidate(
                  capture,
                  clock,
                  Crypto.randomUUID(),
                  INTAKE_CANDIDATE_TTL_MS,
                ),
                clock,
              );
            }
            return { document: next, result: undefined, write: true };
          });
      }
      const parsed = parseIntakeDocument(
        await readIntakeRaw(input.subject),
        Date.now(),
      );
      const view = viewInbox(
        parsed.document,
        input.workspaceId,
        Date.now(),
        input.currency,
      );
      setNow(view.now);
      setWait(view.wait);
      setReady(view.ready);
      setCount(view.count);
      setError("");
    } catch {
      setError("Could not load Candidates on this device.");
    }
  }, [input.source, input.subject, input.workspaceId, input.currency, lease]);
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  const consume = useCallback(
    (id: IntakeCandidateId) =>
      mutateIntakeDocument(lease, input.subject, (document) => ({
        document: consumeIn(document, id),
        result: undefined,
        write: true,
      })).then(refresh),
    [input.subject, lease, refresh],
  );
  const fail = useCallback(
    (id: IntakeCandidateId, message: string) =>
      mutateIntakeDocument(lease, input.subject, (document) => ({
        document: failIn(document, id, message),
        result: undefined,
        write: true,
      })).then(refresh),
    [input.subject, lease, refresh],
  );
  const accept = useCallback(
    (candidate: IntakeCandidate) =>
      mutateIntakeDocument(lease, input.subject, (document, clock) => ({
        document: acceptIn(document, candidate, clock),
        result: candidate.id,
        write: true,
      })).then(refresh),
    [input.subject, lease, refresh],
  );
  const read = useCallback(
    async (id: IntakeCandidateId) => {
      const parsed = parseIntakeDocument(
        await readIntakeRaw(input.subject),
        Date.now(),
      );
      return (
        parsed.document.candidates.find(
          (row) =>
            row.id === id &&
            row.workspaceId === input.workspaceId &&
            row.expiresAt > Date.now(),
        ) ?? null
      );
    },
    [input.subject, input.workspaceId],
  );
  return {
    now,
    wait,
    ready,
    count,
    error,
    refresh,
    accept,
    consume,
    fail,
    read,
  };
}
