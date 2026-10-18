import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useAttention } from "./useAttention";

const source = vi.hoisted(() => ({
  drafts: { count: 2 as number | null, monthCount: 1 as number | null,
    items: [{ status: "editing" }, { status: "posting" }], error: "" },
  intake: { count: 0 as number | null, now: [], wait: [], ready: [], error: "" },
  recovery: { currency: "COP", plans: [{ dueMinorUnits: 10_000 }] } as
    { currency: string; plans: { dueMinorUnits: number }[] } | undefined,
  query: vi.fn(),
  month: "2026-10",
}));
vi.mock("../useLocalEntryDrafts", () => ({ useLocalEntryDrafts: () => source.drafts }));
vi.mock("../useIntakeCandidates", () => ({ useIntakeCandidates: () => source.intake }));
vi.mock("../useWorkspaceCalendar", () => ({ useWorkspaceCalendar: () => ({ month: source.month }) }));
vi.mock("convex/react", () => ({ useQuery: (...args: unknown[]) => {
  source.query(...args);
  return source.recovery;
} }));

let root: ReactTestRenderer;
let result: ReturnType<typeof useAttention>;
const input: Parameters<typeof useAttention>[0] = {
  subject: "owner", workspaceId: "workspace", currency: "COP", timeZone: "America/Bogota",
  currentPeriod: { year: 2026, month: 10, status: "open" },
};
function Harness({ value = input }: { value?: typeof input }) {
  result = useAttention(value);
  return null;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  source.drafts = { count: 2, monthCount: 1, items: [{ status: "editing" }, { status: "posting" }], error: "" };
  source.intake = { count: 0, now: [], wait: [], ready: [], error: "" };
  source.recovery = { currency: "COP", plans: [{ dueMinorUnits: 10_000 }] };
  source.month = "2026-10";
  source.query.mockClear();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.unstubAllGlobals();
});

test("attention uses month-specific blockers while the badge counts the whole inbox", async () => {
  await act(async () => { root = create(createElement(Harness)); });
  expect(result.inboxCount).toBe(2);
  expect(result.alerts.kind).toBe("ready");
  if (result.alerts.kind !== "ready") throw new Error("Expected ready alerts");
  expect(result.alerts.rows.map((row) => [row.title, row.detail])).toEqual([
    ["Review Drafts", "2 on this device"],
    ["Recovery due", "COP 100,00 across 1 plan"],
    ["Complete October", "1 dated Drafts need review first"],
  ]);
  expect(result.alerts.rows[0].destination).toEqual({ pathname: "/drafts", params: { segment: "now" } });
  source.month = "2026-11";
  await act(async () => { root.update(createElement(Harness)); });
  expect(source.query.mock.lastCall?.[1]).toEqual({ workspaceId: "workspace", month: "2026-11" });
  if (result.alerts.kind !== "ready") throw new Error("Expected ready alerts");
  expect(result.alerts.rows.at(-1)?.destination).toEqual({ pathname: "/month-close", params: { month: "2026-10" } });
});

test("unknown and failed local reads hide stale badges, then successful reads clear resolved alerts", async () => {
  source.intake.count = null;
  await act(async () => { root = create(createElement(Harness)); });
  expect(result).toEqual({ inboxCount: undefined, alerts: { kind: "loading" } });
  source.intake.count = 0;
  source.intake.error = "Could not load Candidates on this device.";
  await act(async () => { root.update(createElement(Harness)); });
  expect(result).toEqual({ inboxCount: undefined, alerts: { kind: "error", message: "Could not load Candidates on this device." } });
  source.intake.error = "";
  source.drafts = { count: 0, monthCount: 0, items: [], error: "" };
  source.recovery = { currency: "COP", plans: [{ dueMinorUnits: 0 }] };
  await act(async () => { root.update(createElement(Harness, { value: { ...input, currentPeriod: { ...input.currentPeriod, status: "locked" } } })); });
  expect(result).toEqual({ inboxCount: 0, alerts: { kind: "ready", rows: [] } });
});

test("Recovery loading keeps the known inbox badge and withholds the alert total", async () => {
  source.recovery = undefined;
  await act(async () => { root = create(createElement(Harness)); });
  expect(result).toEqual({ inboxCount: 2, alerts: { kind: "loading" } });
});
