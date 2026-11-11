import { createHash } from "node:crypto";
import { ConvexError } from "convex/values";
import * as SecureStore from "expo-secure-store";
import { afterEach, expect, test, vi } from "vitest";
import { LocalInputLease } from "../../local-auth/localInput";
import { createReportDraftStore } from "./draftStore";
import {
  ReportMachine,
  type Audience,
  type Report,
  type ReportDraftStore,
  type Screenshot,
  type SubmitArgs,
} from "./report";
import { classifySendError } from "./transport";

vi.mock("expo-constants", () => ({ default: { expoConfig: { version: "0.1.0" } } }));
vi.mock("react-native", () => ({ Platform: { OS: "android", Version: 35 } }));
vi.mock("../api", () => ({ api: {} }));

afterEach(() => {
  vi.useRealTimers();
});

const sha256 = (content: string) => createHash("sha256").update(content).digest("hex");
const shot: Screenshot = { uri: "file:///cache/lukapp-feedback/shot-1.png", width: 390, height: 844, redacted: false };
const redacted: Screenshot = { ...shot, uri: "file:///cache/lukapp-feedback/flat-1.png" };
const original = "original screen with a balance";
const blackedOut = "screen with the balance blacked out";
const sent = { reference: "LK-7Q2", issueNumber: 123, url: "https://github.com/owner/lukapp/issues/123" };
const context = { appVersion: "0.1.0", platform: "android", osVersion: "35", language: "en" } as const;

/** The phone's encrypted storage, read back the way a restarted app reads it. */
function phoneStorage() {
  const secure = new Map<string, string>();
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async (key) => secure.get(key) ?? null);
  vi.mocked(SecureStore.setItemAsync).mockImplementation(async (key, value) => void secure.set(key, value));
  vi.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => void secure.delete(key));
  return {
    saved: (): Report | null => JSON.parse(secure.get("lukapp.feedback.report.owner") ?? "null")?.report ?? null,
    open: (deleteCapture: (uri: string) => Promise<void>) =>
      createReportDraftStore({ lease: new LocalInputLease("owner", "session"), now: () => 1_000, deleteCapture }),
  };
}

/**
 * A phone with capture files and a backend that keeps one image per report key and,
 * like the real one, publishes an image only when its digest matches the submitted one.
 */
function harness({
  audience = "private" as Audience,
  stored = null as Report | null,
  capture = shot as Screenshot | null,
  phone = null as ReturnType<typeof phoneStorage> | null,
} = {}) {
  const files = new Map<string, string>([[shot.uri, original]]);
  const server = new Map<string, string>();
  const calls: string[] = [];
  const deleted: string[] = [];
  const saved: Report[] = [];
  const submitted: SubmitArgs[] = [];
  const published: string[] = [];
  const accessFailures: unknown[] = [];
  const memory = { stored, cleared: 0 };
  const gate = { allowed: true };
  let offline = false;
  let language: "en" | "es" = "en";
  let keys = 0;
  const transport = {
    attachScreenshot: vi.fn(async ({ reportKey, image }: { reportKey: string; image: ArrayBuffer }) => {
      const content = new TextDecoder().decode(image);
      calls.push(`attach ${reportKey} ${content}`);
      server.set(reportKey, content);
      return { sha256: sha256(content) };
    }),
    removeScreenshot: vi.fn(async ({ reportKey }: { reportKey: string }): Promise<null> => {
      calls.push(`remove ${reportKey}`);
      server.delete(reportKey);
      return null;
    }),
    submit: vi.fn(async (args: SubmitArgs) => {
      calls.push(`submit ${args.reportKey}`);
      submitted.push(args);
      if (args.screenshotSha256) {
        const image = server.get(args.reportKey);
        if (image === undefined || sha256(image) !== args.screenshotSha256)
          throw new ConvexError({ code: "invalid_report", field: "screenshot" });
        published.push(image);
      }
      return sent;
    }),
  };
  const phaseAtCapture: string[] = [];
  const captures: (() => Promise<Screenshot | null>)[] = [];
  const deleteCapture = async (uri: string) => {
    deleted.push(uri);
    files.delete(uri);
  };
  const memoryDrafts: ReportDraftStore = {
    read: async () => memory.stored,
    save: (report) => {
      memory.stored = report;
      saved.push(report);
    },
    saveNow: async (report) => {
      memory.stored = report;
      saved.push(report);
    },
    clear: () => {
      memory.stored = null;
      memory.cleared++;
    },
  };
  const boot = (): ReportMachine =>
    new ReportMachine({
      newKey: () => `report-${++keys}`,
      now: () => 1_000,
      capture: async () => {
        phaseAtCapture.push(current.getSnapshot().phase.kind);
        return captures.shift()?.() ?? capture;
      },
      captureAllowed: () => gate.allowed,
      readScreenshot: async (uri) => {
        const content = files.get(uri);
        if (content === undefined) return null;
        return { bytes: new TextEncoder().encode(content).buffer as ArrayBuffer, sha256: sha256(content) };
      },
      deleteCapture,
      drafts: phone ? phone.open(deleteCapture) : memoryDrafts,
      transport,
      context: () => ({ ...context, language }),
      isOffline: () => offline,
      classify: (error) =>
        classifySendError(error, {
          now: 1_000,
          reportAccessFailure: (failure) => {
            accessFailures.push(failure);
            return failure instanceof ConvexError && (failure.data as { wipeLocalInput?: boolean }).wipeLocalInput === true;
          },
        }),
      timeoutMs: 20,
    });
  let current = boot();
  const configure = (machine: ReportMachine) =>
    machine.setDestination({ configured: true, repository: "owner/lukapp", audience, screenshotRetentionDays: 30 });
  configure(current);
  const phase = () => current.getSnapshot().phase;
  const report = () => {
    const now = phase();
    if (now.kind !== "editing" && now.kind !== "failed" && now.kind !== "sending")
      throw new Error(`No report in ${now.kind}`);
    return now.report;
  };
  return {
    get machine() {
      return current;
    },
    /** The app process dies: debounced writes that haven't run are lost; files and the server remain. */
    restart() {
      vi.clearAllTimers();
      current = boot();
      configure(current);
    },
    transport, calls, deleted, saved, drafts: memory, submitted, published, accessFailures, phaseAtCapture,
    files, server, gate, captures, phase, report,
    write: () => {
      current.edit("title", "Balance looks wrong");
      current.edit("whatHappened", "Home shows a different total than Overview.");
    },
    /** The backend receives the next submit and answers with this error. */
    failNextSubmit: (error: Record<string, string | number | boolean> | Error) =>
      transport.submit.mockImplementationOnce(async (args) => {
        calls.push(`submit ${args.reportKey}`);
        submitted.push(args);
        throw error instanceof Error ? error : new ConvexError(error);
      }),
    goOffline: (value: boolean) => { offline = value; },
    setLanguage: (value: "en" | "es") => { language = value; },
  };
}

