import { createHash } from "node:crypto";
import type { Id } from "./_generated/dataModel";
import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { z } from "zod";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { screenshotRetentionMs } from "./feedbackValues";
import type { ReportPayload } from "./feedbackValues";
import { leaseMs, retentionMs, unclaimedUploadAgeMs } from "./feedbackStore";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
const identity = { subject: "user-feedback-fixture", issuer: "https://feedback.clerk.accounts.dev", sid: "sess_feedback", sts: "active", email: "never-publish@example.test", name: "Never Publish Name" };
const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=";
const png = Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0));
const fixtureToken = "feedback-fixture-only-not-a-secret";
const issueInput = z.object({ title: z.string(), body: z.string(), labels: z.array(z.string()) });
type Issue = z.infer<typeof issueInput> & { number: number; html_url: string; created_at: string; user: { login: string } };

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
  vi.stubEnv("GITHUB_FEEDBACK_SCREENSHOT_RETENTION_DAYS", "1");
  const root = convexTest(schema, modules);
  const t = root.withIdentity(identity);
  const issues: Issue[] = [];
  const state = {
    createStatus: 201, listStatus: 200, userStatus: 200, malformedUser: false, malformedList: false,
    loseCreateResponse: false,
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
    if (url.origin === "https://api.github.com" && url.pathname === "/user") {
      if (state.userStatus !== 200) return new Response("private account failure", { status: state.userStatus });
      return Response.json(state.malformedUser ? { login: null } : { login: "feedback-bot" });
    }
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
      const created = { ...value, user: { login: "feedback-bot" }, number, html_url: `https://github.com/DanielZamb/lukapp/issues/${number}`, created_at: new Date(Date.now()).toISOString() };
      issues.push(created);
      if (state.loseCreateResponse) throw new Error("lost response with private details");
      return Response.json(created, { status: 201 });
    }
    if (path === "/issues") {
      await state.onList();
      if (state.failListNetwork) throw new Error("private network details");
      if (state.listStatus !== 200) return new Response("private list details", { status: state.listStatus });
      expect(url.searchParams.has("labels")).toBe(false);
      expect(url.searchParams.get("creator")).toBe("feedback-bot");
      expect(url.searchParams.get("state")).toBe("all");
      expect(url.searchParams.get("sort")).toBe("created");
      expect(url.searchParams.has("since")).toBe(true);
      return Response.json(state.malformedList ? { private: "not an issue list" } : state.pages.get(Number(url.searchParams.get("page"))) ?? issues);
    }
    throw new Error("Unexpected fixture GitHub route");
  });
  vi.stubGlobal("fetch", transport);
  const deviceId = await t.action(api.deviceAccess.register, { installId: "feedback-fixture-install", platform: "ios", label: "Fixture phone", appVersion: "1" });
  const creates = () => transport.mock.calls.filter(([input, init]) => String(input).endsWith("/issues") && init?.method === "POST");
  const uploads = () => transport.mock.calls.filter(([, init]) => init?.method === "PUT");
  const screenshotIds = new Map<string, Id<"_storage">>();
  const storageId = (value: ReportPayload) => {
    const id = screenshotIds.get(value.reportKey);
    if (!id) throw new Error("Expected attached screenshot");
    return id;
  };
  const addScreenshot = async (value: ReportPayload, blob = new Blob([png], { type: "image/png" })) => {
    const { sha256 } = await t.action(api.feedback.attachScreenshot, { reportKey: value.reportKey, image: await blob.arrayBuffer() });
    const key = await t.run((ctx) => ctx.db.query("feedbackReservations").withIndex("by_user_key", (q) => q.eq("userId", identity.subject).eq("reportKey", value.reportKey)).unique());
    if (!key?.screenshot) throw new Error("Expected attached screenshot");
    screenshotIds.set(value.reportKey, key.screenshot.storageId);
    return { ...value, screenshotSha256: sha256 };
  };
  const expireLease = async () => {
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("feedbackReports").collect())
        if (row.state === "pending" && row.lease) await ctx.db.patch(row._id, { lease: { ...row.lease, until: Date.now() - 1 } });
    });
  };
  return { root, t, deviceId, issues, state, transport, creates, uploads, addScreenshot, storageId, expireLease };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

