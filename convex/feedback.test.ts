import { createHash } from "node:crypto";
import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { z } from "zod";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { ReportPayload } from "./feedbackValues";
import { leaseMs, retentionMs } from "./feedbackStore";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
const identity = { subject: "user-feedback-fixture", issuer: "https://feedback.clerk.accounts.dev", sid: "sess_feedback", sts: "active", email: "never-publish@example.test", name: "Never Publish Name" };
const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=";
const png = Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0));
const fixtureToken = "feedback-fixture-only-not-a-secret";
const issueInput = z.object({ title: z.string(), body: z.string(), labels: z.array(z.string()) });
type Issue = z.infer<typeof issueInput> & { number: number; html_url: string; created_at: string };

function report(overrides: Partial<ReportPayload> = {}): ReportPayload {
  return {
    reportKey: crypto.randomUUID(), kind: "bug", title: "Account screen freezes",
    whatHappened: "The account stopped responding.", expected: "The account should open.", steps: "Open Accounts.",
    context: { appVersion: "1.2.3", platform: "ios", osVersion: "18.0", language: "en", screen: "Accounts" },
    ...overrides,
  };
}

async function fixture() {
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", identity.issuer);
  vi.stubEnv("CLERK_SECRET_KEY", "clerk-fixture-only");
  vi.stubEnv("GITHUB_FEEDBACK_TOKEN", fixtureToken);
  vi.stubEnv("GITHUB_FEEDBACK_REPOSITORY", "DanielZamb/lukapp");
  vi.stubEnv("GITHUB_FEEDBACK_AUDIENCE", "public");
  const root = convexTest(schema, modules);
  const t = root.withIdentity(identity);
  const issues: Issue[] = [];
  const contents = new Map<string, { sha: string; size: number }>();
  const state = {
    createStatus: 201, listStatus: 200, contentStatus: 201,
    branchExists: false, loseCreateResponse: false,
    failListNetwork: false, failCreateNetwork: false, inactive: false, wrongClient: false,
    onCreate: async () => {},
    onList: async () => {},
    pages: new Map<number, Issue[]>(),
  };
  const transport = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "api.clerk.com") return Response.json({
      id: identity.sid, user_id: identity.subject, client_id: state.wrongClient ? "foreign-client" : "client_feedback",
      status: state.inactive ? "revoked" : "active", expire_at: Date.now() + retentionMs,
      abandon_at: Date.now() + retentionMs, created_at: Date.now() - 1000,
    });
    if (url.origin !== "https://api.github.com" || !url.pathname.startsWith("/repos/DanielZamb/lukapp"))
      throw new Error("Unexpected fixture destination");
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${fixtureToken}`);
    const path = url.pathname.slice("/repos/DanielZamb/lukapp".length);
    const jsonBody = () => {
      if (typeof init?.body !== "string") throw new Error("Expected JSON body");
      return JSON.parse(init.body);
    };
    if (path === "/issues" && init?.method === "POST") {
      if (state.failCreateNetwork) throw new Error("Unknown create outcome");
      if (state.createStatus !== 201) return new Response("provider private failure details", { status: state.createStatus });
      await state.onCreate();
      const value = issueInput.parse(jsonBody());
      const number = issues.length + 41;
      const created = { ...value, number, html_url: `https://github.com/DanielZamb/lukapp/issues/${number}`, created_at: new Date(Date.now()).toISOString() };
      issues.push(created);
      if (state.loseCreateResponse) throw new Error("lost response with private details");
      return Response.json(created, { status: 201 });
    }
    if (path === "/issues") {
      await state.onList();
      if (state.failListNetwork) throw new Error("private network details");
      if (state.listStatus !== 200) return new Response("private list details", { status: state.listStatus });
      expect(url.searchParams.get("labels")).toBe("needs-triage");
      expect(url.searchParams.get("state")).toBe("all");
      expect(url.searchParams.get("sort")).toBe("created");
      expect(url.searchParams.has("since")).toBe(true);
      return Response.json(state.pages.get(Number(url.searchParams.get("page"))) ?? issues);
    }
    if (path === "") return Response.json({ default_branch: "main" });
    if (path === "/git/ref/heads/main") return Response.json({ object: { sha: "main-sha" } });
    if (path === "/git/ref/heads/feedback-attachments")
      return state.branchExists ? Response.json({ object: { sha: "attachment-sha" } }) : new Response(null, { status: 404 });
    if (path === "/git/refs" && init?.method === "POST") {
      expect(jsonBody()).toEqual({ ref: "refs/heads/feedback-attachments", sha: "main-sha" });
      state.branchExists = true;
      return Response.json({ object: { sha: "attachment-sha" } }, { status: 201 });
    }
    if (path.startsWith("/contents/feedback/")) {
      if (init?.method === "PUT") {
        if (state.contentStatus !== 201) return new Response(null, { status: state.contentStatus });
        const value = z.object({ branch: z.string(), content: z.string() }).parse(jsonBody());
        expect(value.branch).toBe("feedback-attachments");
        const bytes = Buffer.from(value.content, "base64");
        const sha = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
        const saved = { sha, size: bytes.length };
        contents.set(path, saved);
        return Response.json({ content: saved }, { status: 201 });
      }
      expect(url.searchParams.get("ref")).toBe("feedback-attachments");
      return contents.has(path) ? Response.json(contents.get(path)) : new Response(null, { status: 404 });
    }
    throw new Error("Unexpected fixture GitHub route");
  });
  vi.stubGlobal("fetch", transport);
  const deviceId = await t.action(api.deviceAccess.register, { installId: "feedback-fixture-install", platform: "ios", label: "Fixture phone", appVersion: "1" });
  const creates = () => transport.mock.calls.filter(([input, init]) => String(input).endsWith("/issues") && init?.method === "POST");
  const uploads = () => transport.mock.calls.filter(([, init]) => init?.method === "PUT");
  const addScreenshot = async (value: ReportPayload, blob = new Blob([png], { type: "image/png" })) => {
    await t.mutation(api.feedback.prepareScreenshotUpload, { reportKey: value.reportKey });
    return { ...value, screenshotStorageId: await t.run((ctx) => ctx.storage.store(blob)) };
  };
  const expireLease = async () => {
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("feedbackReports").collect())
        if (row.state === "pending" && row.lease) await ctx.db.patch(row._id, { lease: { ...row.lease, until: Date.now() - 1 } });
    });
  };
  return { root, t, deviceId, issues, contents, state, transport, creates, uploads, addScreenshot, expireLease };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

