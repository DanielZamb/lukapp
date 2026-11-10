import { useLayoutEffect, useRef, useState } from "react";
import { ConvexError } from "convex/values";
import { z } from "zod";

const refusal = z.object({ kind: z.union([z.literal("recovery"), z.literal("accounting")]), code: z.string() });

export type CommandTransport<Request, Receipt> = {
  send: (request: Request) => Promise<Receipt>;
  reportFailure: (error: unknown) => boolean;
  onDone: (receipt: Receipt) => void;
};

export type CommandState<Request> =
  | { name: "open"; refusal: { code: string; request: Request } | null }
  | { name: "sending" }
  | { name: "uncertain" };

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
  async function submit(build: () => Request | null) {
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
    } catch (caught) {
      const handled = transport.reportFailure(caught);
      if (!mounted.active) return;
      const parsed = handled ? null : refusal.safeParse(caught instanceof ConvexError ? caught.data : null);
      if (parsed?.success) {
        frozen.current = null;
        setState({ name: "open", refusal: { code: parsed.data.code, request } });
      } else setState({ name: "uncertain" });
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
  };
}