test("reports trusted destination and defaults to a public audience", async () => {
  const { t } = await fixture();
  expect(await t.query(api.feedback.destination, {})).toEqual({ configured: true, repository: "DanielZamb/lukapp", audience: "public", screenshotRetentionDays: 1 });
  vi.stubEnv("GITHUB_FEEDBACK_SCREENSHOT_RETENTION_DAYS", "7");
  expect(await t.query(api.feedback.destination, {})).toMatchObject({ configured: true, screenshotRetentionDays: 7 });
  vi.stubEnv("GITHUB_FEEDBACK_SCREENSHOT_RETENTION_DAYS", "0");
  expect(await t.query(api.feedback.destination, {})).toMatchObject({ configured: false });
  vi.stubEnv("GITHUB_FEEDBACK_SCREENSHOT_RETENTION_DAYS", "");
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
  expect(issues[0].body).not.toContain("| Reporter |");
  expect(issues[0].body).not.toContain(value.reportKey);
  expect(issues[0].body).toMatch(/<!-- lukapp-feedback:[0-9a-f-]{36} -->/);
  for (const secret of [fixtureToken, identity.subject, identity.email, identity.name]) {
    expect(issues[0].body).not.toContain(secret);
    expect(JSON.stringify([log.mock.calls, warn.mock.calls, error.mock.calls])).not.toContain(secret);
  }
  expect(await t.action(api.feedback.submit, { ...value, title: value.title.trim(), expected: undefined, steps: undefined })).toEqual(result);
  expect(creates()).toHaveLength(1);
  expect(transport.mock.calls.filter(([url]) => String(url).includes("api.github.com"))).toHaveLength(3);
  const saved = await t.run((ctx) => ctx.db.query("feedbackReports").unique());
  expect(saved).toMatchObject({ state: "created", result });
  expect(JSON.stringify(saved)).not.toContain(value.whatHappened);
});

