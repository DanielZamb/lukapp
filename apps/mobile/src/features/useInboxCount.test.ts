import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useInboxCount } from "./useInboxCount";

const source = vi.hoisted((): {
  drafts: { count: number | null; error: string };
  intake: { count: number | null; error: string };
} => ({ drafts: { count: 2, error: "" }, intake: { count: 3, error: "" } }));
vi.mock("./useLocalEntryDrafts", () => ({ useLocalEntryDrafts: () => source.drafts }));
vi.mock("./useIntakeCandidates", () => ({ useIntakeCandidates: () => source.intake }));

let root: ReactTestRenderer;
let count: number | undefined;
function Harness() {
  count = useInboxCount({ subject: "owner", workspaceId: "workspace", currency: "COP" });
  return null;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  source.drafts = { count: 2, error: "" };
  source.intake = { count: 3, error: "" };
});
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.unstubAllGlobals();
});

test("the Drafts badge counts the whole inbox and clears after review", async () => {
  await act(async () => { root = create(createElement(Harness)); });
  expect(count).toBe(5);
  source.drafts.count = 0;
  source.intake.count = 0;
  await act(async () => root.update(createElement(Harness)));
  expect(count).toBe(0);
});

test.each(["drafts", "intake"] as const)("an unknown or failed %s read hides a stale inbox badge", async (kind) => {
  source[kind].count = null;
  await act(async () => { root = create(createElement(Harness)); });
  expect(count).toBeUndefined();
  source[kind].count = 3;
  source[kind].error = "Could not read local input";
  await act(async () => root.update(createElement(Harness)));
  expect(count).toBeUndefined();
  source[kind].error = "";
  await act(async () => root.update(createElement(Harness)));
  expect(count).toBe(kind === "drafts" ? 6 : 5);
});
