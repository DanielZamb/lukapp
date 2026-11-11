import { useLayoutEffect, useRef, useState } from "react";
import { ConvexError } from "convex/values";

/**
 * A structured server error with a code is a definite refusal, whatever its kind: the function threw before its
 * mutation committed. Only a transport failure or an unrecognised shape leaves the outcome unknown.
 */
export function refusalCodeOf(error: unknown): string | null {
  const data: unknown = error instanceof ConvexError ? error.data : null;
  return data !== null && typeof data === "object" && "code" in data && typeof data.code === "string" ? data.code : null;
}

export type CommandTransport<Request, Receipt> = {
  send: (request: Request) => Promise<Receipt>;
  reportFailure: (error: unknown) => boolean;
  onDone: (receipt: Receipt) => void;
  /** The code of a definite refusal, or null when the server may have applied the request. */
  refusalCode?: (error: unknown) => string | null;
};

export type CommandState<Request> =
  | { name: "open"; refusal: { code: string; request: Request } | null }
  | { name: "sending" }
  | { name: "uncertain" };

export type CommandOutcome = "done" | "refused" | "uncertain";

export function useFrozenCommand<Request, Receipt>(transport: CommandTransport<Request, Receipt>) {
  const [state, setState] = useState<CommandState<Request>>({ name: "open", refusal: null });
  const frozen = useRef<Request | null>(null);
  const sending = useRef(false);
  const lifetime = useRef({ active: false });
  useLayoutEffect(() => {
    const mounted = { active: true };
    lifetime.current = mounted;
    return () => { mounted.active = false; };
  }, []);
  async function submit(build: () => Request | null): Promise<CommandOutcome | undefined> {
    const mounted = lifetime.current;
    if (!mounted.active || sending.current) return;
    const request = frozen.current ?? build();
    if (!request) return;
    frozen.current = request;
    sending.current = true;
    setState({ name: "sending" });
    try {
      const receipt = await transport.send(request);
      if (!mounted.active) return;
      frozen.current = null;
      setState({ name: "open", refusal: null });
      transport.onDone(receipt);
      return "done";
    } catch (caught) {
      const handled = transport.reportFailure(caught);
      if (!mounted.active) return;
      const code = handled ? null : (transport.refusalCode ?? refusalCodeOf)(caught);
      if (code !== null) {
        frozen.current = null;
        setState({ name: "open", refusal: { code, request } });
        return "refused";
      }
      setState({ name: "uncertain" });
      return "uncertain";
    } finally {
      sending.current = false;
    }
  }
  return {
    state,
    busy: state.name === "sending",
    frozen: state.name !== "open",
    canEdit: () => lifetime.current.active && !sending.current && !frozen.current,
    submit,
    /** Drops an unknown outcome once the caller has re-read what the server now holds. */
    release: () => {
      if (sending.current) return;
      frozen.current = null;
      setState({ name: "open", refusal: null });
    },
  };
}