test("embeds the reviewed PNG storage URL and retains it until scheduled deletion", async () => {
  const f = await fixture();
  const value = await f.addScreenshot(report({ kind: "feedback" }));
  const result = await f.t.action(api.feedback.submit, value);
  expect(f.uploads()).toHaveLength(0);
  expect(f.transport.mock.calls.some(([url]) => /\/(contents|git)\//.test(String(url)))).toBe(false);
  expect(f.issues[0].title).toBe("[Feedback] Account screen freezes");
  expect(f.issues[0].labels).toEqual(["needs-triage", "feedback"]);
  const url = await f.t.run((ctx) => ctx.storage.getUrl(f.storageId(value)));
  expect(f.issues[0].body).toContain(`![Screenshot](${url})`);
  expect(f.issues[0].body).toContain(new Date(Date.now() + retentionMs).toISOString().slice(0, 10));
  expect(await f.t.run((ctx) => ctx.db.system.get(f.storageId(value)))).not.toBeNull();
  expect(await f.t.action(api.feedback.submit, value)).toEqual(result);
  expect(f.creates()).toHaveLength(1);
  expect(f.uploads()).toHaveLength(0);
});

test("same key and changed content is rejected, including screenshot and context", async () => {
  const f = await fixture();
  const value = report();
  await f.t.action(api.feedback.submit, value);
  for (const changed of [
    { ...value, title: "Changed title" }, { ...value, kind: "feedback" as const },
    { ...value, whatHappened: "Changed details" }, { ...value, expected: "Changed expected" },
    { ...value, steps: "Changed steps" }, { ...value, context: { ...value.context, language: "es" as const } },
    { ...value, screenshotSha256: "0".repeat(64) },
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
  expect(pending).toMatchObject({ state: "pending", screenshotStorageId: f.storageId(value) });
  expect(pending?.state === "pending" && pending.lease?.until).toBeGreaterThan(Date.now() + leaseMs - 1000);
  expect(await f.t.action(api.feedback.submit, value)).toEqual({ reference: "#41", issueNumber: 41, url: "https://github.com/DanielZamb/lukapp/issues/41" });
  expect(f.creates()).toHaveLength(1);
  expect(f.uploads()).toHaveLength(0);
  expect(await f.t.run((ctx) => ctx.db.system.get(f.storageId(value)))).not.toBeNull();
});

test("reuses the reservation screenshot after a definite failed issue attempt", async () => {
  const f = await fixture();
  const value = await f.addScreenshot(report());
  f.state.createStatus = 503;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "destination_unavailable" } });
  f.state.createStatus = 201;
  expect(await f.t.action(api.feedback.submit, value)).toMatchObject({ reference: "#41" });
  expect(f.uploads()).toHaveLength(0);
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
  await expect(f.addScreenshot(report(), blob())).rejects.toMatchObject({ data: { code: "invalid_report", field: "screenshot" } });
  expect(f.creates()).toHaveLength(0);
  expect(f.uploads()).toHaveLength(0);
});

test("a screenshot digest requires an attachment owned by the same user and key", async () => {
  const f = await fixture();
  const attached = await f.addScreenshot(report());
  await expect(f.t.action(api.feedback.submit, report({ screenshotSha256: attached.screenshotSha256 }))).rejects.toMatchObject({ data: { code: "invalid_report", field: "screenshot" } });
  expect(f.creates()).toHaveLength(0);
});

test("counts five reservations per rolling hour and replays consume no quota", async () => {
  const f = await fixture();
  const value = report();
  await f.t.action(api.feedback.submit, value);
  for (let i = 0; i < 6; i++) await f.t.action(api.feedback.submit, value);
  for (let i = 0; i < 4; i++) await f.t.action(api.feedback.attachScreenshot, { reportKey: report().reportKey, image: png.buffer });
  await expect(f.t.action(api.feedback.submit, report())).rejects.toMatchObject({ data: { code: "rate_limited", retryAfterMs: expect.any(Number) } });
  await expect(f.t.action(api.feedback.attachScreenshot, { reportKey: report().reportKey, image: png.buffer })).rejects.toMatchObject({ data: { code: "rate_limited", retryAfterMs: expect.any(Number) } });
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

test("reattaching identical bytes returns their digest, replaces the blob and reserves once", async () => {
  const f = await fixture();
  const args = { reportKey: report().reportKey, image: png.buffer };
  const first = await f.t.action(api.feedback.attachScreenshot, args);
  expect(first).toEqual({ sha256: createHash("sha256").update(png).digest("hex") });
  const key = await f.t.run((ctx) => ctx.db.query("feedbackReservations").unique());
  expect(await f.t.action(api.feedback.attachScreenshot, args)).toEqual(first);
  expect(await f.t.run((ctx) => ctx.db.query("feedbackReservations").collect())).toHaveLength(1);
  expect(await f.t.run((ctx) => ctx.db.system.query("_storage").collect())).toHaveLength(1);
  const oldId = key?.screenshot?.storageId;
  if (!oldId) throw new Error("Expected old screenshot");
  expect(await f.t.run((ctx) => ctx.db.system.get(oldId))).toBeNull();
  expect(f.creates()).toHaveLength(0);
});

test.each(["GITHUB_FEEDBACK_TOKEN", "GITHUB_FEEDBACK_REPOSITORY"])("missing %s reports not_configured", async (name) => {
  const f = await fixture();
  vi.stubEnv(name, "");
  expect(await f.t.query(api.feedback.destination, {})).toMatchObject({ configured: false });
  await expect(f.t.action(api.feedback.submit, report())).rejects.toMatchObject({ data: { code: "not_configured" } });
  await expect(f.t.action(api.feedback.attachScreenshot, { reportKey: report().reportKey, image: png.buffer })).rejects.toMatchObject({ data: { code: "not_configured" } });
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
    await expect(caller.action(api.feedback.attachScreenshot, { reportKey: report().reportKey, image: png.buffer })).rejects.toMatchObject({ data: { code } });
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
  expect(await f.t.run((ctx) => ctx.db.system.get(f.storageId(value)))).toBeNull();
  expect(await f.t.run((ctx) => ctx.db.query("feedbackReports").collect())).toHaveLength(0);
  const savedKey = await f.t.run((ctx) => ctx.db.get(key._id));
  expect(savedKey?.payloadHash).toMatch(/^[0-9a-f]{64}$/);
  expect(savedKey?.screenshot).toBeUndefined();
  await expect(f.t.action(api.feedback.submit, { ...value, title: "changed after expiry" })).rejects.toMatchObject({ data: { code: "changed_report" } });
});

test("stores JPEG bytes with the image/jpeg MIME type", async () => {
  const f = await fixture();
  const jpeg = Uint8Array.from(atob("/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpAB//Z"), (c) => c.charCodeAt(0));
  const value = await f.addScreenshot(report(), new Blob([jpeg], { type: "image/jpeg" }));
  expect(await f.t.action(api.feedback.submit, value)).toMatchObject({ reference: "#41" });
  expect(await f.t.run(async (ctx) => (await ctx.storage.get(f.storageId(value)))?.type)).toBe("image/jpeg");
});

test("rejects truncated PNG and a JPEG with only its magic bytes", async () => {
  const f = await fixture();
  for (const blob of [new Blob([png.slice(0, 30)], { type: "image/png" }), new Blob([Uint8Array.of(255, 216, 255, 217)], { type: "image/jpeg" })]) {
    await expect(f.addScreenshot(report(), blob)).rejects.toMatchObject({ data: { code: "invalid_report", field: "screenshot" } });
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
  vi.stubEnv("GITHUB_FEEDBACK_SCREENSHOT_RETENTION_DAYS", "1");
  const f = await fixture();
  const created = await f.addScreenshot(report());
  await f.t.action(api.feedback.submit, created);
  const pending = await f.addScreenshot(report());
  f.state.listStatus = 503;
  await expect(f.t.action(api.feedback.submit, pending)).rejects.toMatchObject({ data: { code: "destination_unavailable" } });
  await f.root.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers());
  expect(await f.t.run((ctx) => ctx.db.system.get(f.storageId(pending)))).toBeNull();
  const rows = await f.t.run((ctx) => ctx.db.query("feedbackReports").collect());
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ state: "created", result: { reference: "#41" } });
});

test("expiry preserves a possibly published screenshot so recovery retains the promised URL", async () => {
  const f = await fixture();
  vi.stubEnv("GITHUB_FEEDBACK_SCREENSHOT_RETENTION_DAYS", "2");
  const value = await f.addScreenshot(report());
  f.state.loseCreateResponse = true;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "destination_unavailable" } });
  const key = await f.t.run((ctx) => ctx.db.query("feedbackReservations").unique());
  if (!key) throw new Error("Expected reservation");
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + retentionMs + 1);
  await f.t.mutation(internal.feedbackStore.expire, { reservationId: key._id });
  expect(await f.t.run((ctx) => ctx.db.system.get(f.storageId(value)))).not.toBeNull();
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

