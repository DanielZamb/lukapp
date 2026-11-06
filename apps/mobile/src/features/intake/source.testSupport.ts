import type { StoredSuggestion } from "./candidates";

export type NormalizedCapture = {
  workspaceId: string;
  currency: "COP" | "USD";
  suggestion: StoredSuggestion;
  parserVersion: string;
  consentVersion: string;
};

export type NotificationSource = {
  pull(): Promise<NormalizedCapture[]>;
};

export function memorySource(captures: NormalizedCapture[]): NotificationSource {
  const queue = [...captures];
  return {
    async pull() {
      const next = [...queue];
      queue.length = 0;
      return next;
    },
  };
}

export function captureToCandidate(
  capture: NormalizedCapture,
  now: number,
  id: string,
  ttlMs: number,
) {
  return {
    id,
    createdAt: now,
    expiresAt: now + ttlMs,
    workspaceId: capture.workspaceId,
    currency: capture.currency,
    suggestion: capture.suggestion,
    parserVersion: capture.parserVersion,
    consentVersion: capture.consentVersion,
  };
}