test("reports trusted destination and defaults to a public audience", async () => {
  const { t } = await fixture();
  expect(await t.query(api.feedback.destination, {})).toEqual({ configured: true, repository: "DanielZamb/lukapp", audience: "public" });
  vi.stubEnv("GITHUB_FEEDBACK_AUDIENCE", "");
  expect(await t.query(api.feedback.destination, {})).toMatchObject({ audience: "public" });
  vi.stubEnv("GITHUB_FEEDBACK_AUDIENCE", "private");
  expect(await t.query(api.feedback.destination, {})).toMatchObject({ configured: true, audience: "private" });
});

test("creates one text issue with fixed labels, normalized fields, and no private identity", async () => {
  const { t, issues, creates, transport } = await fixture();
  const log = vi.spyOn(console, "log");
  const warn = vi.spyOn(console, "warn");
  const error = vi.spyOn(console, "error");
  const value = report({ title: "  Account screen freezes  ", expected: "", steps: "" });
  const result = await t.action(api.feedback.submit, value);
  expect(result).toEqual({ reference: "#41", issueNumber: 41, url: "https://github.com/DanielZamb/lukapp/issues/41" });
  expect(issues).toHaveLength(1);
  expect(issues[0]).toMatchObject({ title: "[Bug] Account screen freezes", labels: ["needs-triage", "bug"] });
  expect(issues[0].body).toContain("## What happened\n\n<pre>The account stopped responding.</pre>");
  expect(issues[0].body).not.toContain("## Expected");
  expect(issues[0].body).not.toContain("## Steps to reproduce");
  expect(issues[0].body).not.toContain("## Screenshot");
  expect(issues[0].body).toMatch(/\| Reporter \| [a-f0-9]{24} \|/);
  expect(issues[0].body).toContain(`:${value.reportKey} -->`);
  for (const secret of [fixtureToken, identity.subject, identity.email, identity.name]) {
    expect(issues[0].body).not.toContain(secret);
    expect(JSON.stringify([log.mock.calls, warn.mock.calls, error.mock.calls])).not.toContain(secret);
  }
  expect(await t.action(api.feedback.submit, { ...value, title: value.title.trim(), expected: undefined, steps: undefined })).toEqual(result);
  expect(creates()).toHaveLength(1);
  expect(transport.mock.calls.filter(([url]) => String(url).includes("api.github.com"))).toHaveLength(2);
  const saved = await t.run((ctx) => ctx.db.query("feedbackReports").unique());
  expect(saved).toMatchObject({ state: "created", result });
  expect(JSON.stringify(saved)).not.toContain(value.whatHappened);
});