test("removeScreenshot deletes an attachment idempotently and refuses frozen reports", async () => {
  const f = await fixture();
  const value = await f.addScreenshot(report());
  expect(await f.t.mutation(api.feedback.removeScreenshot, { reportKey: value.reportKey })).toBeNull();
  expect(await f.t.mutation(api.feedback.removeScreenshot, { reportKey: value.reportKey })).toBeNull();
  expect(await f.t.run((ctx) => ctx.db.system.get(f.storageId(value)))).toBeNull();
  await f.t.action(api.feedback.submit, { ...value, screenshotSha256: undefined });
  await expect(f.t.mutation(api.feedback.removeScreenshot, { reportKey: value.reportKey })).rejects.toMatchObject({ data: { code: "changed_report" } });
  await expect(f.t.action(api.feedback.attachScreenshot, { reportKey: value.reportKey, image: png.buffer })).rejects.toMatchObject({ data: { code: "changed_report" } });
});

test("deletes a screenshot that was uploaded but never sent, and keeps a recent one", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const f = await fixture();
  const start = Date.now();
  const unclaimed = await f.root.run((ctx) => ctx.storage.store(new Blob([png], { type: "image/png" })));
  vi.setSystemTime(start + unclaimedUploadAgeMs);
  const recent = await f.root.run((ctx) => ctx.storage.store(new Blob([png], { type: "image/png" })));
  vi.setSystemTime(start + unclaimedUploadAgeMs + 1000);
  expect(await f.t.mutation(internal.feedbackStore.sweepUnclaimedUploads, {})).toBe(1);
  const remaining = await f.root.run((ctx) => ctx.db.system.query("_storage").collect());
  expect(remaining.map((blob) => blob._id)).toEqual([recent]);
  expect(remaining.map((blob) => blob._id)).not.toContain(unclaimed);
  vi.useRealTimers();
});

test("security: submit rejects any caller-supplied storage id", async () => {
  const f = await fixture();
  const screenshotStorageId = await f.root.run((ctx) => ctx.storage.store(new Blob([png], { type: "image/png" })));
  const value = report();
  await f.t.action(api.feedback.attachScreenshot, { reportKey: value.reportKey, image: png.buffer });
  const malicious = { ...value, screenshotStorageId };
  await expect(f.t.action(api.feedback.submit, malicious)).rejects.toThrow();
  expect(f.creates()).toHaveLength(0);
  expect(await f.root.run((ctx) => ctx.db.system.get(screenshotStorageId))).not.toBeNull();
});

test("security: revocation and failed create publish no repository attachment", async () => {
  const f = await fixture();
  const value = await f.addScreenshot(report());
  f.state.onList = async () => { await f.t.run((ctx) => ctx.db.patch(f.deviceId, { revokedAt: Date.now() })); };
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "device_revoked" } });
  expect(f.uploads()).toHaveLength(0);
  expect(f.transport.mock.calls.some(([url]) => /\/(contents|git)\//.test(String(url)))).toBe(false);
});

test("security: attachment endpoint validates bytes before storing and requires live admission", async () => {
  const f = await fixture();
  const value = { reportKey: report().reportKey, image: new Uint8Array(6 * 1024 * 1024).buffer };
  await expect(f.t.action(api.feedback.attachScreenshot, value)).rejects.toMatchObject({ data: { code: "invalid_report", field: "screenshot" } });
  expect(await f.root.run((ctx) => ctx.db.system.query("_storage").collect())).toHaveLength(0);
  f.state.inactive = true;
  await expect(f.t.action(api.feedback.attachScreenshot, { ...value, image: png.buffer })).rejects.toMatchObject({ data: { code: "session_inactive" } });
});

