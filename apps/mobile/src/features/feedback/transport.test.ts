import { ConvexError } from "convex/values";
import { getFunctionName } from "convex/server";
import { beforeEach, expect, test, vi } from "vitest";

const http = vi.hoisted(() => ({ fetch: vi.fn() }));
const fs = vi.hoisted(() => ({ current: null as null | ReturnType<typeof import("./fileSystem.testSupport").memoryFileSystem> }));
vi.mock("expo/fetch", () => http);
vi.mock("expo-file-system", async () => {
  const { memoryFileSystem } = await import("./fileSystem.testSupport");
  fs.current = memoryFileSystem();
  return fs.current.module;
});
vi.mock("expo-constants", () => ({ default: { expoConfig: { version: "0.1.0" } } }));
vi.mock("react-native", () => ({ Platform: { OS: "ios", Version: "18.4" } }));

import { SendTimeout } from "./report";
import { classifySendError, convexFeedbackTransport, deviceContext, screenName } from "./transport";
import { validateReport } from "./validation";

beforeEach(() => http.fetch.mockReset());

const classify = (error: unknown, wipe = false) => {
  const seen: unknown[] = [];
  const failure = classifySendError(error, {
    now: 5_000,
    reportAccessFailure: (value) => {
      seen.push(value);
      return wipe;
    },
  });
  return { failure, seen };
};

test.each([
  [{ code: "not_configured" }, { code: "not_configured" }],
  [{ code: "invalid_report", field: "title" }, { code: "invalid_report", field: "title" }],
  [{ code: "invalid_report", field: "accountNumber" }, { code: "invalid_report", field: null }],
  [{ code: "rate_limited", retryAfterMs: 60_000 }, { code: "rate_limited", retryAt: 65_000 }],
  [{ code: "changed_report" }, { code: "changed_report" }],
  [{ code: "destination_unavailable" }, { code: "unknown" }],
])("feedback error %j is shown as %j without the access handler", (data, expected) => {
  const { failure, seen } = classify(new ConvexError(data));
  expect(failure).toEqual(expected);
  expect(seen).toEqual([]);
});

test("device and session errors flow to the existing access-failure handling", () => {
  const revoked = new ConvexError({ code: "device_revoked", wipeLocalInput: true });
  expect(classify(revoked, true)).toEqual({ failure: { code: "access" }, seen: [revoked] });
  const inactive = new ConvexError({ code: "session_inactive" });
  expect(classify(inactive, false)).toEqual({ failure: { code: "unknown" }, seen: [inactive] });
});

test("network failures and timeouts are outcomes to retry with the same key", () => {
  expect(classify(new TypeError("Network request failed")).failure).toEqual({ code: "unknown" });
  expect(classify(new SendTimeout()).failure).toEqual({ code: "unknown" });
});

test("the upload posts the image bytes with its type and returns the storage id", async () => {
  new (fs.current!.module.File)("file:///cache/lukapp-feedback/shot.png").write("png-bytes");
  http.fetch.mockResolvedValue({ ok: true, json: async () => ({ storageId: "kg2abc" }) });
  const transport = convexFeedbackTransport({} as never);
  const result = await transport.upload("https://upload.example/1", {
    uri: "file:///cache/lukapp-feedback/shot.png", width: 1, height: 1, redacted: false,
  });
  expect(result).toEqual({ storageId: "kg2abc" });
  const [url, init] = http.fetch.mock.calls[0];
  expect(url).toBe("https://upload.example/1");
  expect(init.method).toBe("POST");
  expect(init.headers).toEqual({ "Content-Type": "image/png" });
  expect(new TextDecoder().decode(init.body)).toBe("png-bytes");
});

test("a rejected upload is a retryable failure, not a success", async () => {
  new (fs.current!.module.File)("file:///cache/lukapp-feedback/shot.png").write("png-bytes");
  http.fetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
  const transport = convexFeedbackTransport({} as never);
  const upload = transport.upload("https://upload.example/1", {
    uri: "file:///cache/lukapp-feedback/shot.png", width: 1, height: 1, redacted: false,
  });
  await expect(upload).rejects.toThrow("503");
  expect(classify(await upload.catch((error: unknown) => error)).failure).toEqual({ code: "unknown" });
});

test("the backend calls go to feedback.destination, prepareScreenshotUpload and submit", async () => {
  const seen: [string, string, unknown][] = [];
  const client = {
    query: async (ref: never, args: unknown) => void seen.push(["query", getFunctionName(ref), args]),
    mutation: async (ref: never, args: unknown) => void seen.push(["mutation", getFunctionName(ref), args]),
    action: async (ref: never, args: unknown) => void seen.push(["action", getFunctionName(ref), args]),
  };
  const transport = convexFeedbackTransport(client as never);
  await transport.destination();
  await transport.prepareScreenshotUpload({ reportKey: "report-1" });
  const context = { appVersion: "0.1.0", platform: "ios", osVersion: "18.4", language: "es" } as const;
  await transport.submit({ reportKey: "report-1", kind: "bug", title: "Title", whatHappened: "Text", context });
  expect(seen).toEqual([
    ["query", "feedback:destination", {}],
    ["mutation", "feedback:prepareScreenshotUpload", { reportKey: "report-1" }],
    ["action", "feedback:submit", { reportKey: "report-1", kind: "bug", title: "Title", whatHappened: "Text", context }],
  ]);
});

test("the automatic context is version, platform, system version and language only", () => {
  expect(deviceContext("es")).toEqual({ appVersion: "0.1.0", platform: "ios", osVersion: "18.4", language: "es" });
});

test("the screen is the route name without search parameters", () => {
  expect(screenName("/entry?draftId=abc123&workspaceId=w1")).toBe("/entry");
  expect(screenName("/settings")).toBe("/settings");
  expect(screenName("")).toBeNull();
});

test("form limits match the backend: title 3 to 120, what happened required, long fields up to 4000", () => {
  const ok = { title: "abc", whatHappened: "x", expected: "", steps: "" };
  expect(validateReport(ok)).toEqual({});
  expect(validateReport({ ...ok, title: " ab " })).toEqual({ title: "feedback.errorTitleShort" });
  expect(validateReport({ ...ok, title: "a".repeat(121) })).toEqual({ title: "feedback.errorTitleLong" });
  expect(validateReport({ ...ok, title: "a".repeat(120) })).toEqual({});
  expect(validateReport({ ...ok, whatHappened: "   " })).toEqual({ whatHappened: "feedback.errorWhatHappenedRequired" });
  expect(validateReport({ ...ok, whatHappened: "a".repeat(4001), steps: "a".repeat(4001), expected: "a".repeat(4000) })).toEqual({
    whatHappened: "feedback.errorTooLong",
    steps: "feedback.errorTooLong",
  });
});
