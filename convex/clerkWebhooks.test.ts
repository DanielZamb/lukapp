import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { internalMutation, query } from "./_generated/server";
import { requireDevice, requirePersonalSetup } from "./lib/deviceAuthorization";
import { liveSession } from "./lib/securityValues";
import schema from "./schema";

const owner = "owner-fixture";
const issuer = "https://fixture.clerk.accounts.dev";
const sid = "sess_ios";
const identity = { subject: owner, issuer, sid, sts: "active" };
const registration = { installId: "install-ios-fixture", label: "My iPhone", platform: "ios", appVersion: "1" } as const;
const secretBytes = "local-fixture-key-32-bytes-long!!";
const signingSecret = `whsec_${btoa(secretBytes)}`;
const path = "/clerk/session-events";
const read = makeFunctionReference<"query", Record<string, never>, string>("webhookFixture:read");
const submit = makeFunctionReference<"mutation", { session: import("./lib/session").LiveSession }, string>("webhookFixture:submit");
const modules = {
  ...import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]),
  "./webhookFixture.ts": async () => ({
    read: query({ args: {}, handler: async (ctx) => (await requireDevice(ctx)).actor.userId }),
    submit: internalMutation({ args: { session: liveSession }, handler: async (ctx, { session }) =>
      (await requirePersonalSetup(ctx, session)).userId }),
  }),
};
const live = () => ({
  userId: owner, clerkSessionId: sid, clerkClientId: `client_${sid}`,
  verifiedAt: Date.now(), expiresAt: Date.now() + 90_000, abandonsAt: Date.now() + 90_000,
});
function event(type = "session.revoked", sessionId = sid, userId = owner) {
  return { object: "event", type, timestamp: Date.now(), data: {
    object: "session", id: sessionId, user_id: userId, client_id: `client_${sessionId}`,
    status: type === "session.ended" ? "ended" : "revoked", updated_at: Date.now(),
  } };
}