test("security: recovery never adopts another author's copied nonce", async () => {
  const f = await fixture();
  const value = report();
  f.state.loseCreateResponse = true;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toThrow();
  const forged = { ...f.issues[0], number: 99, html_url: "https://github.com/DanielZamb/lukapp/issues/99", user: { login: "attacker" } };
  f.state.pages.set(1, [forged, f.issues[0]]);
  expect(await f.t.action(api.feedback.submit, value)).toMatchObject({ reference: "#41" });
});

test("security: removing triage labels cannot hide a committed issue on retry", async () => {
  const f = await fixture();
  const value = report();
  f.state.loseCreateResponse = true;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toThrow();
  f.issues[0].labels = [];
  expect(await f.t.action(api.feedback.submit, value)).toMatchObject({ reference: "#41" });
  const lists = f.transport.mock.calls.filter(([url]) => String(url).includes("/issues?"));
  expect(lists.every(([url]) => !new URL(String(url)).searchParams.has("labels"))).toBe(true);
  expect(f.creates()).toHaveLength(1);
});

test("security: orphan sweep retains screenshots referenced by a leased pending report", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const f = await fixture();
  const value = await f.addScreenshot(report());
  f.state.createStatus = 503;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toThrow();
  vi.setSystemTime(Date.now() + unclaimedUploadAgeMs + 1);
  await f.t.run(async (ctx) => {
    const row = await ctx.db.query("feedbackReports").unique();
    if (row?.state !== "pending") throw new Error("Expected pending row");
    await ctx.db.patch(row._id, { lease: { owner: "live-attempt", until: Date.now() + leaseMs } });
  });
  await f.t.mutation(internal.feedbackStore.sweepUnclaimedUploads, {});
  expect(await f.t.run((ctx) => ctx.db.system.get(f.storageId(value)))).not.toBeNull();
});

test("security: expired failed screenshot report returns report_expired so a new key can send", async () => {
  const f = await fixture();
  const value = await f.addScreenshot(report());
  f.state.createStatus = 503;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toThrow();
  const key = await f.t.run((ctx) => ctx.db.query("feedbackReservations").unique());
  if (!key) throw new Error("Expected reservation");
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + retentionMs + 1);
  await f.t.mutation(internal.feedbackStore.expire, { reservationId: key._id });
  f.state.createStatus = 201;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "report_expired" } });
  expect(await f.t.action(api.feedback.submit, report())).toMatchObject({ reference: "#41" });
});

test("security: keys reserved in earlier hours cannot bypass the send-hour quota", async () => {
  const f = await fixture();
  const old = Array.from({ length: 5 }, () => report());
  for (const value of old) await f.t.action(api.feedback.attachScreenshot, { reportKey: value.reportKey, image: png.buffer });
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 3600_001);
  for (let i = 0; i < 5; i++) await f.t.action(api.feedback.submit, report());
  for (const value of old) await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "rate_limited" } });
  expect(f.creates()).toHaveLength(5);
});

test("security: public issues contain independent nonces and no reporter or report key", async () => {
  const f = await fixture();
  const values = [report(), report()];
  for (const value of values) await f.t.action(api.feedback.submit, value);
  const markers = f.issues.map((issue) => issue.body.match(/<!-- lukapp-feedback:([^ ]+) -->/)?.[1]);
  expect(markers[0]).not.toBe(markers[1]);
  for (const issue of f.issues) {
    expect(issue.body).not.toContain("| Reporter |");
    for (const value of values) expect(issue.body).not.toContain(value.reportKey);
  }
});

test("a changed image invalidates the reviewed digest and the digest stays frozen on retry", async () => {
  const f = await fixture();
  const value = await f.addScreenshot(report());
  const firstId = f.storageId(value);
  const changedBytes = png.slice();
  changedBytes[changedBytes.length - 1] ^= 1;
  const replacement = await f.addScreenshot(value, new Blob([changedBytes], { type: "image/png" }));
  expect(replacement.screenshotSha256).not.toBe(value.screenshotSha256);
  expect(await f.t.run((ctx) => ctx.db.system.get(firstId))).toBeNull();
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "invalid_report", field: "screenshot" } });
  f.state.createStatus = 503;
  await expect(f.t.action(api.feedback.submit, replacement)).rejects.toMatchObject({ data: { code: "destination_unavailable" } });
  await expect(f.t.action(api.feedback.attachScreenshot, { reportKey: value.reportKey, image: png.buffer })).rejects.toMatchObject({ data: { code: "changed_report" } });
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "changed_report" } });
  f.state.createStatus = 201;
  await f.t.action(api.feedback.submit, replacement);
  expect(f.creates()).toHaveLength(2);
});