test("stores the reviewed PNG on the attachment branch and deletes the Convex blob", async () => {
  const f = await fixture();
  const value = await f.addScreenshot(report({ kind: "feedback" }));
  const result = await f.t.action(api.feedback.submit, value);
  expect(f.uploads()).toHaveLength(1);
  expect(f.contents.has(`/contents/feedback/${value.reportKey}.png`)).toBe(true);
  expect(f.issues[0].title).toBe("[Feedback] Account screen freezes");
  expect(f.issues[0].labels).toEqual(["needs-triage", "feedback"]);
  expect(f.issues[0].body).toContain(`![Screenshot](https://github.com/DanielZamb/lukapp/blob/feedback-attachments/feedback/${value.reportKey}.png?raw=true)`);
  expect(await f.t.run((ctx) => ctx.storage.get(value.screenshotStorageId))).toBeNull();
  expect(await f.t.action(api.feedback.submit, value)).toEqual(result);
  expect(f.creates()).toHaveLength(1);
  expect(f.uploads()).toHaveLength(1);
});

test("same key and changed content is rejected, including screenshot and context", async () => {
  const f = await fixture();
  const value = report();
  await f.t.action(api.feedback.submit, value);
  for (const changed of [
    { ...value, title: "Changed title" }, { ...value, kind: "feedback" as const },
    { ...value, whatHappened: "Changed details" }, { ...value, expected: "Changed expected" },
    { ...value, steps: "Changed steps" }, { ...value, context: { ...value.context, language: "es" as const } },
    { ...value, screenshotStorageId: await f.t.run((ctx) => ctx.storage.store(new Blob([png], { type: "image/png" }))) },
  ]) await expect(f.t.action(api.feedback.submit, changed)).rejects.toMatchObject({ data: { code: "changed_report" } });
  expect(f.creates()).toHaveLength(1);
});

test("concurrent double taps yield the same reference and one GitHub issue", async () => {
  const f = await fixture();
  const value = report();
  const result = await Promise.all([f.t.action(api.feedback.submit, value), f.t.action(api.feedback.submit, value)]);
  expect(result).toEqual([
    { reference: "#41", issueNumber: 41, url: "https://github.com/DanielZamb/lukapp/issues/41" },
    { reference: "#41", issueNumber: 41, url: "https://github.com/DanielZamb/lukapp/issues/41" },
  ]);
  expect(f.creates()).toHaveLength(1);
  expect(await f.t.run((ctx) => ctx.db.query("feedbackReservations").collect())).toHaveLength(1);
});

