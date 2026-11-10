import { ConvexError } from "convex/values";
import { getFunctionName } from "convex/server";
import { expect, test, vi } from "vitest";

vi.mock("expo-constants", () => ({ default: { expoConfig: { version: "0.1.0" } } }));
vi.mock("react-native", () => ({ Platform: { OS: "ios", Version: "18.4" } }));

import { ScreenshotNotStored, SendTimeout } from "./report";
import { classifySendError, convexFeedbackTransport, deviceContext, screenName } from "./transport";
import { validateReport } from "./validation";

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
  [{ code: "invalid_report", field: "screenshot" }, { code: "invalid_report", field: "screenshot" }],
  [{ code: "rate_limited", retryAfterMs: 60_000 }, { code: "rate_limited", retryAt: 65_000 }],
  [{ code: "changed_report" }, { code: "changed_report" }],
  [{ code: "destination_unavailable" }, { code: "unknown" }],
  [{ code: "report_expired" }, { code: "report_expired" }],
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

test("network failures, timeouts and a mismatched attach are outcomes to retry with the same key", () => {
  expect(classify(new TypeError("Network request failed")).failure).toEqual({ code: "unknown" });
  expect(classify(new SendTimeout())).toEqual({ failure: { code: "unknown" }, seen: [] });
  expect(classify(new ScreenshotNotStored())).toEqual({ failure: { code: "unknown" }, seen: [] });
});

test("the backend calls go to feedback.destination, attachScreenshot, removeScreenshot and submit", async () => {
  const seen: [string, string, unknown][] = [];
  const client = {
    query: async (ref: never, args: unknown) => void seen.push(["query", getFunctionName(ref), args]),
    mutation: async (ref: never, args: unknown) => void seen.push(["mutation", getFunctionName(ref), args]),
    action: async (ref: never, args: unknown) => void seen.push(["action", getFunctionName(ref), args]),
  };
  const transport = convexFeedbackTransport(client as never);
  const image = new TextEncoder().encode("png-bytes").buffer as ArrayBuffer;
  await transport.destination();
  await transport.attachScreenshot({ reportKey: "report-1", image });
  await transport.removeScreenshot({ reportKey: "report-1" });
  const context = { appVersion: "0.1.0", platform: "ios", osVersion: "18.4", language: "es" } as const;
  const digest = "ea80334363eed145dfeee51ebae7dc3f1cd7d0c7879f8bfd2070c061d3c33f56";
  await transport.submit({ reportKey: "report-1", kind: "bug", title: "Title", whatHappened: "Text", screenshotSha256: digest, context });
  expect(seen).toEqual([
    ["query", "feedback:destination", {}],
    ["action", "feedback:attachScreenshot", { reportKey: "report-1", image }],
    ["mutation", "feedback:removeScreenshot", { reportKey: "report-1" }],
    [
      "action",
      "feedback:submit",
      { reportKey: "report-1", kind: "bug", title: "Title", whatHappened: "Text", screenshotSha256: digest, context },
    ],
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