test("an omitted digest publishes text only and deletes the attached blob on success", async () => {
  const f = await fixture();
  const value = await f.addScreenshot(report());
  await f.t.action(api.feedback.submit, { ...value, screenshotSha256: undefined });
  expect(f.issues[0].body).not.toContain("## Screenshot");
  expect(await f.t.run((ctx) => ctx.db.system.get(f.storageId(value)))).toBeNull();
});

test("screenshot retention deletes the blob, records the deletion, and preserves exact replay", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  const value = await f.addScreenshot(report());
  const result = await f.t.action(api.feedback.submit, value);
  const saved = await f.t.run((ctx) => ctx.db.query("feedbackReports").unique());
  if (saved?.state !== "created" || !saved.screenshotDeleteAt) throw new Error("Expected created screenshot report");
  expect(saved.screenshotDeleteAt).toBe(Date.now() + retentionMs);
  await f.t.mutation(internal.feedbackStore.deleteScreenshot, { id: saved._id });
  expect(await f.t.run((ctx) => ctx.db.system.get(f.storageId(value)))).not.toBeNull();
  await f.root.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers());
  expect(await f.t.run((ctx) => ctx.db.system.get(f.storageId(value)))).toBeNull();
  expect(await f.t.run((ctx) => ctx.db.get(saved._id))).toMatchObject({ state: "created", result, screenshotDeletedAt: saved.screenshotDeleteAt });
  expect(await f.t.action(api.feedback.submit, value)).toEqual(result);
  expect(f.creates()).toHaveLength(1);
});

test("expiry refuses both attachment changes and reconciles before reporting report_expired", async () => {
  const f = await fixture();
  const value = await f.addScreenshot(report());
  f.state.createStatus = 503;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toThrow();
  const key = await f.t.run((ctx) => ctx.db.query("feedbackReservations").unique());
  if (!key) throw new Error("Expected reservation");
  vi.spyOn(Date, "now").mockReturnValue(key.reservedAt + retentionMs + 1);
  await f.t.mutation(internal.feedbackStore.expire, { reservationId: key._id });
  await expect(f.t.action(api.feedback.attachScreenshot, { reportKey: value.reportKey, image: png.buffer })).rejects.toMatchObject({ data: { code: "report_expired" } });
  await expect(f.t.mutation(api.feedback.removeScreenshot, { reportKey: value.reportKey })).rejects.toMatchObject({ data: { code: "report_expired" } });
  f.state.listStatus = 503;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "destination_unavailable" } });
  f.state.listStatus = 200;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "report_expired" } });
  f.state.createStatus = 201;
  const newKey = await f.addScreenshot({ ...value, reportKey: crypto.randomUUID() });
  expect(await f.t.action(api.feedback.submit, newKey)).toMatchObject({ reference: "#41" });
});

test("expiry can recover a text issue after its pending row has been deleted", async () => {
  const f = await fixture();
  const value = report();
  f.state.loseCreateResponse = true;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toThrow();
  const key = await f.t.run((ctx) => ctx.db.query("feedbackReservations").unique());
  if (!key) throw new Error("Expected reservation");
  vi.spyOn(Date, "now").mockReturnValue(key.reservedAt + retentionMs + 1);
  await f.t.mutation(internal.feedbackStore.expire, { reservationId: key._id });
  expect(await f.t.run((ctx) => ctx.db.query("feedbackReports").collect())).toHaveLength(0);
  expect(await f.t.action(api.feedback.submit, value)).toMatchObject({ reference: "#41" });
  expect(f.creates()).toHaveLength(1);
});

test("unused attached reservations expire with their blob even if never submitted", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  const value = await f.addScreenshot(report());
  await f.root.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers());
  expect(await f.t.run((ctx) => ctx.db.system.get(f.storageId(value)))).toBeNull();
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "report_expired" } });
  expect(f.creates()).toHaveLength(0);
});

test("concurrent different-key claims cannot exceed the send quota", async () => {
  const f = await fixture();
  const values = Array.from({ length: 5 }, () => report());
  for (const value of values) await f.addScreenshot(value);
  const start = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(start + 3600_001);
  for (let i = 0; i < 4; i++) await f.t.action(api.feedback.submit, report());
  const results = await Promise.allSettled(values.map((value) => f.t.action(api.feedback.submit, value)));
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  for (const result of results) if (result.status === "rejected") expect(result.reason).toMatchObject({ data: { code: "rate_limited", retryAfterMs: 3600_000 } });
  expect(f.creates()).toHaveLength(5);
  clock.mockReturnValue(start + 2 * 3600_001);
  const remaining = values.filter((_, index) => results[index].status === "rejected");
  for (const value of remaining) await f.t.action(api.feedback.submit, value);
  expect(f.creates()).toHaveLength(9);
});