test("reconciles a create whose reply was lost, without a second create or screenshot upload", async () => {
  const f = await fixture();
  const value = await f.addScreenshot(report());
  f.state.loseCreateResponse = true;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "destination_unavailable" } });
  expect(f.issues).toHaveLength(1);
  const pending = await f.t.run((ctx) => ctx.db.query("feedbackReports").unique());
  expect(pending).toMatchObject({ state: "pending", screenshotStorageId: value.screenshotStorageId });
  expect(pending?.state === "pending" && pending.lease?.until).toBeGreaterThan(Date.now() + leaseMs - 1000);
  expect(await f.t.action(api.feedback.submit, value)).toEqual({ reference: "#41", issueNumber: 41, url: "https://github.com/DanielZamb/lukapp/issues/41" });
  expect(f.creates()).toHaveLength(1);
  expect(f.uploads()).toHaveLength(1);
  expect(await f.t.run((ctx) => ctx.storage.get(value.screenshotStorageId))).toBeNull();
});

test("reuses an attachment committed before a failed issue attempt", async () => {
  const f = await fixture();
  const value = await f.addScreenshot(report());
  f.state.createStatus = 503;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "destination_unavailable" } });
  f.state.createStatus = 201;
  expect(await f.t.action(api.feedback.submit, value)).toMatchObject({ reference: "#41" });
  expect(f.uploads()).toHaveLength(1);
  expect(f.issues).toHaveLength(1);
});

test.each([401, 403, 404, 429, 500, 503])("maps GitHub status %s without leaking a response body", async (status) => {
  const f = await fixture();
  f.state.listStatus = status;
  await expect(f.t.action(api.feedback.submit, report())).rejects.toMatchObject({ data: { code: [401, 404].includes(status) ? "not_configured" : "destination_unavailable" } });
  expect(f.creates()).toHaveLength(0);
});

test("network failures leave the key pending and retry succeeds", async () => {
  const f = await fixture();
  const value = report();
  f.state.failListNetwork = true;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "destination_unavailable" } });
  f.state.failListNetwork = false;
  expect(await f.t.action(api.feedback.submit, value)).toMatchObject({ reference: "#41" });
  expect(f.creates()).toHaveLength(1);
});

test("escapes mentions, references, HTML, markdown and section breakouts", async () => {
  const f = await fixture();
  const attack = '</pre>\n## Injected\n@owner closes #123\n```\n![x](https://evil.test)\n<!-- marker -->';
  await f.t.action(api.feedback.submit, report({
    title: "@owner closes #123", whatHappened: attack, expected: attack, steps: attack,
    context: { appVersion: "x|**bold**\n@owner", platform: "android", osVersion: "<script>", language: "es", screen: "[link](x)|`code`" },
  }));
  const value = f.issues[0];
  expect(value.title).toBe("[Bug] ＠owner closes ＃123");
  expect(value.body).toContain("&lt;/pre&gt;\n&#35;&#35; Injected\n&#64;owner closes &#35;123");
  expect(value.body).toContain("| App version | x&#124;&#42;&#42;bold&#42;&#42; &#64;owner |");
  expect(value.body).not.toContain("@owner");
  expect(value.body).not.toContain("closes #123");
  expect(value.body.match(/<pre>/g)).toHaveLength(3);
  expect(value.body.match(/<\/pre>/g)).toHaveLength(3);
  expect(value.body.match(/<!--/g)).toHaveLength(1);
});

