import { useLayoutEffect, useMemo, useRef } from "react";
import type { ConvexHttpClient } from "convex/browser";
import { requestScopedRpc } from "./request-scoped-rpc";

export function useSessionRpc(createClient: () => Promise<ConvexHttpClient>, signOut: () => Promise<void>) {
  const current = useRef({ createClient, signOut });
  useLayoutEffect(() => { current.current = { createClient, signOut }; }, [createClient, signOut]);
  return useMemo(() => ({
    rpc: requestScopedRpc(() => current.current.createClient()),
    signOut: () => current.current.signOut(),
  }), []);
}
