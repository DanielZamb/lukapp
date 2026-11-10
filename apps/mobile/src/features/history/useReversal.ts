import { ConvexError } from "convex/values";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useLayoutEffect, useRef, useState } from "react";
import type { Translator } from "../../../../../src/i18n";
import type { api } from "../api";

type Payload = FunctionArgs<typeof api.accounting.reversePostedEntry>;
type Receipt = FunctionReturnType<typeof api.accounting.reversePostedEntry>;
export type ReversalState =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "submitting" }
  | { kind: "failed"; message: string }
  | { kind: "posted"; receipt: Receipt };
export type ReversalTransport = {
  post: (payload: Payload) => Promise<Receipt>;
  reportFailure: (error: unknown) => boolean;
};

export function reversalPayload(workspaceId: string, journalEntryId: string): Payload {
  return { workspaceId, journalEntryId, idempotencyKey: `mobile-reversal@1:${workspaceId}:${journalEntryId}` };
}

export function reversalFailureMessage(error: unknown, { t }: Translator) {
  const data: unknown = error instanceof ConvexError ? error.data : null;
  if (data && typeof data === "object" && "kind" in data && data.kind === "accounting" && "code" in data) {
    if (data.code === "journal_entry_already_reversed") return t("review.reversalAlready");
    if (data.code === "reversal_cannot_be_reversed") return t("review.reversalOfReversal");
    return t("review.reversalRejected");
  }
  return t("review.reversalUnknown");
}

export function useReversal(workspaceId: string, journalEntryId: string, transport: ReversalTransport, translator: Translator) {
  const [state, setState] = useState<ReversalState>({ kind: "idle" });
  const current = useRef(state);
  const lifetime = useRef({ active: false });
  function change(next: ReversalState) { current.current = next; setState(next); }
  useLayoutEffect(() => {
    const mounted = { active: true };
    lifetime.current = mounted;
    change({ kind: "idle" });
    return () => { mounted.active = false; };
  }, [workspaceId, journalEntryId, transport]);

  async function confirm() {
    const mounted = lifetime.current;
    if (!mounted.active || (current.current.kind !== "confirming" && current.current.kind !== "failed")) return;
    change({ kind: "submitting" });
    try {
      const receipt = await transport.post(reversalPayload(workspaceId, journalEntryId));
      if (mounted.active) change({ kind: "posted", receipt });
    } catch (error) {
      if (!mounted.active || transport.reportFailure(error)) return;
      change({ kind: "failed", message: reversalFailureMessage(error, translator) });
    }
  }
  return {
    state,
    request: () => { if (lifetime.current.active && current.current.kind === "idle") change({ kind: "confirming" }); },
    cancel: () => { if (lifetime.current.active && current.current.kind === "confirming") change({ kind: "idle" }); },
    confirm,
  };
}
