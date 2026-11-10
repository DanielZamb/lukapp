import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ timeZone: "America/Bogota", months: [] as string[] }));
vi.mock("react-native", () => ({
  AppState: { currentState: "active", addEventListener: () => ({ remove: () => {} }) },
}));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useQuery: (reference: Parameters<typeof getFunctionName>[0], args: { month?: string }) => {
      const name = getFunctionName(reference);
      if (name === "accounting:personalDefaults") return { workspace: { id: "ws", timeZone: state.timeZone } };
      if (name === "accounting:postedActivity") { state.months.push(args.month!); return { accounts: [] }; }
      throw new Error(`Unexpected query ${name}`);
    },
  };
});

import { usePersonalDefaults, usePostedActivity } from "../activity";
import { useWorkspaceCalendar } from "../useWorkspaceCalendar";

let root: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("today and the month asked of the server follow a zone change in the defaults read without a restart", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-31T10:00:00-05:00"));
  let today = "";
  function Home() {
    const defaults = usePersonalDefaults()!;
    usePostedActivity(defaults.workspace.id, defaults.workspace.timeZone);
    today = useWorkspaceCalendar(defaults.workspace.timeZone).date;
    return null;
  }
  await act(async () => { root = create(createElement(Home)); });
  expect([today, state.months.at(-1)]).toEqual(["2026-10-31", "2026-10"]);
  vi.setSystemTime(new Date("2026-10-31T20:00:00-05:00"));
  state.timeZone = "Europe/Madrid";
  await act(async () => { root?.update(createElement(Home)); });
  expect([today, state.months.at(-1)]).toEqual(["2026-11-01", "2026-11"]);
  state.timeZone = "America/Bogota";
  await act(async () => { root?.update(createElement(Home)); });
  expect([today, state.months.at(-1)]).toEqual(["2026-10-31", "2026-10"]);
});
