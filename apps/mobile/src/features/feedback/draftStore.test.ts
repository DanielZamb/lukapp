import * as SecureStore from "expo-secure-store";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { LocalInputLease } from "../../local-auth/localInput";
import { createReportDraftStore, readReportDraft, reportDraftKey, reportDraftTtlMs } from "./draftStore";
import type { Report } from "./report";

const store = new Map<string, string>();
const day = 24 * 60 * 60 * 1000;
const report: Report = {
  reportKey: "report-1",
  kind: "bug",
  fields: { title: "Balance looks wrong", whatHappened: "Totals differ", expected: "", steps: "" },
  origin: "shake",
  screen: "/history",
  screenshot: { uri: "file:///cache/lukapp-feedback/shot-1.png", width: 390, height: 844, redacted: false },
  captureFailed: false,
  screenshotChoice: "default",
  uploaded: null,
  context: null,
  frozen: false,
  createdAt: 10 * day,
};

beforeEach(() => {
  store.clear();
  vi.useFakeTimers();
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => store.get(key) ?? null);
  vi.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => {
    store.set(key, value);
  });
  vi.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
    store.delete(key);
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.mocked(SecureStore.setItemAsync).mockClear();
});

function open(lease = new LocalInputLease("owner", "session"), now = 10 * day) {
  const deleted: string[] = [];
  const drafts = createReportDraftStore({
    lease,
    now: () => now,
    deleteCapture: async (uri) => {
      deleted.push(uri);
    },
  });
  return { drafts, deleted, lease };
}

test("a saved report survives a restart under the owner's key, with its report key", async () => {
  const { drafts } = open();
  drafts.save(report);
  await drafts.flush();
  expect(JSON.parse(store.get("lukapp.feedback.report.owner") ?? "null")).toEqual({ v: 1, report });
  const restarted = open();
  expect(await restarted.drafts.read()).toEqual(report);
});

test("typing coalesces into one encrypted write of the latest text", async () => {
  const { drafts } = open();
  drafts.save({ ...report, fields: { ...report.fields, title: "Bal" } });
  drafts.save({ ...report, fields: { ...report.fields, title: "Balance" } });
  drafts.save(report);
  await vi.advanceTimersByTimeAsync(400);
  await drafts.flush();
  expect(vi.mocked(SecureStore.setItemAsync).mock.calls.map(([, value]) => JSON.parse(value).report.fields.title)).toEqual([
    "Balance looks wrong",
  ]);
});

test("discard removes the saved report, and a save still waiting cannot bring it back", async () => {
  const { drafts } = open();
  drafts.save(report);
  await drafts.flush();
  drafts.save({ ...report, fields: { ...report.fields, title: "Late edit" } });
  drafts.clear();
  await vi.advanceTimersByTimeAsync(1_000);
  await drafts.flush();
  expect(store.has(reportDraftKey("owner"))).toBe(false);
  expect(await drafts.read()).toBeNull();
});

test("a report saved seven days ago expires and takes its capture with it", async () => {
  const { drafts } = open();
  drafts.save(report);
  await drafts.flush();
  const almost = open(undefined, report.createdAt + reportDraftTtlMs - 1);
  expect(await almost.drafts.read()).toEqual(report);
  const expired = open(undefined, report.createdAt + reportDraftTtlMs);
  expect(await expired.drafts.read()).toBeNull();
  expect(expired.deleted).toEqual(["file:///cache/lukapp-feedback/shot-1.png"]);
  expect(store.has(reportDraftKey("owner"))).toBe(false);
});

test("an unreadable saved report is dropped instead of reopened", async () => {
  store.set(reportDraftKey("owner"), JSON.stringify({ v: 1, report: { ...report, kind: "complaint" } }));
  const deleted: string[] = [];
  expect(await readReportDraft("owner", 10 * day, async (uri) => void deleted.push(uri))).toBeNull();
  expect(store.has(reportDraftKey("owner"))).toBe(false);
  store.set(reportDraftKey("owner"), "{not json");
  expect(await readReportDraft("owner", 10 * day, async () => {})).toBeNull();
});

test("a report saved after access ended is never written", async () => {
  const lease = new LocalInputLease("owner", "session");
  const { drafts } = open(lease);
  lease.deny();
  drafts.save(report);
  await drafts.flush();
  expect(store.has(reportDraftKey("owner"))).toBe(false);
});

test("each signed-in owner has a separate saved report", async () => {
  const owner = open(new LocalInputLease("owner", "session"));
  owner.drafts.save(report);
  await owner.drafts.flush();
  const other = open(new LocalInputLease("someone-else", "session-2"));
  expect(await other.drafts.read()).toBeNull();
});