const invalidReports: { field: string; change: (value: ReportPayload) => ReportPayload }[] = [
  { field: "reportKey", change: (r) => ({ ...r, reportKey: "../bad" }) },
  { field: "title", change: (r) => ({ ...r, title: "ab" }) },
  { field: "title", change: (r) => ({ ...r, title: "a".repeat(121) }) },
  { field: "title", change: (r) => ({ ...r, title: "bad\nheading" }) },
  { field: "title", change: (r) => ({ ...r, title: "bad\u007ftitle" }) },
  { field: "whatHappened", change: (r) => ({ ...r, whatHappened: " " }) },
  { field: "whatHappened", change: (r) => ({ ...r, whatHappened: "a".repeat(4001) }) },
  { field: "expected", change: (r) => ({ ...r, expected: "a".repeat(4001) }) },
  { field: "steps", change: (r) => ({ ...r, steps: "a".repeat(4001) }) },
  { field: "context.appVersion", change: (r) => ({ ...r, context: { ...r.context, appVersion: " " } }) },
  { field: "context.appVersion", change: (r) => ({ ...r, context: { ...r.context, appVersion: "a".repeat(65) } }) },
  { field: "context.osVersion", change: (r) => ({ ...r, context: { ...r.context, osVersion: "" } }) },
  { field: "context.osVersion", change: (r) => ({ ...r, context: { ...r.context, osVersion: "a".repeat(65) } }) },
  { field: "context.screen", change: (r) => ({ ...r, context: { ...r.context, screen: "a".repeat(121) } }) },
];
test.each(invalidReports)("rejects invalid $field before reserving or publishing", async ({ field, change }) => {
  const f = await fixture();
  await expect(f.t.action(api.feedback.submit, change(report()))).rejects.toMatchObject({ data: { code: "invalid_report", field } });
  expect(await f.t.run((ctx) => ctx.db.query("feedbackReservations").collect())).toHaveLength(0);
  expect(f.creates()).toHaveLength(0);
});

test("accepts all text limits inclusively after trimming", async () => {
  const f = await fixture();
  await f.t.action(api.feedback.submit, report({ title: " " + "a".repeat(120) + " ", whatHappened: "a".repeat(4000), expected: "a".repeat(4000), steps: "a".repeat(4000), context: { appVersion: "a".repeat(64), platform: "android", osVersion: "a".repeat(64), language: "es", screen: "a".repeat(120) } }));
  await f.t.action(api.feedback.submit, report({ title: "abc", whatHappened: "a" }));
  expect(f.issues).toHaveLength(2);
});

test.each([
  { name: "oversize PNG", blob: () => new Blob([png, new Uint8Array(5 * 1024 * 1024)], { type: "image/png" }) },
  { name: "non-image", blob: () => new Blob(["text"], { type: "text/plain" }) },
  { name: "spoofed PNG", blob: () => new Blob(["text"], { type: "image/png" }) },
  { name: "empty image", blob: () => new Blob([], { type: "image/jpeg" }) },
])("rejects $name from stored bytes", async ({ blob }) => {
  const f = await fixture();
  await expect(f.t.action(api.feedback.submit, await f.addScreenshot(report(), blob()))).rejects.toMatchObject({ data: { code: "invalid_report", field: "screenshotStorageId" } });
  expect(f.creates()).toHaveLength(0);
  expect(f.uploads()).toHaveLength(0);
});

test("screenshot must follow explicit upload preparation", async () => {
  const f = await fixture();
  const screenshotStorageId = await f.t.run((ctx) => ctx.storage.store(new Blob([png], { type: "image/png" })));
  await expect(f.t.action(api.feedback.submit, report({ screenshotStorageId }))).rejects.toMatchObject({ data: { code: "invalid_report", field: "screenshotStorageId" } });
  expect(f.creates()).toHaveLength(0);
});