test("five pending attached reservations block more attachments across reservation hours", async () => {
  const f = await fixture();
  for (let i = 0; i < 5; i++) {
    const value = await f.addScreenshot(report());
    f.state.createStatus = 503;
    await expect(f.t.action(api.feedback.submit, value)).rejects.toThrow();
  }
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 3600_001);
  await expect(f.addScreenshot(report())).rejects.toMatchObject({ data: { code: "rate_limited" } });
  expect(await f.t.run((ctx) => ctx.db.system.query("_storage").collect())).toHaveLength(5);
});

test.each(["anonymous", "unregistered", "revoked", "clerk-revoked", "wrong-client"])("attachment rejects %s before storing bytes", async (mode) => {
  const f = await fixture();
  let caller = f.t;
  let code = "device_registration_required";
  if (mode === "anonymous") { caller = f.root; code = "authentication_required"; }
  if (mode === "unregistered") await f.t.run((ctx) => ctx.db.delete(f.deviceId));
  if (mode === "revoked") { await f.t.run((ctx) => ctx.db.patch(f.deviceId, { revokedAt: Date.now() })); code = "device_revoked"; }
  if (mode === "clerk-revoked") { f.state.inactive = true; code = "session_inactive"; }
  if (mode === "wrong-client") f.state.wrongClient = true;
  await expect(caller.action(api.feedback.attachScreenshot, { reportKey: report().reportKey, image: png.buffer })).rejects.toMatchObject({ data: { code } });
  expect(await f.t.run((ctx) => ctx.db.system.query("_storage").collect())).toHaveLength(0);
});

test("retention defaults to 30 days and rejects invalid or sub-day server configuration", () => {
  vi.stubEnv("GITHUB_FEEDBACK_SCREENSHOT_RETENTION_DAYS", "");
  expect(screenshotRetentionMs()).toBe(30 * retentionMs);
  for (const value of ["0", "-1", "NaN", "Infinity", "1.5", "9999999999999999"]) {
    vi.stubEnv("GITHUB_FEEDBACK_SCREENSHOT_RETENTION_DAYS", value);
    expect(() => screenshotRetentionMs()).toThrowError();
  }
});

test("sweep retains live reservation and created screenshot references", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const f = await fixture();
  vi.stubEnv("GITHUB_FEEDBACK_SCREENSHOT_RETENTION_DAYS", "2");
  const unsent = await f.addScreenshot(report());
  const sent = await f.addScreenshot(report());
  await f.t.action(api.feedback.submit, sent);
  vi.setSystemTime(Date.now() + unclaimedUploadAgeMs + 1);
  expect(await f.t.mutation(internal.feedbackStore.sweepUnclaimedUploads, {})).toBe(0);
  expect(await f.t.run((ctx) => ctx.db.system.get(f.storageId(unsent)))).not.toBeNull();
  expect(await f.t.run((ctx) => ctx.db.system.get(f.storageId(sent)))).not.toBeNull();
});

test.each([401, 403, 404, 429, 500, 503])("maps a definite create rejection %s without leaking provider details", async (status) => {
  const f = await fixture();
  const value = await f.addScreenshot(report());
  f.state.createStatus = status;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: status === 401 || status === 404 ? "not_configured" : "destination_unavailable" } });
  expect(f.issues).toHaveLength(0);
  expect(f.transport.mock.calls.some(([url]) => /\/(contents|git)\//.test(String(url)))).toBe(false);
  f.state.createStatus = 201;
  await f.t.action(api.feedback.submit, value);
  expect(f.issues).toHaveLength(1);
});

test.each([401, 403, 404, 429, 503])("fails closed when the authenticated GitHub user endpoint returns %s", async (status) => {
  const f = await fixture();
  f.state.userStatus = status;
  await expect(f.t.action(api.feedback.submit, report())).rejects.toMatchObject({ data: { code: status === 401 || status === 404 ? "not_configured" : "destination_unavailable" } });
  expect(f.creates()).toHaveLength(0);
});

test.each(["malformedUser", "malformedList"] as const)("fails closed on %s provider data", async (field) => {
  const f = await fixture();
  f.state[field] = true;
  await expect(f.t.action(api.feedback.submit, report())).rejects.toMatchObject({ data: { code: "destination_unavailable" } });
  expect(f.creates()).toHaveLength(0);
});

