import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, test, vi } from "vitest";
import { ConvexError } from "convex/values";
import { evaluateMonthClose, type MonthCloseReadiness } from "./model";
import { useMonthClose, type MonthCloseTransport } from "./useMonthClose";

const october = { year: 2026, month: 10 };
function ready(
  overrides: Partial<{
    periodStatus: MonthCloseReadiness["periodStatus"];
    draftCount: number;
    candidateCount: number;
  }> = {},
): MonthCloseReadiness {
  return evaluateMonthClose({
    period: october,
    periodStatus: "open",
    draftCount: 0,
    candidateCount: 0,
    ...overrides,
  });
}
function transport() {
  return {
    lock: vi.fn<MonthCloseTransport["lock"]>(async () => undefined),
    reportFailure: vi.fn(() => false),
  };
}
let root: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});
async function open(
  api: MonthCloseTransport,
  readiness: MonthCloseReadiness | null = ready(),
) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let result: ReturnType<typeof useMonthClose> | undefined;
  function Harness({ value }: { value: MonthCloseReadiness | null }) {
    result = useMonthClose("workspace", value, api);
    return null;
  }
  await act(async () => {
    root = create(createElement(Harness, { value: readiness }));
  });
  return {
    current: () => {
      if (!result) throw new Error("Hook not mounted");
      return result;
    },
    change: async (value: MonthCloseReadiness | null) => {
      await act(async () =>
        root?.update(createElement(Harness, { value })),
      );
    },
  };
}

test("a dated draft blocks close so lock is never sent", async () => {
  const api = transport();
  const page = await open(api, ready({ draftCount: 1 }));
  expect(page.current().phase).toEqual({ kind: "review" });
  await act(async () => page.current().request());
  await act(async () => {
    await page.current().confirm();
  });
  expect(page.current().phase).toEqual({ kind: "review" });
  expect(api.lock).not.toHaveBeenCalled();
});

test("Candidates warn but still allow one lock of the month", async () => {
  const api = transport();
  const page = await open(api, ready({ candidateCount: 2 }));
  expect(page.current().phase).toEqual({ kind: "review" });
  await act(async () => page.current().request());
  expect(page.current().phase).toEqual({ kind: "confirm" });
  await act(async () => page.current().cancel());
  expect(page.current().phase).toEqual({ kind: "review" });
  await act(async () => page.current().request());
  await act(async () => {
    await Promise.all([page.current().confirm(), page.current().confirm()]);
  });
  expect(api.lock).toHaveBeenCalledExactlyOnceWith({
    workspaceId: "workspace",
    period: october,
  });
  expect(page.current().phase).toEqual({ kind: "closed" });
});

test("an uncertain lock retries the same month and a second success is still closed", async () => {
  const api = transport();
  api.lock.mockRejectedValueOnce(new Error("Lost response"));
  const page = await open(api);
  await act(async () => page.current().request());
  await act(async () => {
    await page.current().confirm();
  });
  expect(page.current().phase).toEqual({
    kind: "failed",
    message: "Could not confirm the close. Retry to lock the same month safely.",
  });
  await act(async () => {
    await page.current().confirm();
  });
  expect(api.lock.mock.calls.map(([input]) => input)).toEqual([
    { workspaceId: "workspace", period: october },
    { workspaceId: "workspace", period: october },
  ]);
  expect(page.current().phase).toEqual({ kind: "closed" });
});

test("a month that is already locked opens finished and never calls lock", async () => {
  const api = transport();
  const page = await open(
    api,
    ready({ periodStatus: "locked", draftCount: 1 }),
  );
  expect(page.current().phase).toEqual({ kind: "closed" });
  await act(async () => page.current().request());
  await act(async () => {
    await page.current().confirm();
  });
  expect(api.lock).not.toHaveBeenCalled();
});

test("a draft that appears before lock returns the review and device denial stays locking", async () => {
  const api = transport();
  const page = await open(api);
  await act(async () => page.current().request());
  expect(page.current().phase).toEqual({ kind: "confirm" });
  await page.change(ready({ draftCount: 1 }));
  expect(page.current().phase).toEqual({ kind: "review" });
  const denial = new ConvexError({ code: "device_revoked", wipeLocalInput: true });
  api.reportFailure.mockReturnValueOnce(true);
  api.lock.mockRejectedValueOnce(denial);
  await page.change(ready());
  await act(async () => page.current().request());
  await act(async () => {
    await page.current().confirm();
  });
  expect(api.reportFailure).toHaveBeenCalledWith(denial);
  expect(page.current().phase).toEqual({ kind: "locking" });
});