test("counts five reservations per rolling hour and replays consume no quota", async () => {
  const f = await fixture();
  const value = report();
  await f.t.action(api.feedback.submit, value);
  for (let i = 0; i < 6; i++) await f.t.action(api.feedback.submit, value);
  for (let i = 0; i < 4; i++) await f.t.mutation(api.feedback.prepareScreenshotUpload, { reportKey: report().reportKey });
  await expect(f.t.action(api.feedback.submit, report())).rejects.toMatchObject({ data: { code: "rate_limited", retryAfterMs: expect.any(Number) } });
  await expect(f.t.mutation(api.feedback.prepareScreenshotUpload, { reportKey: report().reportKey })).rejects.toMatchObject({ data: { code: "rate_limited", retryAfterMs: expect.any(Number) } });
  expect(await f.t.action(api.feedback.submit, value)).toMatchObject({ reference: "#41" });
  expect(await f.t.run((ctx) => ctx.db.query("feedbackReservations").collect())).toHaveLength(5);
});

test("counts twenty reservations per rolling day", async () => {
  const f = await fixture();
  const start = Date.now();
  const clock = vi.spyOn(Date, "now");
  for (let hour = 0; hour < 4; hour++) {
    clock.mockReturnValue(start + hour * 3600_001);
    for (let i = 0; i < 5; i++) await f.t.action(api.feedback.submit, report());
  }
  clock.mockReturnValue(start + 4 * 3600_001);
  await expect(f.t.action(api.feedback.submit, report())).rejects.toMatchObject({ data: { code: "rate_limited", retryAfterMs: retentionMs - 4 * 3600_001 } });
  clock.mockReturnValue(start + retentionMs + 1);
  expect(await f.t.action(api.feedback.submit, report())).toMatchObject({ reference: "#61" });
});

test("upload preparation retries return the same URL and reserve once", async () => {
  const f = await fixture();
  const args = { reportKey: report().reportKey };
  const first = await f.t.mutation(api.feedback.prepareScreenshotUpload, args);
  expect(first.uploadUrl).toMatch(/^https?:/);
  expect(await f.t.mutation(api.feedback.prepareScreenshotUpload, args)).toEqual(first);
  expect(await f.t.run((ctx) => ctx.db.query("feedbackReservations").collect())).toHaveLength(1);
  expect(f.creates()).toHaveLength(0);
});

test.each(["GITHUB_FEEDBACK_TOKEN", "GITHUB_FEEDBACK_REPOSITORY"])("missing %s reports not_configured", async (name) => {
  const f = await fixture();
  vi.stubEnv(name, "");
  expect(await f.t.query(api.feedback.destination, {})).toMatchObject({ configured: false });
  await expect(f.t.action(api.feedback.submit, report())).rejects.toMatchObject({ data: { code: "not_configured" } });
  await expect(f.t.mutation(api.feedback.prepareScreenshotUpload, { reportKey: report().reportKey })).rejects.toMatchObject({ data: { code: "not_configured" } });
  expect(f.creates()).toHaveLength(0);
});

test.each(["anonymous", "unregistered", "revoked", "clerk-revoked", "wrong-client"])("enforces normal admission for %s callers, also on replay", async (mode) => {
  const f = await fixture();
  const value = report();
  await f.t.action(api.feedback.submit, value);
  let caller = f.t;
  let code = "device_registration_required";
  if (mode === "anonymous") { caller = f.root; code = "authentication_required"; }
  if (mode === "unregistered") await f.t.run((ctx) => ctx.db.delete(f.deviceId));
  if (mode === "revoked") { await f.t.run((ctx) => ctx.db.patch(f.deviceId, { revokedAt: Date.now() })); code = "device_revoked"; }
  if (mode === "clerk-revoked") { f.state.inactive = true; code = "session_inactive"; }
  if (mode === "wrong-client") f.state.wrongClient = true;
  await expect(caller.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code } });
  if (mode !== "clerk-revoked" && mode !== "wrong-client") {
    await expect(caller.query(api.feedback.destination, {})).rejects.toMatchObject({ data: { code } });
    await expect(caller.mutation(api.feedback.prepareScreenshotUpload, { reportKey: report().reportKey })).rejects.toMatchObject({ data: { code } });
  }
  expect(f.creates()).toHaveLength(1);
});