function held<T>() {
  let release: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

const flushed = async () => {
  for (let index = 0; index < 20; index++) await Promise.resolve();
};

test("a shake captures the screen before any report UI exists, and opening sends nothing", async () => {
  const h = harness();
  await h.machine.open("shake", "/history");
  expect(h.phaseAtCapture).toEqual(["capturing"]);
  expect(h.phase().kind).toBe("editing");
  expect(h.report()).toMatchObject({ reportKey: "report-1", screenshot: shot, screen: "/history", captureFailed: false });
  expect(h.calls).toEqual([]);
});

test("the menu opens a text report without capturing the caller screen", async () => {
  const h = harness();
  await h.machine.open("menu", "/settings");
  expect(h.phaseAtCapture).toEqual([]);
  expect(h.report()).toMatchObject({ screenshot: null, captureFailed: false, origin: "menu" });
});

test("a capture that is unavailable or blank continues as a text-only report", async () => {
  const h = harness({ capture: null });
  await h.machine.open("shake", "/history");
  expect(h.report()).toMatchObject({ screenshot: null, captureFailed: true });
  h.write();
  await h.machine.send();
  expect(h.calls).toEqual(["submit report-1"]);
});

test("a shake while capture isn't allowed never captures and continues as text only", async () => {
  const h = harness();
  h.gate.allowed = false;
  await h.machine.open("shake", "/history");
  expect(h.phaseAtCapture).toEqual([]);
  expect(h.report()).toMatchObject({ screenshot: null, captureFailed: true });
});

test("a capture that finishes after the app left the foreground or access ended is deleted and opens nothing", async () => {
  const h = harness();
  const capture = held<Screenshot | null>();
  h.captures.push(() => capture.promise);
  const opening = h.machine.open("shake", "/history");
  await flushed();
  expect(h.phase().kind).toBe("capturing");
  h.gate.allowed = false;
  capture.release(shot);
  await opening;
  expect(h.phase().kind).toBe("idle");
  expect(h.deleted).toEqual([shot.uri]);
  expect(h.files.has(shot.uri)).toBe(false);
  expect(h.calls).toEqual([]);
  h.gate.allowed = true;
  await h.machine.open("menu", "/history");
  expect(h.report().reportKey).toBe("report-1");
});

test("cancel with nothing typed deletes the capture, clears the draft and touches no network", async () => {
  const h = harness();
  await h.machine.open("shake", "/history");
  h.machine.requestCancel();
  await Promise.resolve();
  expect(h.phase().kind).toBe("idle");
  expect(h.deleted).toEqual([shot.uri]);
  expect(h.drafts.stored).toBeNull();
  expect(h.calls).toEqual([]);
});

test("cancel with typed text asks first; keep editing returns with the text, discard deletes everything", async () => {
  const h = harness();
  await h.machine.open("shake", "/history");
  h.write();
  expect(h.drafts.stored?.fields.title).toBe("Balance looks wrong");
  h.machine.requestCancel();
  expect(h.phase()).toMatchObject({ kind: "editing", confirm: "discard" });
  h.machine.dismissConfirm();
  expect(h.phase()).toMatchObject({ kind: "editing", confirm: null });
  expect(h.report().fields.title).toBe("Balance looks wrong");
  h.machine.requestCancel();
  await h.machine.discard();
  expect(h.phase().kind).toBe("idle");
  expect(h.deleted).toEqual([shot.uri]);
  expect(h.drafts.stored).toBeNull();
  expect(h.calls).toEqual([]);
});

test("shake, open, edit, black out, cancel, practice and resume never reach the server; only Send does", async () => {
  const h = harness();
  await h.machine.open("shake", "/history");
  h.write();
  h.machine.setKind("feedback");
  h.machine.setScreenshotIncluded(false);
  h.machine.setScreenshotIncluded(true);
  h.files.set(redacted.uri, blackedOut);
  await h.machine.replaceScreenshot(redacted);
  await h.machine.removeScreenshot();
  h.machine.requestCancel();
  h.machine.dismissConfirm();
  await h.machine.dispose();
  h.files.set(shot.uri, original);
  await h.machine.open("shake", "/history");
  expect(h.phase().kind).toBe("resuming");
  await h.machine.resume();
  h.machine.requestCancel();
  await h.machine.discard();
  h.machine.openPractice();
  h.write();
  await h.machine.send();
  await h.machine.discard();
  expect(h.calls).toEqual([]);
});

test("Send attaches the previewed bytes first, then submits their digest", async () => {
  const h = harness({ audience: "private" });
  await h.machine.open("shake", "/history");
  h.write();
  await h.machine.send();
  expect(h.calls).toEqual([`attach report-1 ${original}`, "submit report-1"]);
  expect(h.submitted).toEqual([
    {
      reportKey: "report-1",
      kind: "bug",
      title: "Balance looks wrong",
      whatHappened: "Home shows a different total than Overview.",
      screenshotSha256: "95f7990a003d03ddc4db4ce1c066595bc59a036b95645c315e9382694aa28942",
      context: { appVersion: "0.1.0", platform: "android", osVersion: "35", language: "en", screen: "/history" },
    },
  ]);
  expect(h.published).toEqual([original]);
  expect(h.phase()).toEqual({ kind: "sent", result: sent });
  expect(h.deleted).toEqual([shot.uri]);
  expect(h.drafts.stored).toBeNull();
});

test("a blacked-out screenshot is the one attached and published", async () => {
  const h = harness();
  await h.machine.open("shake", "/history");
  h.write();
  h.files.set(redacted.uri, blackedOut);
  await h.machine.replaceScreenshot(redacted);
  expect(h.deleted).toEqual([shot.uri]);
  expect(h.report().screenshot).toEqual({ ...redacted, redacted: true });
  await h.machine.send();
  expect(h.calls).toEqual([`attach report-1 ${blackedOut}`, "submit report-1"]);
  expect(h.submitted[0].screenshotSha256).toBe(sha256(blackedOut));
  expect(h.published).toEqual([blackedOut]);
});

test("send without a screenshot calls only submit, with no digest", async () => {
  const h = harness();
  await h.machine.open("menu", "/settings");
  h.write();
  h.machine.edit("expected", "  Same total  ");
  await h.machine.send();
  expect(h.calls).toEqual(["submit report-1"]);
  expect(h.submitted[0]).toEqual({
    reportKey: "report-1",
    kind: "bug",
    title: "Balance looks wrong",
    whatHappened: "Home shows a different total than Overview.",
    expected: "Same total",
    context: { appVersion: "0.1.0", platform: "android", osVersion: "35", language: "en", screen: "/settings" },
  });
});

test("a public destination leaves the screenshot out until the person switches it on", async () => {
  const off = harness({ audience: "public" });
  await off.machine.open("shake", "/history");
  off.write();
  await off.machine.send();
  expect(off.calls).toEqual(["submit report-1"]);
  expect(off.submitted[0].screenshotSha256).toBeUndefined();
  expect(off.deleted).toEqual([shot.uri]);

  const on = harness({ audience: "public" });
  await on.machine.open("shake", "/history");
  on.write();
  on.machine.setScreenshotIncluded(true);
  await on.machine.send();
  expect(on.calls).toEqual([`attach report-1 ${original}`, "submit report-1"]);
  expect(on.published).toEqual([original]);
});

test("an unavailable destination freezes the report; Retry repeats the identical command without attaching again", async () => {
  const h = harness();
  h.failNextSubmit({ code: "destination_unavailable" });
  await h.machine.open("shake", "/history");
  h.write();
  await h.machine.send();
  expect(h.phase()).toMatchObject({ kind: "failed", failure: { code: "unknown" } });
  expect(h.drafts.stored).toMatchObject({
    reportKey: "report-1",
    frozen: { screenshotSha256: sha256(original) },
    attached: { sha256: sha256(original) },
  });
  h.machine.edit("title", "Changed while unconfirmed");
  h.machine.setScreenshotIncluded(false);
  await h.machine.removeScreenshot();
  expect(h.report()).toMatchObject({ fields: { title: "Balance looks wrong" }, screenshot: shot });
  await h.machine.send();
  expect(h.calls).toEqual([`attach report-1 ${original}`, "submit report-1", "submit report-1"]);
  expect(JSON.stringify(h.submitted[1])).toBe(JSON.stringify(h.submitted[0]));
  expect(h.published).toEqual([original]);
  expect(h.phase()).toEqual({ kind: "sent", result: sent });
});

test.each([
  { code: "provider_unavailable" },
  { code: "rate_limited", retryAfterMs: 60_000 },
  { code: "invalid_report", field: "title" },
])("after a lost reply, a retry refused with $code keeps the report frozen and the next retry repeats it", async (refusal) => {
  const h = harness();
  h.failNextSubmit(new Error("lost reply"));
  h.failNextSubmit(refusal);
  await h.machine.open("shake", "/history");
  h.write();
  await h.machine.send();
  await h.machine.send();
  h.machine.edit("title", "Changed after the refusal");
  expect(h.drafts.stored).toMatchObject({ reportKey: "report-1", frozen: { screenshotSha256: sha256(original) } });
  expect(h.report()).toMatchObject({ fields: { title: "Balance looks wrong" } });
  await h.machine.send();
  expect(h.calls).toEqual([`attach report-1 ${original}`, "submit report-1", "submit report-1", "submit report-1"]);
  expect(new Set(h.submitted.map((args) => JSON.stringify(args))).size).toBe(1);
  expect(h.phase()).toEqual({ kind: "sent", result: sent });
});

test("a frozen retry attaches the same bytes again only when the server no longer holds them", async () => {
  const h = harness();
  h.failNextSubmit({ code: "destination_unavailable" });
  await h.machine.open("shake", "/history");
  h.write();
  await h.machine.send();
  h.server.clear();
  h.calls.length = 0;
  await h.machine.send();
  expect(h.calls).toEqual(["submit report-1", `attach report-1 ${original}`, "submit report-1"]);
  expect(new Set(h.transport.submit.mock.calls.map(([args]) => JSON.stringify(args))).size).toBe(1);
  expect(h.published).toEqual([original]);
});

test("the report is frozen on the phone before the first network call, and its attachment is saved after", async () => {
  vi.useFakeTimers();
  const phone = phoneStorage();
  const h = harness({ phone });
  const seen: [string, Report | null][] = [];
  const attach = h.transport.attachScreenshot.getMockImplementation()!;
  const submit = h.transport.submit.getMockImplementation()!;
  h.transport.attachScreenshot.mockImplementation(async (args) => {
    seen.push(["attach", phone.saved()]);
    return attach(args);
  });
  h.transport.submit.mockImplementation(async (args) => {
    seen.push(["submit", phone.saved()]);
    if (seen.length === 2) throw new TypeError("Network request failed");
    return submit(args);
  });
  await h.machine.open("shake", "/history");
  h.write();
  await h.machine.send();
  expect(seen.map(([call, report]) => [call, report?.frozen, report?.attached])).toEqual([
    ["attach", { screenshotSha256: sha256(original) }, "unconfirmed"],
    ["submit", { screenshotSha256: sha256(original) }, { sha256: sha256(original) }],
  ]);
  h.restart();
  await h.machine.open("menu", "/history");
  await h.machine.resume();
  expect(h.phase()).toMatchObject({ kind: "failed", failure: { code: "unknown" } });
  await h.machine.send();
  expect(h.transport.attachScreenshot).toHaveBeenCalledTimes(1);
  expect(h.transport.submit).toHaveBeenCalledTimes(2);
  expect(new Set(h.transport.submit.mock.calls.map(([args]) => JSON.stringify(args))).size).toBe(1);
  expect(h.published).toEqual([original]);
});

test("a text-only report is frozen on the phone before its submit", async () => {
  vi.useFakeTimers();
  const phone = phoneStorage();
  const h = harness({ phone });
  const frozenAtSubmit: unknown[] = [];
  h.transport.submit.mockImplementationOnce(async () => {
    frozenAtSubmit.push(phone.saved()?.frozen);
    return new Promise<never>(() => {});
  });
  await h.machine.open("menu", "/settings");
  h.write();
  void h.machine.send();
  await vi.advanceTimersByTimeAsync(0);
  expect(frozenAtSubmit).toEqual([{ screenshotSha256: null }]);
});

test("after a failed send, a redaction then an immediate kill and restart can never publish the earlier image", async () => {
  vi.useFakeTimers();
  const phone = phoneStorage();
  const h = harness({ phone });
  h.failNextSubmit({ code: "rate_limited", retryAfterMs: 1 });
  h.transport.removeScreenshot.mockRejectedValue(new TypeError("Network request failed"));
  await h.machine.open("shake", "/history");
  h.write();
  await h.machine.send();
  await vi.advanceTimersByTimeAsync(1_000);
  expect(phone.saved()).toMatchObject({ frozen: null, attached: { sha256: sha256(original) } });
  expect(h.server.get("report-1")).toBe(original);
  h.files.set(redacted.uri, blackedOut);
  await h.machine.replaceScreenshot(redacted);
  expect(h.files.has(shot.uri)).toBe(false);
  h.restart();
  await h.machine.open("menu", "/history");
  await h.machine.resume();
  expect(h.report()).toMatchObject({ screenshot: { ...redacted, redacted: true }, attached: null });
  await h.machine.send();
  expect(h.transport.removeScreenshot).toHaveBeenCalledWith({ reportKey: "report-1" });
  expect(h.submitted.at(-1)?.screenshotSha256).toBe(sha256(blackedOut));
  expect(h.published).toEqual([blackedOut]);
});

test("the original file is deleted only after the saved report points at the redacted one", async () => {
  vi.useFakeTimers();
  const phone = phoneStorage();
  const h = harness({ phone });
  await h.machine.open("shake", "/history");
  h.write();
  await vi.advanceTimersByTimeAsync(1_000);
  const write = held<void>();
  const setItem = vi.mocked(SecureStore.setItemAsync).getMockImplementation()!;
  vi.mocked(SecureStore.setItemAsync).mockImplementationOnce(async (key, value) => {
    await write.promise;
    return setItem(key, value);
  });
  h.files.set(redacted.uri, blackedOut);
  const applying = h.machine.replaceScreenshot(redacted);
  await flushed();
  expect(h.files.has(shot.uri)).toBe(true);
  expect(phone.saved()?.screenshot?.uri).toBe(shot.uri);
  write.release();
  await applying;
  expect(phone.saved()?.screenshot?.uri).toBe(redacted.uri);
  expect(h.files.has(shot.uri)).toBe(false);
});

test("changing the image after an attachment forgets it and asks the server to delete its copy", async () => {
  for (const change of ["switch off", "remove", "black out"] as const) {
    const h = harness();
    h.failNextSubmit({ code: "rate_limited", retryAfterMs: 1 });
    await h.machine.open("shake", "/history");
    h.write();
    await h.machine.send();
    expect(h.report().attached).toEqual({ sha256: sha256(original) });
    h.files.set(redacted.uri, blackedOut);
    if (change === "switch off") h.machine.setScreenshotIncluded(false);
    if (change === "remove") await h.machine.removeScreenshot();
    if (change === "black out") await h.machine.replaceScreenshot(redacted);
    expect([change, h.report().attached]).toEqual([change, null]);
    await h.machine.send();
    expect([change, h.calls.slice(2)]).toEqual([
      change,
      change === "black out"
        ? ["remove report-1", `attach report-1 ${blackedOut}`, "submit report-1"]
        : ["remove report-1", "submit report-1"],
    ]);
    expect([change, h.published]).toEqual([change, change === "black out" ? [blackedOut] : []]);
  }
});

test("an unchanged image already attached is not uploaded again, and is re-attached once if the server lost it", async () => {
  const h = harness();
  h.failNextSubmit({ code: "rate_limited", retryAfterMs: 1 });
  await h.machine.open("shake", "/history");
  h.write();
  await h.machine.send();
  h.server.clear();
  await h.machine.send();
  expect(h.calls).toEqual([
    `attach report-1 ${original}`,
    "submit report-1",
    "submit report-1",
    `attach report-1 ${original}`,
    "submit report-1",
  ]);
  expect(h.published).toEqual([original]);
});

test("a saved report whose screenshot is gone or changed drops it, says so, and never sends its digest", async () => {
  const draft = (overrides: Partial<Report>): Report => ({
    reportKey: "saved-1", kind: "bug",
    fields: { title: "Saved title", whatHappened: "Saved text", expected: "", steps: "" },
    origin: "shake", screen: "/budget", screenshot: shot, captureFailed: false, screenshotChoice: "default",
    attached: null, context: null, frozen: null, createdAt: 500, ...overrides,
  });
  const missing = harness({ stored: draft({}) });
  missing.files.delete(shot.uri);
  await missing.machine.open("menu", "/history");
  await missing.machine.resume();
  expect(missing.phase()).toMatchObject({ kind: "editing", screenshotNotice: "missing", report: { screenshot: null } });
  await missing.machine.send();
  expect(missing.calls).toEqual(["submit saved-1"]);
  expect(missing.submitted[0].screenshotSha256).toBeUndefined();

  const changed = harness({
    stored: draft({
      frozen: { screenshotSha256: sha256(original) },
      attached: { sha256: sha256(original) },
      context: { ...context, screen: "/budget" },
    }),
  });
  changed.files.set(shot.uri, "a different image under the same name");
  await changed.machine.open("menu", "/history");
  await changed.machine.resume();
  expect(changed.phase()).toMatchObject({ kind: "failed", screenshotNotice: "missing", report: { screenshot: null } });
  expect(changed.files.has(shot.uri)).toBe(false);
  await changed.machine.send();
  expect(changed.calls).toEqual(["remove saved-1", "submit saved-1"]);
  expect(changed.submitted[0].screenshotSha256).toBeUndefined();
  expect(changed.published).toEqual([]);
});

test("a screenshot file that disappears before Send is dropped with a notice instead of being sent", async () => {
  const h = harness();
  await h.machine.open("shake", "/history");
  h.write();
  h.files.delete(shot.uri);
  await h.machine.send();
  expect(h.phase()).toMatchObject({ kind: "editing", screenshotNotice: "missing", report: { screenshot: null } });
  expect(h.calls).toEqual([]);
  await h.machine.send();
  expect(h.calls).toEqual(["submit report-1"]);
});

test("a screenshot over the backend's 5 MiB limit is refused before anything is uploaded", async () => {
  const h = harness();
  h.files.set(shot.uri, "x".repeat(5 * 1024 * 1024 + 1));
  await h.machine.open("shake", "/history");
  h.write();
  await h.machine.send();
  expect(h.phase()).toMatchObject({ kind: "editing", notice: { code: "invalid_report", field: "screenshot" } });
  expect(h.report().frozen).toBeNull();
  expect(h.calls).toEqual([]);
});

test("a screenshot the server refuses at attach is uploaded once and the report stays editable", async () => {
  const h = harness();
  h.transport.attachScreenshot.mockRejectedValueOnce(new ConvexError({ code: "invalid_report", field: "screenshot" }));
  await h.machine.open("shake", "/history");
  h.write();
  await h.machine.send();
  expect(h.transport.attachScreenshot).toHaveBeenCalledTimes(1);
  expect(h.transport.submit).not.toHaveBeenCalled();
  expect(h.phase()).toMatchObject({ kind: "editing", notice: { code: "invalid_report", field: "screenshot" } });
  expect(h.report().frozen).toBeNull();
});

test("an attach acknowledged with a different digest is not submitted and is attached again on retry", async () => {
  const h = harness();
  h.transport.attachScreenshot.mockResolvedValueOnce({ sha256: sha256("something else") });
  await h.machine.open("shake", "/history");
  h.write();
  await h.machine.send();
  expect(h.phase()).toMatchObject({ kind: "editing", notice: { code: "unknown" } });
  expect(h.report()).toMatchObject({ frozen: null, attached: "unconfirmed" });
  expect(h.transport.submit).not.toHaveBeenCalled();
  await h.machine.send();
  expect(h.calls).toEqual([`attach report-1 ${original}`, "submit report-1"]);
  expect(h.published).toEqual([original]);
});

test("an expired report keeps what was typed and the screenshot, and goes again under a new key", async () => {
  const h = harness();
  h.failNextSubmit({ code: "report_expired" });
  await h.machine.open("shake", "/history");
  h.write();
  await h.machine.send();
  expect(h.phase()).toMatchObject({ kind: "editing", notice: { code: "report_expired" } });
  expect(h.report()).toMatchObject({
    reportKey: "report-2",
    fields: { title: "Balance looks wrong" },
    screenshot: shot,
    frozen: null,
    attached: null,
  });
  expect(h.files.get(shot.uri)).toBe(original);
  await h.machine.send();
  expect(h.calls).toEqual([
    `attach report-1 ${original}`,
    "submit report-1",
    "remove report-1",
    `attach report-2 ${original}`,
    "submit report-2",
  ]);
  expect(h.submitted.at(-1)).toMatchObject({ reportKey: "report-2", title: "Balance looks wrong" });
  expect(h.published).toEqual([original]);
});

test("a frozen retry that finds its report expired becomes editable under a new key", async () => {
  const h = harness();
  h.failNextSubmit({ code: "destination_unavailable" });
  h.failNextSubmit({ code: "report_expired" });
  await h.machine.open("menu", "/settings");
  h.write();
  await h.machine.send();
  expect(h.phase().kind).toBe("failed");
  await h.machine.send();
  expect(h.phase()).toMatchObject({ kind: "editing", notice: { code: "report_expired" }, report: { reportKey: "report-2" } });
  h.machine.edit("steps", "Open Home.");
  await h.machine.send();
  expect(h.submitted.at(-1)).toMatchObject({ reportKey: "report-2", steps: "Open Home." });
});

test("from the press of Send, the switch, black out, remove and editing have no effect on what is submitted", async () => {
  const h = harness();
  const attach = held<{ sha256: string }>();
  h.transport.attachScreenshot.mockImplementationOnce(async ({ reportKey, image }) => {
    h.calls.push(`attach ${reportKey} ${new TextDecoder().decode(image)}`);
    h.server.set(reportKey, original);
    return attach.promise;
  });
  await h.machine.open("shake", "/history");
  h.write();
  const sending = h.machine.send();
  h.machine.setScreenshotIncluded(false);
  expect(h.phase().kind).toBe("sending");
  await flushed();
  expect(h.calls).toEqual([`attach report-1 ${original}`]);
  h.machine.setScreenshotIncluded(false);
  await h.machine.removeScreenshot();
  h.files.set(redacted.uri, blackedOut);
  await h.machine.replaceScreenshot(redacted);
  h.machine.edit("title", "Changed during send");
  attach.release({ sha256: sha256(original) });
  await sending;
  expect(h.submitted[0]).toMatchObject({ title: "Balance looks wrong", screenshotSha256: sha256(original) });
  expect(h.published).toEqual([original]);
  expect(h.files.has(redacted.uri)).toBe(false);
  expect(h.transport.removeScreenshot).not.toHaveBeenCalled();
});

test("discarding a failed report deletes its files and asks the server to delete its image without waiting", async () => {
  const h = harness();
  h.failNextSubmit({ code: "destination_unavailable" });
  h.transport.removeScreenshot.mockImplementation(() => new Promise<never>(() => {}));
  await h.machine.open("shake", "/history");
  h.write();
  await h.machine.send();
  h.machine.requestCancel();
  expect(h.phase()).toMatchObject({ kind: "failed", confirm: "discard" });
  await h.machine.discard();
  expect(h.phase().kind).toBe("idle");
  expect(h.files.has(shot.uri)).toBe(false);
  expect(h.drafts.stored).toBeNull();
  await flushed();
  expect(h.transport.removeScreenshot).toHaveBeenCalledWith({ reportKey: "report-1" });
});

test("a network failure or a timeout keeps the input and retries the same intent", async () => {
  const h = harness();
  h.transport.submit
    .mockImplementationOnce(async () => {
      throw new TypeError("Network request failed");
    })
    .mockImplementationOnce(() => new Promise<never>(() => {}));
  await h.machine.open("menu", "/settings");
  h.write();
  await h.machine.send();
  expect(h.phase()).toMatchObject({ kind: "failed", failure: { code: "unknown" } });
  await h.machine.send();
  expect(h.phase()).toMatchObject({ kind: "failed", failure: { code: "unknown" } });
  await h.machine.send();
  expect(h.transport.submit.mock.calls.map(([args]) => args.reportKey)).toEqual(["report-1", "report-1", "report-1"]);
  expect(new Set(h.transport.submit.mock.calls.map(([args]) => JSON.stringify(args))).size).toBe(1);
  expect(h.phase().kind).toBe("sent");
});

test("a retry repeats the context fixed at the first send, even after the language changes", async () => {
  const h = harness();
  h.failNextSubmit({ code: "destination_unavailable" });
  await h.machine.open("menu", "/settings");
  h.write();
  await h.machine.send();
  const first = h.transport.submit.mock.calls[0][0];
  h.setLanguage("es");
  await h.machine.send();
  expect(h.transport.submit.mock.calls[1][0]).toEqual(first);
  expect(first.context.language).toBe("en");
});

test("a frozen retry keeps its screenshot decision even if the destination's audience changes", async () => {
  const h = harness({ audience: "private" });
  h.failNextSubmit({ code: "destination_unavailable" });
  await h.machine.open("shake", "/history");
  h.write();
  await h.machine.send();
  h.machine.setDestination({ configured: true, repository: "owner/lukapp", audience: "public", screenshotRetentionDays: 30 });
  await h.machine.send();
  expect(h.transport.submit.mock.calls[1][0].screenshotSha256).toBe(sha256(original));
  expect(h.published).toEqual([original]);
});

test("pressing Send twice makes one attach and one submit", async () => {
  const h = harness();
  await h.machine.open("shake", "/history");
  h.write();
  await Promise.all([h.machine.send(), h.machine.send()]);
  expect(h.calls).toEqual([`attach report-1 ${original}`, "submit report-1"]);
});

test("success resets: Done returns to idle and the next report gets a fresh key", async () => {
  const h = harness();
  await h.machine.open("menu", "/settings");
  h.write();
  await h.machine.send();
  h.machine.done();
  expect(h.phase().kind).toBe("idle");
  await h.machine.open("menu", "/settings");
  expect(h.report()).toMatchObject({ reportKey: "report-2", fields: { title: "", whatHappened: "" } });
});

test("invalid fields are shown and nothing is sent", async () => {
  const h = harness();
  await h.machine.open("menu", "/settings");
  h.machine.edit("title", "ab");
  await h.machine.send();
  expect(h.phase()).toMatchObject({ kind: "editing", showErrors: true });
  expect(h.calls).toEqual([]);
});

test("rate limiting keeps the report editable and says when to try again", async () => {
  const h = harness();
  h.failNextSubmit({ code: "rate_limited", retryAfterMs: 120_000 });
  await h.machine.open("menu", "/settings");
  h.write();
  await h.machine.send();
  expect(h.phase()).toMatchObject({ kind: "editing", notice: { code: "rate_limited", retryAt: 121_000 } });
  expect(h.report().frozen).toBeNull();
});

test("an unconfigured destination and a known offline state send nothing", async () => {
  const h = harness();
  h.machine.setDestination({ configured: false, repository: "", audience: "public", screenshotRetentionDays: 30 });
  await h.machine.open("menu", "/settings");
  h.write();
  await h.machine.send();
  expect(h.phase()).toMatchObject({ kind: "editing", notice: { code: "not_configured" } });
  h.machine.setDestination({ configured: true, repository: "owner/lukapp", audience: "public", screenshotRetentionDays: 30 });
  h.goOffline(true);
  await h.machine.send();
  expect(h.phase()).toMatchObject({ kind: "editing", notice: { code: "offline" } });
  expect(h.calls).toEqual([]);
  h.goOffline(false);
  await h.machine.send();
  expect(h.calls).toEqual(["submit report-1"]);
});

test("a changed report needs an edit and a confirmation before it is sent under a new key", async () => {
  const h = harness();
  h.failNextSubmit({ code: "changed_report" });
  await h.machine.open("shake", "/history");
  h.write();
  await h.machine.send();
  expect(h.phase()).toMatchObject({ kind: "editing", notice: { code: "changed_report" } });
  await h.machine.send();
  expect(h.calls).toEqual([`attach report-1 ${original}`, "submit report-1"]);
  h.machine.edit("steps", "Open Home, then Overview.");
  await h.machine.send();
  expect(h.phase()).toMatchObject({ kind: "editing", confirm: "newKey" });
  h.machine.confirmNewKey();
  await vi.waitFor(() => expect(h.phase().kind).toBe("sent"));
  expect(h.calls).toEqual([
    `attach report-1 ${original}`,
    "submit report-1",
    "remove report-1",
    `attach report-2 ${original}`,
    "submit report-2",
  ]);
});

test("authentication and device errors go to the access-failure handler", async () => {
  const h = harness();
  const revoked = new ConvexError({ code: "device_revoked", wipeLocalInput: true });
  h.failNextSubmit(revoked);
  await h.machine.open("menu", "/settings");
  h.write();
  await h.machine.send();
  expect(h.accessFailures).toEqual([revoked]);
  expect(h.phase()).toMatchObject({ kind: "failed", failure: { code: "access" } });
});

test("a saved report is offered first; resuming drops the new capture, starting new drops the old one", async () => {
  const stored: Report = {
    reportKey: "saved-1", kind: "bug",
    fields: { title: "Saved title", whatHappened: "Saved text", expected: "", steps: "" },
    origin: "shake", screen: "/budget",
    screenshot: { ...shot, uri: "file:///cache/lukapp-feedback/saved.png" },
    captureFailed: false, screenshotChoice: "default", attached: null, context: null, frozen: null, createdAt: 500,
  };
  const resume = harness({ stored });
  resume.files.set("file:///cache/lukapp-feedback/saved.png", "saved screen");
  await resume.machine.open("shake", "/history");
  expect(resume.phase().kind).toBe("resuming");
  await resume.machine.resume();
  expect(resume.deleted).toEqual([shot.uri]);
  expect(resume.phase()).toMatchObject({
    screenshotNotice: null,
    report: { reportKey: "saved-1", fields: { title: "Saved title" }, screenshot: stored.screenshot },
  });

  const fresh = harness({ stored });
  await fresh.machine.open("shake", "/history");
  await fresh.machine.startNew();
  expect(fresh.deleted).toEqual(["file:///cache/lukapp-feedback/saved.png"]);
  expect(fresh.report()).toMatchObject({ reportKey: "report-1", screenshot: shot });
  expect(fresh.calls).toEqual([]);
});

test("a frozen saved report resumes as a retry, not an edit", async () => {
  const stored: Report = {
    reportKey: "saved-2", kind: "feedback",
    fields: { title: "Idea", whatHappened: "Add a weekly view", expected: "", steps: "" },
    origin: "menu", screen: "/settings", screenshot: null, captureFailed: false, screenshotChoice: "default",
    attached: null, context: { ...context, screen: "/settings" }, frozen: { screenshotSha256: null }, createdAt: 500,
  };
  const h = harness({ stored });
  await h.machine.open("menu", "/home");
  await h.machine.resume();
  expect(h.phase()).toMatchObject({ kind: "failed", failure: { code: "unknown" } });
  await h.machine.send();
  expect(h.submitted[0]).toMatchObject({ reportKey: "saved-2", context: { ...context, screen: "/settings" } });
});

test("practice never captures, saves or submits", async () => {
  const h = harness();
  h.machine.openPractice();
  h.write();
  await h.machine.send();
  expect(h.phase()).toMatchObject({ kind: "editing", practice: true });
  await h.machine.discard();
  expect(h.phase().kind).toBe("idle");
  expect(h.calls).toEqual([]);
  expect(h.phaseAtCapture).toEqual([]);
  expect(h.saved).toEqual([]);
  expect(h.drafts.cleared).toBe(0);
});

test("closing the layer keeps a typed report and its capture, but deletes an untouched capture", async () => {
  const typed = harness();
  await typed.machine.open("shake", "/history");
  typed.write();
  await typed.machine.dispose();
  expect(typed.deleted).toEqual([]);
  expect(typed.drafts.stored?.screenshot?.uri).toBe(shot.uri);

  const untouched = harness();
  await untouched.machine.open("shake", "/history");
  await untouched.machine.dispose();
  expect(untouched.deleted).toEqual([shot.uri]);
});
