import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, test, vi } from "vitest";
import { ConvexError } from "convex/values";
import { reversalPayload, useReversal, type ReversalTransport } from "./useReversal";

const receipt = {
  id: "reversal", policy: "reversal@1", description: "Reversal: Coffee", accountingDate: "2026-10-17",
  accountingPeriod: { year: 2026, month: 10, status: "open" }, amount: { currency: "COP", minorUnits: 500 },
  postedBy: "owner", postedAt: 1, replay: false, lines: [], reversesEntryId: "entry",
} satisfies Awaited<ReturnType<ReversalTransport["post"]>>;
function transport() {
  return { post: vi.fn<ReversalTransport["post"]>(async () => receipt), reportFailure: vi.fn(() => false) };
}
let root: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});
async function open(api: ReversalTransport, id = "entry") {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let result: ReturnType<typeof useReversal> | undefined;
  function Harness({ entryId }: { entryId: string }) { result = useReversal("workspace", entryId, api); return null; }
  await act(async () => { root = create(createElement(Harness, { entryId: id })); });
  return {
    current: () => { if (!result) throw new Error("Hook not mounted"); return result; },
    changeEntry: async (entryId: string) => { await act(async () => root?.update(createElement(Harness, { entryId }))); },
  };
}

test("reversal requires confirmation, supports cancellation, and blocks duplicate submission", async () => {
  const api = transport();
  const { current } = await open(api);
  await act(async () => { await current().confirm(); });
  expect(api.post).not.toHaveBeenCalled();
  await act(async () => current().request());
  expect(current().state.kind).toBe("confirming");
  await act(async () => current().cancel());
  expect(current().state.kind).toBe("idle");
  await act(async () => current().request());
  await act(async () => { await Promise.all([current().confirm(), current().confirm()]); });
  expect(api.post).toHaveBeenCalledExactlyOnceWith({
    workspaceId: "workspace", journalEntryId: "entry", idempotencyKey: "mobile-reversal@1:workspace:entry",
  });
  expect(current().state).toEqual({ kind: "posted", receipt });
});

test("an uncertain response retries the same payload and reopening retains the same correction identity", async () => {
  const api = transport();
  api.post.mockRejectedValueOnce(new Error("Lost response"));
  let page = await open(api);
  await act(async () => page.current().request());
  await act(async () => { await page.current().confirm(); });
  expect(page.current().state).toEqual({ kind: "failed", message: "Could not confirm the reversal. Retry to check the same correction safely." });
  await act(async () => { await page.current().confirm(); });
  expect(api.post.mock.calls.map(([payload]) => payload)).toEqual([
    reversalPayload("workspace", "entry"), reversalPayload("workspace", "entry"),
  ]);
  await act(async () => root?.unmount());
  page = await open(api);
  await act(async () => page.current().request());
  await act(async () => { await page.current().confirm(); });
  expect(api.post.mock.calls[2][0]).toEqual(api.post.mock.calls[0][0]);
});

test("late acknowledgements cannot update a different entry mounted in the same controller", async () => {
  const api = transport();
  let finish: ((value: typeof receipt) => void) | undefined;
  api.post.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const page = await open(api);
  await act(async () => page.current().request());
  let pending: Promise<void> | undefined;
  await act(async () => { pending = page.current().confirm(); });
  expect(page.current().state.kind).toBe("submitting");
  await page.changeEntry("another-entry");
  expect(page.current().state.kind).toBe("idle");
  await act(async () => { finish?.(receipt); await pending; });
  expect(page.current().state.kind).toBe("idle");
  await act(async () => page.current().request());
  await act(async () => { await page.current().confirm(); });
  expect(api.post.mock.calls[1][0].journalEntryId).toBe("another-entry");
});

test("unmount fences both late rejection reports and subsequent submission", async () => {
  const api = transport();
  let reject: ((reason: Error) => void) | undefined;
  api.post.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  const page = await open(api);
  await act(async () => page.current().request());
  let pending: Promise<void> | undefined;
  await act(async () => { pending = page.current().confirm(); });
  await act(async () => root?.unmount());
  await act(async () => { reject?.(new Error("old error")); await pending; await page.current().confirm(); });
  expect(api.reportFailure).not.toHaveBeenCalled();
  expect(api.post).toHaveBeenCalledOnce();
});

test("confirmed device denial belongs to U01 cleanup and accounting rejection is explained", async () => {
  const api = transport();
  const denial = new ConvexError({ code: "device_revoked", wipeLocalInput: true });
  api.reportFailure.mockReturnValueOnce(true);
  api.post.mockRejectedValueOnce(denial);
  let page = await open(api);
  await act(async () => page.current().request());
  await act(async () => { await page.current().confirm(); });
  expect(api.reportFailure).toHaveBeenCalledWith(denial);
  expect(page.current().state.kind).toBe("submitting");
  await act(async () => root?.unmount());
  api.post.mockRejectedValueOnce(new ConvexError({ kind: "accounting", code: "journal_entry_already_reversed" }));
  page = await open(api);
  await act(async () => page.current().request());
  await act(async () => { await page.current().confirm(); });
  expect(page.current().state).toEqual({ kind: "failed", message: "This entry already has a reversal. Open its linked reversal." });
});