test("expires the pending row and its blob, retaining only the retry hash and rate reservation", async () => {
  const f = await fixture();
  const value = await f.addScreenshot(report());
  f.state.listStatus = 503;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "destination_unavailable" } });
  const key = await f.t.run((ctx) => ctx.db.query("feedbackReservations").unique());
  if (!key) throw new Error("Expected reservation");
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + retentionMs + 1);
  await f.t.mutation(internal.feedbackStore.expire, { reservationId: key._id });
  expect(await f.t.run((ctx) => ctx.storage.get(value.screenshotStorageId))).toBeNull();
  expect(await f.t.run((ctx) => ctx.db.query("feedbackReports").collect())).toHaveLength(0);
  const savedKey = await f.t.run((ctx) => ctx.db.get(key._id));
  expect(savedKey?.payloadHash).toMatch(/^[0-9a-f]{64}$/);
  expect(savedKey?.uploadUrl).toBeUndefined();
  await expect(f.t.action(api.feedback.submit, { ...value, title: "changed after expiry" })).rejects.toMatchObject({ data: { code: "changed_report" } });
});

test("uploads JPEG bytes using the jpg extension", async () => {
  const f = await fixture();
  const jpeg = Uint8Array.from(atob("/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpAB//Z"), (c) => c.charCodeAt(0));
  const value = await f.addScreenshot(report(), new Blob([jpeg], { type: "image/jpeg" }));
  expect(await f.t.action(api.feedback.submit, value)).toMatchObject({ reference: "#41" });
  expect(f.contents.has(`/contents/feedback/${value.reportKey}.jpg`)).toBe(true);
});

test("rejects truncated PNG and a JPEG with only its magic bytes", async () => {
  const f = await fixture();
  for (const blob of [new Blob([png.slice(0, 30)], { type: "image/png" }), new Blob([Uint8Array.of(255, 216, 255, 217)], { type: "image/jpeg" })]) {
    await expect(f.t.action(api.feedback.submit, await f.addScreenshot(report(), blob))).rejects.toMatchObject({ data: { code: "invalid_report", field: "screenshotStorageId" } });
  }
  expect(f.creates()).toHaveLength(0);
});

test("recovers a committed issue immediately while its original lease is still active", async () => {
  const f = await fixture();
  const value = report();
  f.state.loseCreateResponse = true;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "destination_unavailable" } });
  expect(await f.t.action(api.feedback.submit, value)).toMatchObject({ reference: "#41" });
  expect(f.creates()).toHaveLength(1);
});

test("records an existing issue when saving its first receipt fails", async () => {
  const f = await fixture();
  const value = report();
  let fail = true;
  f.state.onCreate = async () => {
    if (!fail) return;
    fail = false;
    await f.t.run(async (ctx) => {
      const pending = await ctx.db.query("feedbackReports").unique();
      if (pending?.state !== "pending" || !pending.lease) throw new Error("Expected pending report");
      await ctx.db.patch(pending._id, { lease: { ...pending.lease, owner: "simulated-lost-owner" } });
    });
  };
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "destination_unavailable" } });
  expect(f.issues).toHaveLength(1);
  expect(await f.t.action(api.feedback.submit, value)).toMatchObject({ reference: "#41" });
  expect(f.creates()).toHaveLength(1);
});

test("marker recovery traverses list pages without GitHub search", async () => {
  const f = await fixture();
  const value = report();
  f.state.loseCreateResponse = true;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "destination_unavailable" } });
  const created = f.issues[0];
  f.state.pages.set(1, Array.from({ length: 100 }, (_, index) => ({ ...created, number: index + 100, html_url: `https://github.com/DanielZamb/lukapp/issues/${index + 100}`, body: "A different report" })));
  f.state.pages.set(2, [created]);
  expect(await f.t.action(api.feedback.submit, value)).toMatchObject({ reference: "#41" });
  expect(f.transport.mock.calls.some(([url]) => String(url).includes("page=2"))).toBe(true);
  expect(f.transport.mock.calls.some(([url]) => String(url).includes("/search"))).toBe(false);
  expect(f.creates()).toHaveLength(1);
});