async function signed(body: string, timestamp = Math.floor(Date.now() / 1000), keyBytes = secretBytes): Promise<RequestInit> {
  const id = "msg_fixture";
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(keyBytes), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${id}.${timestamp}.${body}`));
  return { method: "POST", body, headers: {
    "content-type": "application/json", "svix-id": id, "svix-timestamp": String(timestamp),
    "svix-signature": `v1,${btoa(String.fromCharCode(...new Uint8Array(signature)))}`,
  } };
}

let transport: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", signingSecret);
  vi.stubEnv("LUKAPP_OWNER_CLERK_SUBJECT", owner);
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", issuer);
  vi.stubEnv("CLERK_SECRET_KEY", "fixture-only-not-a-credential");
  transport = vi.fn<typeof fetch>(async (input) => {
    const sessionId = new URL(String(input)).pathname.split("/")[3];
    return Response.json({ id: sessionId, user_id: owner, client_id: `client_${sessionId}`, status: "active",
      created_at: Date.now() - 1000, expire_at: Date.now() + 90_000, abandon_at: Date.now() + 90_000 });
  });
  vi.stubGlobal("fetch", transport);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function fixture() {
  const root = convexTest(schema, modules);
  const client = root.withIdentity(identity);
  const deviceId = await client.action(api.deviceAccess.register, registration);
  transport.mockClear();
  return { root, client, deviceId };
}

test.each(["session.revoked", "session.ended"])("signed %s denies the registered sid through G01 guards", async (type) => {
  const { root, client, deviceId } = await fixture();
  const other = root.withIdentity({ ...identity, sid: "sess_android" });
  await other.action(api.deviceAccess.register, { ...registration, platform: "android", installId: "android-fixture-install" });
  expect(await client.query(read, {})).toBe(owner);
  expect(await client.mutation(submit, { session: live() })).toBe(owner);
  transport.mockClear();
  // The provider fixture still returns active: denial must come from the local transaction.
  const response = await root.fetch(path, await signed(JSON.stringify(event(type))));
  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
  expect(transport).not.toHaveBeenCalled();
  expect(await root.run((ctx) => ctx.db.get(deviceId))).toMatchObject({ revokedAt: expect.any(Number) });
  expect(await client.query(api.deviceAccess.status, {})).toEqual({ status: "revoked", wipeLocalInput: true });
  await expect(client.query(read, {})).rejects.toMatchObject({ data: { code: "device_revoked", wipeLocalInput: true } });
  await expect(client.mutation(submit, { session: live() })).rejects.toMatchObject({ data: { code: "device_revoked" } });
  await expect(client.action(api.deviceAccess.register, registration)).rejects.toMatchObject({ data: { code: "device_revoked" } });
  expect(await other.query(read, {})).toBe(owner);
  expect(await root.run((ctx) => ctx.db.query("clerkRevocations").collect())).toMatchObject([
    { clerkUserId: owner, clerkSessionId: sid, attempts: 0, completedAt: expect.any(Number) },
  ]);
  expect(await root.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).toEqual([]);
});

test("repeated and older terminal events preserve one denial and never restore access", async () => {
  const { root, client, deviceId } = await fixture();
  const revoked = event();
  expect((await root.fetch(path, await signed(JSON.stringify(revoked)))).status).toBe(204);
  const before = await root.run(async (ctx) => ({ device: await ctx.db.get(deviceId), rows: await ctx.db.query("clerkRevocations").collect() }));
  const older = event("session.ended");
  older.timestamp -= 60_000;
  older.data.updated_at -= 60_000;
  for (const payload of [revoked, older, event("session.created")])
    expect((await root.fetch(path, await signed(JSON.stringify(payload)))).status).toBe(204);
  expect(await root.run(async (ctx) => ({ device: await ctx.db.get(deviceId), rows: await ctx.db.query("clerkRevocations").collect() }))).toEqual(before);
  expect(await client.query(api.deviceAccess.status, {})).toEqual({ status: "revoked", wipeLocalInput: true });
  expect(transport).not.toHaveBeenCalled();
});

test("a terminal event before enrollment creates a tombstone and blocks later registration", async () => {
  const root = convexTest(schema, modules);
  expect((await root.fetch(path, await signed(JSON.stringify(event())))).status).toBe(204);
  const client = root.withIdentity(identity);
  expect(await client.query(api.deviceAccess.status, {})).toEqual({ status: "revoked", wipeLocalInput: true });
  await expect(client.action(api.deviceAccess.register, registration)).rejects.toMatchObject({ data: { code: "device_revoked" } });
  expect(await root.run((ctx) => ctx.db.query("mobileDevices").collect())).toEqual([]);
  expect(await root.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).toEqual([]);
});

test("concurrent signed terminal deliveries converge on one permanent denial", async () => {
  const { root, client } = await fixture();
  const deliveries = await Promise.all(["session.revoked", "session.ended"].map((type) => signed(JSON.stringify(event(type)))));
  const responses = await Promise.all(deliveries.map((init) => root.fetch(path, init)));
  expect(responses.map((response) => response.status)).toEqual([204, 204]);
  expect(await root.run((ctx) => ctx.db.query("clerkRevocations").collect())).toHaveLength(1);
  expect(await client.query(api.deviceAccess.status, {})).toEqual({ status: "revoked", wipeLocalInput: true });
  expect(await root.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).toEqual([]);
});

test("provider terminal delivery completes pending local revocation without a webhook revoke loop", async () => {
  vi.useFakeTimers();
  const { root, client, deviceId } = await fixture();
  await client.action(api.deviceAccess.revoke, { deviceId });
  const pending = await root.run((ctx) => ctx.db.query("clerkRevocations").unique());
  if (!pending) throw new Error("missing local revocation");
  transport.mockClear();
  expect((await root.fetch(path, await signed(JSON.stringify(event("session.ended"))))).status).toBe(204);
  expect(await root.run((ctx) => ctx.db.get(pending._id))).toEqual({ ...pending, completedAt: expect.any(Number) });
  await root.finishAllScheduledFunctions(vi.runAllTimers);
  expect(transport).not.toHaveBeenCalled();
  expect(await client.query(api.deviceAccess.status, {})).toEqual({ status: "revoked", wipeLocalInput: true });
});

test.each(["user.updated", "session.created", "session.removed", "future.event"])("verified unrelated %s does not grant or revoke access", async (type) => {
  const { root, client } = await fixture();
  expect((await root.fetch(path, await signed(JSON.stringify({ type, data: null })))).status).toBe(204);
  expect(await client.query(read, {})).toBe(owner);
  expect(await root.withIdentity({ ...identity, sid: "unknown" }).query(api.deviceAccess.status, {}))
    .toEqual({ status: "unregistered", wipeLocalInput: false });
  expect(await root.run((ctx) => ctx.db.query("clerkRevocations").collect())).toEqual([]);
  expect(await root.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).toEqual([]);
  expect(transport).not.toHaveBeenCalled();
});

test.each(["", "   "])("missing signing configuration rejects even an otherwise valid delivery", async (config) => {
  const { root, client } = await fixture();
  vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", config);
  const response = await root.fetch(path, await signed(JSON.stringify(event())));
  expect(response.status).toBe(503);
  expect(await response.text()).toBe("Webhook unavailable");
  expect(await client.query(read, {})).toBe(owner);
  expect(await root.run((ctx) => ctx.db.query("clerkRevocations").collect())).toEqual([]);
});

test.each(["svix-id", "svix-timestamp", "svix-signature"])("missing %s fails verification", async (header) => {
  const { root, client } = await fixture();
  const init = await signed(JSON.stringify(event()));
  const headers = new Headers(init.headers);
  headers.delete(header);
  expect((await root.fetch(path, { ...init, headers })).status).toBe(400);
  expect(await client.query(read, {})).toBe(owner);
  expect(await root.run((ctx) => ctx.db.query("clerkRevocations").collect())).toEqual([]);
});

test.each(["unsigned", "tampered", "wrong key", "stale", "future", "invalid JSON"])("%s delivery cannot change denial state or leak diagnostics", async (mode) => {
  const { root, client } = await fixture();
  const logMethods = ["log", "info", "warn", "error", "debug"] as const;
  const logs = logMethods.map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
  const body = JSON.stringify(event());
  let init = await signed(body);
  if (mode === "unsigned") init = { method: "POST", body };
  if (mode === "tampered") init = { ...init, body: `${body} ` };
  if (mode === "wrong key") init = await signed(body, Math.floor(Date.now() / 1000), "different-fixture-key");
  if (mode === "stale") init = await signed(body, Math.floor(Date.now() / 1000) - 600);
  if (mode === "future") init = await signed(body, Math.floor(Date.now() / 1000) + 600);
  if (mode === "invalid JSON") init = await signed("{invalid-json");
  const response = await root.fetch(path, init);
  expect(response.status).toBe(400);
  expect(await response.text()).toBe("Invalid webhook");
  expect(await client.query(read, {})).toBe(owner);
  expect(await root.run((ctx) => ctx.db.query("clerkRevocations").collect())).toEqual([]);
  for (const log of logs) expect(log).not.toHaveBeenCalled();
});

test.each([
  {}, { type: 1 }, { type: "" }, { type: "session.revoked" }, { type: "session.ended", data: null },
  { ...event(), data: { ...event().data, id: "" } },
  { ...event(), data: { ...event().data, user_id: " " } },
  { ...event(), data: { ...event().data, user_id: null } },
  { ...event(), data: { ...event().data, object: "user" } },
  { ...event(), data: { ...event().data, status: "active" } },
  { ...event("session.ended"), data: event().data },
])("signed malformed envelope or relevant payload fails closed", async (payload) => {
  const { root, client } = await fixture();
  expect((await root.fetch(path, await signed(JSON.stringify(payload)))).status).toBe(400);
  expect(await client.query(read, {})).toBe(owner);
  expect(await root.run((ctx) => ctx.db.query("clerkRevocations").collect())).toEqual([]);
});

test("owner mismatch fails atomically with a retryable response and preserves prior denial", async () => {
  const { root, deviceId } = await fixture();
  const before = await root.run((ctx) => ctx.db.get(deviceId));
  const conflict = event("session.revoked", sid, "foreign-subject");
  const rejected = await root.fetch(path, await signed(JSON.stringify(conflict)));
  expect(rejected.status).toBe(503);
  expect(await rejected.text()).toBe("Webhook reconciliation failed");
  expect(await root.run((ctx) => ctx.db.get(deviceId))).toEqual(before);
  expect(await root.run((ctx) => ctx.db.query("clerkRevocations").collect())).toEqual([]);
  expect((await root.fetch(path, await signed(JSON.stringify(event())))).status).toBe(204);
  const denial = await root.run((ctx) => ctx.db.query("clerkRevocations").unique());
  expect((await root.fetch(path, await signed(JSON.stringify(conflict)))).status).toBe(503);
  expect(await root.run((ctx) => ctx.db.query("clerkRevocations").unique())).toEqual(denial);
  expect(transport).not.toHaveBeenCalled();
});

test("only the exact POST webhook route is registered", async () => {
  const { root, client } = await fixture();
  expect((await root.fetch(path, { method: "GET" })).status).toBe(404);
  expect((await root.fetch(`${path}/extra`, await signed(JSON.stringify(event())))).status).toBe(404);
  expect(await client.query(read, {})).toBe(owner);
});
