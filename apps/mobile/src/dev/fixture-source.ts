import { createPostedActivitySource } from "../modules/posted-activity/source";
import type { PostedUpdate } from "../modules/posted-activity/source";

export function createFixtureActivity() {
  let receive: ((update: PostedUpdate) => void) | undefined;
  let revision = 0;
  let currentWorkspace = "fixture-a";
  let starts = 0;
  let stops = 0;
  const rows = (workspaceId: string) => [
    {
      id: "fixture-entry",
      title: `${revision === 0 ? "Example groceries" : "Example updated groceries"} · ${workspaceId === "fixture-a" ? "A" : "B"}`,
      supporting: "UI fixture · Oct 13 · Food",
      signedAmount: revision === 0 ? "-$24.00" : "-$28.00",
    },
  ];
  const source = createPostedActivitySource({
    subscribe: (workspaceId, callback) => {
      starts += 1;
      currentWorkspace = workspaceId;
      receive = callback;
      const timer = setTimeout(
        () => callback({ kind: "ready", rows: rows(workspaceId) }),
        1000,
      );
      return () => {
        clearTimeout(timer);
        stops += 1;
        receive = undefined;
      };
    },
  });
  return {
    source,
    workspace: () => currentWorkspace,
    connect: (workspaceId: string) =>
      source.setScope({ kind: "connected", workspaceId }),
    offline: () => receive?.({ kind: "offline" }),
    update: () => {
      revision += 1;
      receive?.({ kind: "ready", rows: rows(currentWorkspace) });
    },
    counts: () => ({ starts, stops }),
  };
}