test("scheduled expiry removes the pending row and blob without deleting a created receipt", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  const created = await f.addScreenshot(report());
  await f.t.action(api.feedback.submit, created);
  const pending = await f.addScreenshot(report());
  f.state.listStatus = 503;
  await expect(f.t.action(api.feedback.submit, pending)).rejects.toMatchObject({ data: { code: "destination_unavailable" } });
  await f.root.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers());
  expect(await f.t.run((ctx) => ctx.storage.get(pending.screenshotStorageId))).toBeNull();
  const rows = await f.t.run((ctx) => ctx.db.query("feedbackReports").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ state: "created", result: { reference: "#41" } });
});

test("expiry preserves enough history to recover a previously created issue after the pending row is gone", async () => {
  const f = await fixture();
  const value = await f.addScreenshot(report());
  f.state.loseCreateResponse = true;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "destination_unavailable" } });
  const key = await f.t.run((ctx) => ctx.db.query("feedbackReservations").unique());
  if (!key) throw new Error("Expected reservation");
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + retentionMs + 1);
  await f.t.mutation(internal.feedbackStore.expire, { reservationId: key._id });
  expect(await f.t.run((ctx) => ctx.db.query("feedbackReports").collect())).toHaveLength(0);
  expect(await f.t.action(api.feedback.submit, value)).toMatchObject({ reference: "#41" });
  expect(f.creates()).toHaveLength(1);
});

test("a changed server destination cannot reroute an already reserved report", async () => {
  const f = await fixture();
  const value = report();
  f.state.listStatus = 503;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "destination_unavailable" } });
  vi.stubEnv("GITHUB_FEEDBACK_REPOSITORY", "elsewhere/another-repo");
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "destination_unavailable" } });
  expect(f.creates()).toHaveLength(0);
});

test("an unknown create outcome cannot trigger another create while the lease is active", async () => {
  const f = await fixture();
  const value = report();
  f.state.failCreateNetwork = true;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "destination_unavailable" } });
  f.state.failCreateNetwork = false;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "destination_unavailable" } });
  expect(f.creates()).toHaveLength(1);
  await f.expireLease();
  expect(await f.t.action(api.feedback.submit, value)).toMatchObject({ reference: "#41" });
  expect(f.creates()).toHaveLength(2);
}, 10_000);

test("rechecks device admission after GitHub lookup before creating an issue", async () => {
  const f = await fixture();
  f.state.onList = async () => { await f.t.run((ctx) => ctx.db.patch(f.deviceId, { revokedAt: Date.now() })); };
  await expect(f.t.action(api.feedback.submit, report())).rejects.toMatchObject({ data: { code: "device_revoked", wipeLocalInput: true } });
  expect(f.creates()).toHaveLength(0);
});

test("an attachment branch-head conflict leaves the report retryable", async () => {
  const f = await fixture();
  const value = await f.addScreenshot(report());
  f.state.contentStatus = 409;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "destination_unavailable" } });
  expect(f.creates()).toHaveLength(0);
  f.state.contentStatus = 201;
  expect(await f.t.action(api.feedback.submit, value)).toMatchObject({ reference: "#41" });
  expect(f.creates()).toHaveLength(1);
});

test("an unused upload URL can be refreshed after an hour without another reservation", async () => {
  const f = await fixture();
  const args = { reportKey: report().reportKey };
  const first = await f.t.mutation(api.feedback.prepareScreenshotUpload, args);
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 3600_001);
  const refreshed = await f.t.mutation(api.feedback.prepareScreenshotUpload, args);
  expect(refreshed.uploadUrl).not.toBe(first.uploadUrl);
  expect(await f.t.run((ctx) => ctx.db.query("feedbackReservations").collect())).toHaveLength(1);
});
