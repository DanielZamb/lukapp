import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, test, vi } from "vitest";
import { useWorkspaceCalendar } from "./useWorkspaceCalendar";

const listeners = new Set<(state: "active" | "background") => void>();
vi.mock("react-native", () => ({
  AppState: {
    currentState: "active",
    addEventListener: (
      _event: string,
      listener: (state: "active" | "background") => void,
    ) => {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  },
}));

let root: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  listeners.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mount(timeZone: string) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let calendar: ReturnType<typeof useWorkspaceCalendar> | undefined;
  function Harness() {
    calendar = useWorkspaceCalendar(timeZone);
    return null;
  }
  await act(async () => {
    root = create(createElement(Harness));
  });
  return () => {
    if (!calendar) throw new Error("Calendar not mounted");
    return calendar;
  };
}

test("Budget and Home roll to the next Workspace month at midnight and on foreground", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-31T23:30:00-05:00"));
  const calendar = await mount("America/Bogota");
  expect(calendar().month).toBe("2026-10");
  expect(calendar().date).toBe("2026-10-31");
  await act(async () => {
    vi.advanceTimersByTime(30 * 60 * 1000 + 1);
  });
  expect(calendar().month).toBe("2026-11");
  expect(calendar().date).toBe("2026-11-01");
  vi.setSystemTime(new Date("2026-12-01T05:00:00.000Z"));
  await act(async () => {
    for (const listener of listeners) listener("active");
  });
  expect(calendar().month).toBe("2026-12");
});