test("bounded recovery fails closed if all 100 pages are full", async () => {
  const f = await fixture();
  const value = report();
  f.state.loseCreateResponse = true;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toThrow();
  const unrelated = { ...f.issues[0], body: "different marker" };
  for (let page = 1; page <= 100; page++) f.state.pages.set(page, Array.from({ length: 100 }, () => unrelated));
  f.state.loseCreateResponse = false;
  await f.expireLease();
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "destination_unavailable" } });
  expect(f.creates()).toHaveLength(1);
});

test("an issue with the nonce but another author is never adopted even if it is the only match", async () => {
  const f = await fixture();
  const value = report();
  f.state.loseCreateResponse = true;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toThrow();
  f.issues[0].user.login = "attacker";
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + retentionMs + 1);
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "report_expired" } });
  expect(f.creates()).toHaveLength(1);
});

test("recovery rechecks current device admission before saving an existing issue", async () => {
  const f = await fixture();
  const value = report();
  f.state.loseCreateResponse = true;
  await expect(f.t.action(api.feedback.submit, value)).rejects.toThrow();
  f.state.onList = async () => { await f.t.run((ctx) => ctx.db.patch(f.deviceId, { revokedAt: Date.now() })); };
  await expect(f.t.action(api.feedback.submit, value)).rejects.toMatchObject({ data: { code: "device_revoked", wipeLocalInput: true } });
  expect(await f.t.run((ctx) => ctx.db.query("feedbackReports").unique())).toMatchObject({ state: "pending" });
  expect(f.creates()).toHaveLength(1);
});

test("removing a screenshot is scoped to the current user and is harmless without a reservation", async () => {
  const f = await fixture();
  const value = await f.addScreenshot(report());
  const other = f.root.withIdentity({ ...identity, subject: "second-user", sid: "second-session" });
  await f.t.run(async (ctx) => {
    const device = await ctx.db.get(f.deviceId);
    if (!device) throw new Error("Expected fixture device");
    const { _id, _creationTime, ...fields } = device;
    await ctx.db.insert("mobileDevices", { ...fields, clerkUserId: "second-user", clerkSessionId: "second-session", installId: "second-install" });
  });
  expect(await other.mutation(api.feedback.removeScreenshot, { reportKey: value.reportKey })).toBeNull();
  expect(await f.t.run((ctx) => ctx.db.system.get(f.storageId(value)))).not.toBeNull();
  expect(await f.t.mutation(api.feedback.removeScreenshot, { reportKey: crypto.randomUUID() })).toBeNull();
});

test("sweep advances beyond a referenced full page to delete older orphans", async () => {
  vi.useFakeTimers();
  const f = await fixture();
  const start = Date.now();
  const ids = await f.t.run(async (ctx) => {
    const ids: Id<"_storage">[] = [];
    for (let i = 0; i < 101; i++) {
      const storageId = await ctx.storage.store(new Blob([png], { type: "image/png" }));
      ids.push(storageId);
      if (i < 100) await ctx.db.insert("feedbackReservations", {
        userId: `isolated-user-${i}`, reportKey: crypto.randomUUID(), nonce: crypto.randomUUID(),
        repository: "DanielZamb/lukapp", audience: "public", reservedAt: start,
        screenshot: { storageId, sha256: "0".repeat(64) },
      });
    }
    return ids;
  });
  vi.setSystemTime(start + unclaimedUploadAgeMs + 1);
  expect(await f.t.mutation(internal.feedbackStore.sweepUnclaimedUploads, {})).toBe(0);
  await f.root.finishAllScheduledFunctions(() => vi.runOnlyPendingTimers());
  const remaining = await f.t.run((ctx) => ctx.db.system.query("_storage").collect());
  expect(remaining).toHaveLength(100);
  expect(remaining.some((blob) => blob._id === ids[100])).toBe(false);
});

test("a structurally valid PNG at exactly 5 MiB is accepted with its exact digest", async () => {
  const f = await fixture();
  const image = new Uint8Array(5 * 1024 * 1024);
  const prefix = png.subarray(0, png.length - 12);
  image.set(prefix);
  const chunkLength = image.length - png.length - 12;
  new DataView(image.buffer).setUint32(prefix.length, chunkLength);
  image.set(new TextEncoder().encode("tEXt"), prefix.length + 4);
  image.set(png.subarray(png.length - 12), image.length - 12);
  const result = await f.t.action(api.feedback.attachScreenshot, { reportKey: report().reportKey, image: image.buffer });
  expect(result).toEqual({ sha256: createHash("sha256").update(image).digest("hex") });
  const saved = await f.t.run((ctx) => ctx.db.query("feedbackReservations").unique());
  if (!saved?.screenshot) throw new Error("Expected screenshot");
  const storageId = saved.screenshot.storageId;
  expect(await f.t.run(async (ctx) => (await ctx.storage.get(storageId))?.size)).toBe(5 * 1024 * 1024);
});
