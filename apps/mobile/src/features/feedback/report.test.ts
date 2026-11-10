import { ConvexError } from "convex/values";
import { expect, test, vi } from "vitest";
import { ReportMachine, type Audience, type Report, type Screenshot, type SubmitArgs } from "./report";
import { classifySendError } from "./transport";

vi.mock("expo-constants", () => ({ default: { expoConfig: { version: "0.1.0" } } }));
vi.mock("expo-file-system", () => ({ File: class {} }));
vi.mock("expo/fetch", () => ({ fetch: vi.fn() }));
vi.mock("react-native", () => ({ Platform: { OS: "android", Version: 35 } }));
vi.mock("../api", () => ({ api: {} }));

const shot: Screenshot = { uri: "file:///cache/lukapp-feedback/shot-1.png", width: 390, height: 844, redacted: false };
const sent = { reference: "LK-7Q2", issueNumber: 123, url: "https://github.com/owner/lukapp/issues/123" };
const context = { appVersion: "0.1.0", platform: "android", osVersion: "35", language: "en" } as const;

function harness({ audience = "private" as Audience, stored = null as Report | null, capture = shot as Screenshot | null } = {}) {
  const calls: string[] = [];
  const deleted: string[] = [];
  const saved: Report[] = [];
  const drafts = { stored, cleared: 0 };
  let offline = false;
  let language: "en" | "es" = "en";
  let keys = 0;
  const submitted: SubmitArgs[] = [];
  const accessFailures: unknown[] = [];
  const transport = {
    prepareScreenshotUpload: vi.fn(async ({ reportKey }: { reportKey: string }) => {
      calls.push(`prepare ${reportKey}`);
      return { uploadUrl: "https://upload.example/1" };
    }),
    upload: vi.fn(async (_url: string, screenshot: Screenshot) => {
      calls.push(`upload ${screenshot.uri}`);
      return { storageId: "storage-1" };
    }),
    submit: vi.fn(async (args: SubmitArgs) => {
      calls.push(`submit ${args.reportKey}`);
      submitted.push(args);
      return sent;
    }),
  };
  const phaseAtCapture: string[] = [];
  const machine: ReportMachine = new ReportMachine({
    newKey: () => `report-${++keys}`,
    now: () => 1_000,
    capture: async () => {
      phaseAtCapture.push(machine.getSnapshot().phase.kind);
      return capture;
    },
    deleteCapture: async (uri) => {
      deleted.push(uri);
    },
    drafts: {
      read: async () => drafts.stored,
      save: (report) => {
        drafts.stored = report;
        saved.push(report);
      },
      clear: () => {
        drafts.stored = null;
        drafts.cleared++;
      },
    },
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
  machine.setDestination({ configured: true, repository: "owner/lukapp", audience });
  const phase = () => machine.getSnapshot().phase;
  const report = () => {
    const current = phase();
    if (current.kind !== "editing" && current.kind !== "failed" && current.kind !== "sending")
      throw new Error(`No report in ${current.kind}`);
    return current.report;
  };
  const write = () => {
    machine.edit("title", "Balance looks wrong");
    machine.edit("whatHappened", "Home shows a different total than Overview.");
  };
  return {
    machine, transport, calls, deleted, saved, drafts, submitted, accessFailures, phaseAtCapture, phase, report, write,
    goOffline: (value: boolean) => { offline = value; },
    setLanguage: (value: "en" | "es") => { language = value; },
  };
}

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

test("editing, choosing and blacking out never upload; only Send does", async () => {
  const h = harness();
  await h.machine.open("shake", "/history");
  h.write();
  h.machine.setKind("feedback");
  h.machine.setScreenshotIncluded(false);
  h.machine.setScreenshotIncluded(true);
  const flattened = { ...shot, uri: "file:///cache/lukapp-feedback/flat-1.png" };
  await h.machine.replaceScreenshot(flattened);
  expect(h.calls).toEqual([]);
  expect(h.deleted).toEqual([shot.uri]);
  expect(h.report().screenshot).toEqual({ ...flattened, redacted: true });
  await h.machine.send();
  expect(h.calls).toEqual([
    "prepare report-1",
    "upload file:///cache/lukapp-feedback/flat-1.png",
    "submit report-1",
  ]);
});

test("send with a screenshot to a private destination prepares, uploads, then submits the stored id", async () => {
  const h = harness({ audience: "private" });
  await h.machine.open("shake", "/history");
  h.write();
  await h.machine.send();
  expect(h.calls).toEqual(["prepare report-1", `upload ${shot.uri}`, "submit report-1"]);
  expect(h.submitted).toEqual([
    {
      reportKey: "report-1",
      kind: "bug",
      title: "Balance looks wrong",
      whatHappened: "Home shows a different total than Overview.",
      screenshotStorageId: "storage-1",
      context: { appVersion: "0.1.0", platform: "android", osVersion: "35", language: "en", screen: "/history" },
    },
  ]);
  expect(h.phase()).toEqual({ kind: "sent", result: sent });
  expect(h.deleted).toEqual([shot.uri]);
  expect(h.drafts.stored).toBeNull();
});

test("send without a screenshot calls only submit, with no storage id", async () => {
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
  expect(off.submitted[0].screenshotStorageId).toBeUndefined();
  expect(off.deleted).toEqual([shot.uri]);

  const on = harness({ audience: "public" });
  await on.machine.open("shake", "/history");
  on.write();
  on.machine.setScreenshotIncluded(true);
  await on.machine.send();
  expect(on.calls).toEqual(["prepare report-1", `upload ${shot.uri}`, "submit report-1"]);
  expect(on.submitted[0].screenshotStorageId).toBe("storage-1");
});

test("an unavailable destination freezes the typed report; Retry reuses the key and the uploaded id", async () => {
  const h = harness();
  h.transport.submit.mockImplementationOnce(async (args) => {
    h.calls.push(`submit ${args.reportKey}`);
    throw new ConvexError({ code: "destination_unavailable" });
  });
  await h.machine.open("shake", "/history");
  h.write();
  await h.machine.send();
  expect(h.phase()).toMatchObject({ kind: "failed", failure: { code: "unknown" } });
  expect(h.report()).toMatchObject({ frozen: true, fields: { title: "Balance looks wrong" } });
  expect(h.drafts.stored).toMatchObject({ reportKey: "report-1", frozen: true, uploaded: { storageId: "storage-1" } });
  h.machine.edit("title", "Changed while unconfirmed");
  expect(h.report().fields.title).toBe("Balance looks wrong");
  await h.machine.send();
  expect(h.calls).toEqual(["prepare report-1", `upload ${shot.uri}`, "submit report-1", "submit report-1"]);
  expect(h.submitted.map((args) => [args.reportKey, args.screenshotStorageId, args.title])).toEqual([
    ["report-1", "storage-1", "Balance looks wrong"],
  ]);
  expect(h.phase()).toEqual({ kind: "sent", result: sent });
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
  h.transport.submit.mockRejectedValueOnce(new ConvexError({ code: "destination_unavailable" }));
  await h.machine.open("menu", "/settings");
  h.write();
  await h.machine.send();
  const first = h.transport.submit.mock.calls[0][0];
  h.setLanguage("es");
  await h.machine.send();
  expect(h.transport.submit.mock.calls[1][0]).toEqual(first);
  expect(first.context.language).toBe("en");
});

test("pressing Send twice makes one upload and one submit", async () => {
  const h = harness();
  await h.machine.open("shake", "/history");
  h.write();
  await Promise.all([h.machine.send(), h.machine.send()]);
  expect(h.calls).toEqual(["prepare report-1", `upload ${shot.uri}`, "submit report-1"]);
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
  h.transport.submit.mockRejectedValueOnce(new ConvexError({ code: "rate_limited", retryAfterMs: 120_000 }));
  await h.machine.open("menu", "/settings");
  h.write();
  await h.machine.send();
  expect(h.phase()).toMatchObject({ kind: "editing", notice: { code: "rate_limited", retryAt: 121_000 } });
  expect(h.report().frozen).toBe(false);
});

test("an unconfigured destination and a known offline state send nothing", async () => {
  const h = harness();
  h.machine.setDestination({ configured: false, repository: "", audience: "public" });
  await h.machine.open("menu", "/settings");
  h.write();
  await h.machine.send();
  expect(h.phase()).toMatchObject({ kind: "editing", notice: { code: "not_configured" } });
  h.machine.setDestination({ configured: true, repository: "owner/lukapp", audience: "public" });
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
  h.transport.submit.mockImplementationOnce(async (args) => {
    h.calls.push(`submit ${args.reportKey}`);
    throw new ConvexError({ code: "changed_report" });
  });
  await h.machine.open("shake", "/history");
  h.write();
  await h.machine.send();
  expect(h.phase()).toMatchObject({ kind: "editing", notice: { code: "changed_report" } });
  await h.machine.send();
  expect(h.calls).toEqual(["prepare report-1", `upload ${shot.uri}`, "submit report-1"]);
  h.machine.edit("steps", "Open Home, then Overview.");
  await h.machine.send();
  expect(h.phase()).toMatchObject({ kind: "editing", confirm: "newKey" });
  h.machine.confirmNewKey();
  await vi.waitFor(() => expect(h.phase().kind).toBe("sent"));
  expect(h.calls).toEqual([
    "prepare report-1",
    `upload ${shot.uri}`,
    "submit report-1",
    "prepare report-2",
    `upload ${shot.uri}`,
    "submit report-2",
  ]);
});

test("authentication and device errors go to the access-failure handler", async () => {
  const h = harness();
  const revoked = new ConvexError({ code: "device_revoked", wipeLocalInput: true });
  h.transport.submit.mockRejectedValueOnce(revoked);
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
    captureFailed: false, screenshotChoice: "default", uploaded: null, context: null, frozen: false, createdAt: 500,
  };
  const resume = harness({ stored });
  await resume.machine.open("shake", "/history");
  expect(resume.phase().kind).toBe("resuming");
  await resume.machine.resume();
  expect(resume.deleted).toEqual([shot.uri]);
  expect(resume.report()).toMatchObject({ reportKey: "saved-1", fields: { title: "Saved title" } });

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
    uploaded: null, context: { ...context, screen: "/settings" }, frozen: true, createdAt: 500,
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
