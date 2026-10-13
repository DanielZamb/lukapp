import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import type { SessionJSON } from "@clerk/backend";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { caught, ownerIdentity, septNow } from "../src/accounting/convexHarness";
import { fixtureKey, fixtureProof, registerFixture } from "../src/access/convexHarness";
import { providerFunctions } from "../src/access/provider";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
const now = Date.UTC(2026, 9, 13, 7);
const instanceId = "ins_fixture";
const signingBytes = new Uint8Array(32).fill(42);
const signingSecret = `whsec_${btoa(String.fromCharCode(...signingBytes))}`;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  vi.stubEnv("LUKAPP_OWNER_CLERK_SUBJECT", ownerIdentity.subject);
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", ownerIdentity.issuer);
  vi.stubEnv("CLERK_INSTANCE_ID", instanceId);
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_controlled_fixture");
  vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", signingSecret);
  vi.stubEnv("NODE_ENV", "test");
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
function providerSession(id: string, extra: Partial<SessionJSON> = {}): SessionJSON {
  return { id, object: "session", client_id: `client_${id}`, user_id: ownerIdentity.subject, status: "active", actor: null,
    created_at: now - 100_000, updated_at: now - 100_000, expire_at: now + 90 * 86400_000,
    abandon_at: now + 30 * 86400_000, last_active_at: now, ...extra };
}
function setup(sessions: SessionJSON[] = []) {
  const root = convexTest(schema, modules);
  const state = new Map(sessions.map((session) => [session.id, session]));
  const calls: { method: string; path: string; offset: number; status: string | null }[] = [];
  const failures = new Set<string>();
  const lostResponses = new Set<string>();
  let issuer = ownerIdentity.issuer;
  let listOwner = ownerIdentity.subject;
  let pageSize = 100;
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== "https://api.clerk.com") throw new Error("Uncontrolled transport denied");
    const path = url.pathname;
    const method = init?.method ?? "GET";
    calls.push({ method, path, offset: Number(url.searchParams.get("offset") ?? 0), status: url.searchParams.get("status") });
    if (failures.has(path)) return Response.json({ errors: [{ code: "fixture_unavailable", message: "fixture unavailable" }] }, { status: 503 });
    if (path === "/v1/domains") return Response.json({ data: [{ object: "domain", id: "dmn_fixture", name: "fixture", frontend_api_url: issuer, is_satellite: false, cname_targets: [], development_origin: "http://localhost" }], total_count: 1 });
    if (path === "/v1/instance") return Response.json({ object: "instance", id: instanceId, environment_type: "development", allowed_origins: [] });
    if (path === "/v1/sessions") {
      if (url.searchParams.get("user_id") !== ownerIdentity.subject || url.searchParams.has("status")) throw new Error("Unsafe session enumeration");
      const all = [...state.values()].sort((a, b) => b.created_at - a.created_at);
      const offset = Number(url.searchParams.get("offset"));
      return Response.json({ data: all.slice(offset, offset + Math.min(pageSize, Number(url.searchParams.get("limit")))).map((session) => ({ ...session, user_id: listOwner })), total_count: all.length });
    }
    const sid = path.split("/")[3];
    if (!sid || !path.startsWith("/v1/sessions/")) throw new Error("Unexpected provider method");
    const session = state.get(sid);
    if (!session) return Response.json({ errors: [{ code: "resource_not_found", message: "missing" }] }, { status: 404 });
    if (method === "POST" && path.endsWith("/revoke")) {
      session.status = "revoked";
      if (lostResponses.has(sid)) { lostResponses.delete(sid); throw new Error("Lost provider response after success"); }
    }
    return Response.json(session);
  }));
  const client = (sid: string, extra: Partial<typeof ownerIdentity> = {}) => root.withIdentity({ ...ownerIdentity, sid, sts: "active", aud: "convex", ...extra });
  return { root, state, calls, failures, lostResponses, client,
    wrongIssuer: () => { issuer = "https://wrong.clerk.accounts.dev"; },
    wrongListOwner: () => { listOwner = "user_wrong"; },
    paginate: (size: number) => { pageSize = size; } };
}
async function enrolled(t: ReturnType<ReturnType<typeof setup>["client"]>) {
  const key = await fixtureKey(); const device = await registerFixture(t, key);
  return { t, key, device };
}
async function revoke(client: Awaited<ReturnType<typeof enrolled>>, target = client.device.id) {
  const args = { deviceId: target };
  return client.t.mutation(api.devices.revoke, { ...args, access: await fixtureProof(client.t, client.key, "devices.revoke", args, client.device.id) });
}
async function signedEvent(eventId: string, type = "session.revoked", data: unknown = { ...providerSession("sess_old", { status: "revoked" }), user: null }, extra: object = {}) {
  const body = JSON.stringify({ object: "event", type, data, timestamp: Date.now(), instance_id: instanceId, ...extra });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = await crypto.subtle.importKey("raw", signingBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${eventId}.${timestamp}.${body}`)));
  return new Request("https://fixture.convex.site/clerk/session-events", { method: "POST", body, headers: {
    "svix-id": eventId, "svix-timestamp": timestamp, "svix-signature": `v1,${btoa(String.fromCharCode(...signature))}`,
  } });
}

async function deliver(root: ReturnType<typeof setup>["root"], request: Request) {
  return root.fetch("/clerk/session-events", { method: "POST", headers: request.headers, body: await request.text() });
}

test("actual SDK live check rejects a revoked session despite unchanged admitted JWT and denies public financial calls", async () => {
  const s = setup([providerSession("sess_old", { status: "revoked" })]);
  const c = await enrolled(s.client("sess_old"));
  const request = { functionalCurrency: "COP", now: septNow };
  const access = await fixtureProof(c.t, c.key, "accounting.createPersonalWorkspace", request, c.device.id);
  expect(await c.t.action(providerFunctions.checkSession, {})).toEqual({ kind: "denied", code: "provider_session_terminal", directive: "wipe-local-input-and-sign-out" });
  expect(await caught(c.t.mutation(api.accounting.createPersonalWorkspace, { ...request, access }))).toMatchObject({ data: { code: "session_revoked" } });
  expect(await c.t.query(api.devices.status, {})).toMatchObject({ code: "session_revoked" });
  expect(await s.root.run((ctx) => ctx.db.query("workspaces").collect())).toEqual([]);
});

test.each(["user", "session", "issuer", "impersonation"])("live provider provenance rejects wrong %s", async (kind) => {
  const s = setup([providerSession("sess_old")]);
  const row = s.state.get("sess_old"); if (!row) throw new Error("fixture missing");
  if (kind === "user") row.user_id = "user_wrong";
  if (kind === "session") row.id = "sess_wrong";
  if (kind === "issuer") s.wrongIssuer();
  if (kind === "impersonation") row.actor = { sub: "user_other" };
  expect(await s.client("sess_old").action(api.clerkProvider.checkSession, {})).toMatchObject({ kind: "denied", code: "provider_provenance_mismatch" });
  expect(s.calls.some((call) => call.method === "POST")).toBe(false);
});

test("wrong authenticated Owner is rejected without provider access, and public facts cannot be injected", async () => {
  const s = setup([providerSession("sess_old")]);
  expect(await caught(s.client("sess_old", { subject: "user_wrong" }).action(api.clerkProvider.beginRecovery, {}))).toMatchObject({ data: { code: "owner_not_allowed" } });
  expect(s.calls).toEqual([]);
  const claims = JSON.parse(JSON.stringify({ sid: "sess_other", providerCreatedAt: Date.now(), recovered: true }));
  await expect(s.client("sess_old").action(api.clerkProvider.beginRecovery, claims)).rejects.toThrow();
  expect(s.calls).toEqual([]);
});

test("local revoke commits denial before provider failure, retry converges and never restores access", async () => {
  const s = setup([providerSession("sess_old")]); const c = await enrolled(s.client("sess_old"));
  const result = await revoke(c);
  expect(result).toMatchObject({ kind: "revoked", providerRevocation: { kind: "pending" } });
  expect(s.calls).toEqual([]);
  expect(await c.t.query(api.devices.status, {})).toMatchObject({ code: "device_revoked" });
  s.failures.add("/v1/sessions/sess_old/revoke");
  await s.root.action(internal.clerkProvider.process, { workId: result.workId });
  expect(await c.t.query(providerFunctions.workStatus, { workId: result.workId })).toMatchObject({ state: { kind: "pending", error: "provider_unavailable" } });
  expect(await c.t.query(api.devices.status, {})).toMatchObject({ code: "session_revoked" });
  s.failures.clear(); vi.setSystemTime(now + 10_000);
  await s.root.action(internal.clerkProvider.process, { workId: result.workId });
  expect(await c.t.query(api.providerWork.status, { workId: result.workId })).toMatchObject({ state: { kind: "succeeded" } });
  expect(s.state.get("sess_old")?.status).toBe("revoked");
  await s.root.action(internal.clerkProvider.process, { workId: result.workId });
  expect(s.calls.filter((call) => call.method === "POST")).toHaveLength(2);
});

test("a lost response after provider success retries by reading terminal state instead of revoking again", async () => {
  const s = setup([providerSession("sess_old")]); const c = await enrolled(s.client("sess_old"));
  const result = await revoke(c); s.lostResponses.add("sess_old");
  await s.root.action(internal.clerkProvider.process, { workId: result.workId });
  expect(await c.t.query(api.providerWork.status, { workId: result.workId })).toMatchObject({ state: { kind: "pending" } });
  vi.setSystemTime(now + 10_000); await s.root.action(internal.clerkProvider.process, { workId: result.workId });
  expect(await c.t.query(api.providerWork.status, { workId: result.workId })).toMatchObject({ state: { kind: "succeeded" } });
  expect(s.calls.filter((call) => call.method === "POST")).toHaveLength(1);
});

test("wrong target Owner never receives provider revocation while local denial remains", async () => {
  const s = setup([providerSession("sess_old", { user_id: "user_wrong" })]); const c = await enrolled(s.client("sess_old"));
  const result = await revoke(c); await s.root.action(internal.clerkProvider.process, { workId: result.workId });
  expect(await c.t.query(api.providerWork.status, { workId: result.workId })).toMatchObject({ state: { kind: "pending", error: "provider_provenance_mismatch" } });
  expect(s.calls.some((call) => call.method === "POST")).toBe(false);
  expect(await c.t.query(api.devices.status, {})).toMatchObject({ code: "session_revoked" });
});

test("missing provider configuration is sanitized and durable, not fabricated success", async () => {
  const s = setup([providerSession("sess_old")]); const c = await enrolled(s.client("sess_old")); vi.stubEnv("CLERK_SECRET_KEY", "");
  const result = await revoke(c); await s.root.action(internal.clerkProvider.process, { workId: result.workId });
  expect(await c.t.query(api.providerWork.status, { workId: result.workId })).toMatchObject({ state: { kind: "pending", error: "provider_configuration_required" } });
  expect(await c.t.action(api.clerkProvider.checkSession, {})).toEqual({ kind: "unavailable", code: "provider_configuration_required" });
  expect(s.calls).toEqual([]);
});

test("provider 404 proves session absence after instance verification and retains denial", async () => {
  const s = setup(); const c = await enrolled(s.client("sess_missing")); const result = await revoke(c);
  await s.root.action(internal.clerkProvider.process, { workId: result.workId });
  expect(await c.t.query(api.providerWork.status, { workId: result.workId })).toMatchObject({ state: { kind: "succeeded" } });
  expect(await c.t.query(api.devices.status, {})).toMatchObject({ code: "session_revoked" });
});

test("recovery requires an actual Session created after intent, not a fresh JWT iat or reused Session", async () => {
  const s = setup([providerSession("sess_old"), providerSession("sess_reused")]);
  const intent = await s.client("sess_old").action(api.clerkProvider.beginRecovery, {});
  for (const sid of ["sess_old", "sess_reused"]) {
    const t = s.root.withIdentity({ ...ownerIdentity, sid, sts: "active", iat: Math.floor(now / 1000) + 1 });
    expect(await caught(t.action(api.clerkProvider.completeRecovery, { intentId: intent.intentId }))).toMatchObject({ data: { code: "recovery_fresh_sign_in_required" } });
  }
  expect(await s.root.run((ctx) => ctx.db.query("deviceRecoveryBarriers").collect())).toEqual([]);
  expect(s.calls.some((call) => call.method === "POST")).toBe(false);
});

test("expired intents and future or terminal Sessions cannot start recovery", async () => {
  const s = setup([providerSession("sess_old")]); const intent = await s.client("sess_old").action(api.clerkProvider.beginRecovery, {});
  s.state.set("sess_new", providerSession("sess_new", { created_at: now + 1000 }));
  expect(await caught(s.client("sess_new").action(api.clerkProvider.completeRecovery, { intentId: intent.intentId }))).toMatchObject({ data: { code: "provider_session_invalid" } });
  vi.setSystemTime(now + 11 * 60_000);
  expect(await caught(s.client("sess_new").action(api.clerkProvider.completeRecovery, { intentId: intent.intentId }))).toMatchObject({ data: { code: "recovery_intent_expired" } });
  const terminal = s.state.get("sess_new"); if (!terminal) throw new Error("fixture missing"); terminal.status = "revoked";
  expect(await caught(s.client("sess_new").action(api.clerkProvider.beginRecovery, {}))).toMatchObject({ data: { code: "provider_session_terminal" } });
});

test("recovery paginates never-enrolled sessions, partial failure retains barrier and retry preserves chosen binding", async () => {
  const s = setup([providerSession("sess_old"), ...Array.from({ length: 5 }, (_, i) => providerSession(`sess_hidden${i}`))]);
  const old = await enrolled(s.client("sess_old")); s.paginate(2);
  const intent = await old.t.action(api.clerkProvider.beginRecovery, {});
  s.state.set("sess_new", providerSession("sess_new", { created_at: now + 1000 })); vi.setSystemTime(now + 2000);
  s.failures.add("/v1/sessions/sess_hidden2/revoke");
  const result = await s.client("sess_new").action(api.clerkProvider.completeRecovery, { intentId: intent.intentId });
  expect(result.state).toMatchObject({ kind: "pending", error: "provider_unavailable" });
  expect(s.calls.filter((call) => call.path === "/v1/sessions").map((call) => call.offset)).toEqual([0, 2, 4]);
  expect(await old.t.query(api.devices.status, {})).toMatchObject({ kind: "denied" });
  expect(await s.client("sess_hidden4").query(api.devices.status, {})).toMatchObject({ code: "recovery_registration_blocked" });
  const recovered = await enrolled(s.client("sess_new"));
  s.failures.clear(); vi.setSystemTime(now + 12_000);
  await s.root.action(internal.clerkProvider.process, { workId: result.workId });
  expect(await recovered.t.query(api.devices.status, {})).toMatchObject({ kind: "registered", device: { id: recovered.device.id } });
  expect([...s.state.values()].filter((session) => session.status === "active").map((session) => session.id)).toEqual(["sess_new"]);
  expect(await s.client("sess_hidden4").query(api.devices.status, {})).toMatchObject({ code: "session_revoked" });
  const replay = await recovered.t.action(api.clerkProvider.completeRecovery, { intentId: intent.intentId });
  expect(replay).toMatchObject({ workId: result.workId, state: { kind: "succeeded" } });
  expect(await recovered.t.query(api.devices.status, {})).toMatchObject({ kind: "registered" });
  expect(s.calls.some((call) => call.method === "POST" && call.path.includes("sess_new"))).toBe(false);
});

test("recovery excludes newer sessions, rejects replay with another Session, and serializes concurrent intents", async () => {
  const s = setup([providerSession("sess_old")]);
  const first = await s.client("sess_old").action(api.clerkProvider.beginRecovery, {});
  expect(await s.client("sess_old").action(api.clerkProvider.beginRecovery, {})).toEqual(first);
  s.state.set("sess_new", providerSession("sess_new", { created_at: now + 1000 }));
  s.state.set("sess_later", providerSession("sess_later", { created_at: now + 1500 })); vi.setSystemTime(now + 2000);
  expect(await caught(s.client("sess_later").action(api.clerkProvider.beginRecovery, {}))).toMatchObject({ data: { code: "recovery_conflict" } });
  const result = await s.client("sess_new").action(api.clerkProvider.completeRecovery, { intentId: first.intentId });
  expect(result.state.kind).toBe("succeeded"); expect(s.state.get("sess_later")?.status).toBe("active");
  expect(await s.client("sess_later").query(api.devices.status, {})).toMatchObject({ code: "recovery_registration_blocked" });
  expect(await caught(s.client("sess_later").action(api.clerkProvider.completeRecovery, { intentId: first.intentId }))).toMatchObject({ data: { code: "recovery_conflict" } });
});

test("wrong Owner in session pagination prevents revocation and keeps recovery pending", async () => {
  const s = setup([providerSession("sess_old")]); const intent = await s.client("sess_old").action(api.clerkProvider.beginRecovery, {});
  s.state.set("sess_new", providerSession("sess_new", { created_at: now + 1000 })); vi.setSystemTime(now + 2000); s.wrongListOwner();
  const result = await s.client("sess_new").action(api.clerkProvider.completeRecovery, { intentId: intent.intentId });
  expect(result.state).toMatchObject({ kind: "pending", error: "provider_provenance_mismatch" });
  expect(s.calls.some((call) => call.method === "POST")).toBe(false);
  expect(await s.client("sess_old").query(api.devices.status, {})).toMatchObject({ code: "recovery_registration_blocked" });
});

test.each(["session.ended", "session.removed", "session.revoked"])("signature-verified %s denies an owned session and authentic delivery dedupes", async (type) => {
  const s = setup([providerSession("sess_old")]); const c = await enrolled(s.client("sess_old"));
  const data = { ...providerSession("sess_old", { status: type.slice(8) }), user: null };
  expect((await deliver(s.root, await signedEvent("msg_once", type, data))).status).toBe(200);
  expect((await deliver(s.root, await signedEvent("msg_once", type, data))).status).toBe(200);
  expect(await c.t.query(api.devices.status, {})).toMatchObject({ code: "session_revoked" });
  expect(await s.root.run((ctx) => ctx.db.query("clerkWebhookDeliveries").collect())).toHaveLength(1);
  expect(await s.root.run((ctx) => ctx.db.query("deviceSessionDenials").collect())).toHaveLength(1);
  expect(s.calls).toEqual([]);
});

test("invalid signatures, wrong Owner/instance, malformed terminal data and contradictory duplicate are rejected", async () => {
  const s = setup(); const request = await signedEvent("msg_invalid"); request.headers.set("svix-signature", "v1,invalid");
  expect((await deliver(s.root, request)).status).toBe(400);
  expect((await deliver(s.root, await signedEvent("msg_wrong", "session.revoked", { ...providerSession("sess_old", { user_id: "user_wrong", status: "revoked" }), user: null }))).status).toBe(400);
  expect((await deliver(s.root, await signedEvent("msg_instance", undefined, undefined, { instance_id: "ins_wrong" }))).status).toBe(400);
  expect((await deliver(s.root, await signedEvent("msg_bad", "session.revoked", { id: "sess_old" }))).status).toBe(400);
  expect(await s.root.run((ctx) => ctx.db.query("deviceSessionDenials").collect())).toEqual([]);
  expect((await deliver(s.root, await signedEvent("msg_good"))).status).toBe(200);
  expect((await deliver(s.root, await signedEvent("msg_good", "session.revoked", { ...providerSession("sess_other", { status: "revoked" }), user: null }))).status).toBe(400);
  expect(await s.root.run((ctx) => ctx.db.query("deviceSessionDenials").collect())).toHaveLength(1);
});

test("late creation event cannot undo a terminal denial or initiate recovery", async () => {
  const s = setup(); expect((await deliver(s.root, await signedEvent("msg_terminal"))).status).toBe(200);
  expect((await deliver(s.root, await signedEvent("msg_created", "session.created", { ...providerSession("sess_old"), user: null }, { timestamp: now - 5000 }))).status).toBe(200);
  expect(await s.client("sess_old").query(api.devices.status, {})).toMatchObject({ code: "session_revoked" });
  expect(await s.root.run((ctx) => ctx.db.query("deviceRecoveryEvents").collect())).toEqual([]);
});

test("readiness emits only nonsecret booleans and unobserved settings, provider lifetime stays separate", async () => {
  const s = setup([providerSession("sess_old")]); const c = await enrolled(s.client("sess_old"));
  expect(await c.t.query(providerFunctions.developmentReadiness, {})).toEqual({ ownerAdmitted: true, sidPresent: true, sidValid: true,
    activeStatusClaim: true, convexAudience: true, backendConfigured: true, webhookConfigured: true,
    nativeApi: "unobserved", clerkLifetimeSettings: "unobserved" });
  expect(await c.t.action(providerFunctions.checkSession, {})).toEqual({ kind: "active", providerCreatedAt: now - 100_000, providerExpiresAt: now + 90 * 86400_000 });
  expect((await c.t.query(api.devices.status, {}))).toMatchObject({ kind: "registered", device: { createdAt: now } });
  const missing = s.root.withIdentity({ ...ownerIdentity });
  expect(await missing.query(api.authConnection.developmentReadiness, {})).toMatchObject({ sidPresent: false, sidValid: false, activeStatusClaim: false, convexAudience: false });
});


test("automatic scheduled work succeeds, and an interrupted claimed attempt resumes through its durable watchdog", async () => {
  const s = setup([providerSession("sess_old")]); const c = await enrolled(s.client("sess_old")); const result = await revoke(c);
  const claimed = await s.root.mutation(internal.providerWork.claimAttempt, { workId: result.workId });
  expect(claimed?.attempts).toBe(1);
  await s.root.action(internal.clerkProvider.process, { workId: result.workId });
  expect(s.calls).toEqual([]);
  await s.root.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect(await c.t.query(api.providerWork.status, { workId: result.workId })).toMatchObject({ state: { kind: "succeeded" } });
  expect(s.state.get("sess_old")?.status).toBe("revoked");
  expect(s.calls.filter((call) => call.method === "POST")).toHaveLength(1);
});

test("recovery finishes older-session retry even if the preserved session later ends", async () => {
  const s = setup([providerSession("sess_old")]); const intent = await s.client("sess_old").action(api.clerkProvider.beginRecovery, {});
  s.state.set("sess_new", providerSession("sess_new", { created_at: now + 1000 })); vi.setSystemTime(now + 2000);
  s.failures.add("/v1/sessions/sess_old/revoke");
  const result = await s.client("sess_new").action(api.clerkProvider.completeRecovery, { intentId: intent.intentId });
  expect(result.state.kind).toBe("pending");
  const chosen = s.state.get("sess_new"); if (!chosen) throw new Error("fixture missing"); chosen.status = "ended";
  s.failures.clear(); vi.setSystemTime(now + 12_000); await s.root.action(internal.clerkProvider.process, { workId: result.workId });
  expect(await s.client("sess_new").query(api.providerWork.status, { workId: result.workId })).toMatchObject({ state: { kind: "succeeded" } });
  expect(s.state.get("sess_old")?.status).toBe("revoked");
  expect(s.calls.some((call) => call.method === "POST" && call.path.includes("sess_new"))).toBe(false);
});

test("retrying local revoke from another eligible session dedupes durable provider work", async () => {
  const s = setup([providerSession("sess_old"), providerSession("sess_safety")]); const c = await enrolled(s.client("sess_old"));
  const first = await revoke(c); const safety = s.client("sess_safety"); const key = await fixtureKey(); const args = { deviceId: c.device.id };
  const retry = await safety.mutation(api.devices.revoke, { ...args, access: await fixtureProof(safety, key, "devices.revoke", args) });
  expect(retry.workId).toBe(first.workId);
  expect(await s.root.run((ctx) => ctx.db.query("clerkProviderWork").collect())).toHaveLength(1);
  const forged = JSON.parse(JSON.stringify({ workId: first.workId, subject: "user_wrong" }));
  await expect(safety.query(api.providerWork.status, forged)).rejects.toThrow();
});

test("recovery checkpoints page progress and resumes beyond the action chunk without truncation", async () => {
  const s = setup([providerSession("sess_old"), ...Array.from({ length: 23 }, (_, i) => providerSession(`sess_many${i}`))]); s.paginate(1);
  const intent = await s.client("sess_old").action(api.clerkProvider.beginRecovery, {});
  s.state.set("sess_new", providerSession("sess_new", { created_at: now + 1000 })); vi.setSystemTime(now + 2000);
  const result = await s.client("sess_new").action(api.clerkProvider.completeRecovery, { intentId: intent.intentId });
  expect(result.state.kind).toBe("pending");
  expect(await s.root.query(internal.providerWork.get, { workId: result.workId })).toMatchObject({ target: { scan: { offset: 20, hadLive: true } } });
  await s.root.finishAllScheduledFunctions(() => vi.runAllTimers());
  expect(await s.client("sess_new").query(api.providerWork.status, { workId: result.workId })).toMatchObject({ state: { kind: "succeeded" } });
  expect([...s.state.values()].filter((session) => session.status === "active").map((session) => session.id)).toEqual(["sess_new"]);
  expect(s.calls.filter((call) => call.method === "POST")).toHaveLength(24);
  expect(s.calls.some((call) => call.path === "/v1/sessions" && call.offset === 24)).toBe(true);
});
