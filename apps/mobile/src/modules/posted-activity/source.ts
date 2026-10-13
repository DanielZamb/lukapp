export type PostedActivityRow = Readonly<{
  id: string;
  title: string;
  supporting: string;
  signedAmount: string;
}>;
export type PostedSnapshot =
  | {
      kind: "unavailable";
      reason: "no-workspace" | "offline" | "signed-out" | "inactive";
    }
  | { kind: "loading"; workspaceId: string }
  | { kind: "ready"; workspaceId: string; rows: readonly PostedActivityRow[] }
  | { kind: "failed"; workspaceId: string; message: string };
export type PostedUpdate =
  | { kind: "ready"; rows: readonly PostedActivityRow[] }
  | { kind: "offline" }
  | { kind: "failed"; message: string };
export type PostedTransport = {
  subscribe: (
    workspaceId: string,
    receive: (update: PostedUpdate) => void,
  ) => () => void;
};
export type PostedScope =
  | { kind: "connected"; workspaceId: string }
  | { kind: "unavailable"; reason: "no-workspace" | "offline" | "signed-out" };

const inactive: PostedSnapshot = { kind: "unavailable", reason: "inactive" };

export function createPostedActivitySource(transport: PostedTransport) {
  let scope: PostedScope = { kind: "unavailable", reason: "no-workspace" };
  let snapshot: PostedSnapshot = {
    kind: "unavailable",
    reason: "no-workspace",
  };
  let generation = 0;
  let stop: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const detach = () => {
    generation += 1;
    const previous = stop;
    stop = undefined;
    previous?.();
  };
  const start = () => {
    if (scope.kind === "unavailable") {
      snapshot = { ...scope };
      notify();
      return;
    }
    if (listeners.size === 0) {
      snapshot = inactive;
      return;
    }
    const workspaceId = scope.workspaceId;
    const current = ++generation;
    snapshot = { kind: "loading", workspaceId };
    notify();
    try {
      const unsubscribe = transport.subscribe(workspaceId, (update) => {
        if (current !== generation) return;
        if (update.kind === "offline") {
          scope = { kind: "unavailable", reason: "offline" };
          detach();
          snapshot = { ...scope };
        } else if (update.kind === "failed")
          snapshot = { kind: "failed", workspaceId, message: update.message };
        else snapshot = { kind: "ready", workspaceId, rows: update.rows };
        notify();
      });
      if (current === generation) stop = unsubscribe;
      else unsubscribe();
    } catch {
      if (current === generation) {
        snapshot = {
          kind: "failed",
          workspaceId,
          message: "Activity could not load. Please try again.",
        };
        notify();
      }
    }
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          detach();
          snapshot = inactive;
        }
      };
    },
    setScope(next: PostedScope) {
      if (
        next.kind === scope.kind &&
        (next.kind === "connected" && scope.kind === "connected"
          ? next.workspaceId === scope.workspaceId
          : next.kind === "unavailable" &&
            scope.kind === "unavailable" &&
            next.reason === scope.reason)
      )
        return;
      detach();
      scope = next;
      start();
    },
  };
}
export type PostedActivitySource = ReturnType<
  typeof createPostedActivitySource
>;
