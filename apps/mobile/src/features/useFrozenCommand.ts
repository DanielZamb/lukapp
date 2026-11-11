import { useLayoutEffect, useRef, useState } from "react";
import { ConvexError } from "convex/values";

/**
 * A structured server error with a code is a definite refusal of the attempt that carried it: the function threw
 * before its mutation committed. Only a transport failure or an unrecognised shape leaves that attempt's outcome unknown.
 */
export function refusalCodeOf(error: unknown): string | null {
  const data: unknown = error instanceof ConvexError ? error.data : null;
  return data !== null && typeof data === "object" && "code" in data && typeof data.code === "string" ? data.code : null;
}

/**
 * Raised in front of every command, before it looks for an earlier receipt, on replays as on first sends: by the
 * action's session check (convex/lib/admission.ts, session.ts, clerkProvider.ts) and by requireSubmission in its
 * mutation (convex/lib/deviceAuthorization.ts). They say why this attempt was turned away, never what an earlier one did.
 */
export const attemptRefusals: ReadonlySet<string> = new Set([
  "authentication_required", "session_required", "provider_unavailable", "session_inactive",
  "session_verification_required", "device_revoked", "device_registration_required", "membership_required", "permission_denied",
]);

export type CommandTransport<Request, Receipt> = {
  send: (request: Request) => Promise<Receipt>;
  reportFailure: (error: unknown) => boolean;
  onDone: (receipt: Receipt) => void;
  /** Called once a refusal answers the request, so a caller can mark what the server turned away. */
  onRefused?: (code: string, request: Request) => void;
  /** The code of a definite refusal, or null when the server may have applied the request. */
  refusalCode?: (error: unknown) => string | null;
  /**
   * Whether a refusal of a resent request also answers the earlier send whose outcome is unknown: the command raises
   * it only after looking for that send's receipt and finding none, or for a request it could never accept. Any other
   * refusal, including one this caller does not know, leaves the request held. The attempt refusals never answer it.
   */
  settles?: (code: string, error: unknown) => boolean;
  /** Saves a copy of a new request before it first leaves. If that fails, nothing is sent and nothing is held. */
  keep?: (request: Request) => Promise<void>;
  /** Forgets a copy of the request kept elsewhere once its outcome is known. A failure here never holds the person back. */
  forget?: (request: Request) => Promise<void>;
};

export type CommandState<Request> =
  | { name: "open"; refusal: { code: string; request: Request } | null }
  /** The copy couldn't be saved, so the request never left; the person can edit and send again. */
  | { name: "unsaved" }
  | { name: "sending" }
  /** The request is held until its outcome is known; `refusal` is why the latest resend was turned away, if it was. */
  | { name: "uncertain"; refusal: string | null };

export type CommandOutcome = "done" | "refused" | "uncertain" | "unsent";

export function useFrozenCommand<Request, Receipt>(transport: CommandTransport<Request, Receipt>) {
  const [state, setState] = useState<CommandState<Request>>({ name: "open", refusal: null });
  /** A request whose outcome is unknown. Until something answers it, it is the only request that can be sent. */
  const held = useRef<Request | null>(null);
  const sending = useRef(false);
  const lifetime = useRef({ active: false });
  useLayoutEffect(() => {
    const mounted = { active: true };
    lifetime.current = mounted;
    return () => { mounted.active = false; };
  }, []);
  async function forget(request: Request) {
    held.current = null;
    await transport.forget?.(request).catch(() => {});
  }
  async function submit(build: () => Request | null): Promise<CommandOutcome | undefined> {
    const mounted = lifetime.current;
    if (!mounted.active || sending.current) return;
    const resent = held.current;
    const request = resent ?? build();
    if (!request) return;
    sending.current = true;
    setState({ name: "sending" });
    try {
      if (resent === null && transport.keep) {
        try {
          await transport.keep(request);
        } catch {
          if (mounted.active) setState({ name: "unsaved" });
          return "unsent";
        }
      }
      const receipt = await transport.send(request);
      await forget(request);
      if (!mounted.active) return;
      setState({ name: "open", refusal: null });
      transport.onDone(receipt);
      return "done";
    } catch (caught) {
      const handled = transport.reportFailure(caught);
      const code = handled ? null : (transport.refusalCode ?? refusalCodeOf)(caught);
      const settled = code !== null && (resent === null || (!attemptRefusals.has(code) && (transport.settles?.(code, caught) ?? false)));
      if (settled) await forget(request);
      else held.current = request;
      if (!mounted.active) return;
      if (settled) {
        setState({ name: "open", refusal: { code, request } });
        transport.onRefused?.(code, request);
        return "refused";
      }
      setState({ name: "uncertain", refusal: code });
      return "uncertain";
    } finally {
      sending.current = false;
    }
  }
  return {
    state,
    busy: state.name === "sending",
    frozen: state.name === "sending" || state.name === "uncertain",
    canEdit: () => lifetime.current.active && !sending.current && !held.current,
    submit,
    /** Sends again a request whose outcome was already unknown before this screen opened, such as one saved on the phone. */
    resend: (request: Request) => {
      if (!sending.current && !held.current) held.current = request;
      return submit(() => request);
    },
    /** Drops an unknown outcome once the caller has re-read what the server now holds. */
    release: () => {
      if (sending.current) return;
      const request = held.current;
      setState({ name: "open", refusal: null });
      if (request !== null) void forget(request);
    },
  };
}
