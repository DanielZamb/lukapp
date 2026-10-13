/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import type { UserIdentity } from "convex/server";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { caught, groceries, ownerIdentity, septNow } from "../src/accounting/convexHarness";
import { fixtureKey, fixtureProof, registerFixture } from "../src/access/convexHarness";
import type { DeviceTest, FixtureKey } from "../src/access/convexHarness";
import { accessPolicy, bytesToHex, requestHash } from "../src/access/protocol";
import type { AccessOperation } from "../src/access/protocol";
import type { Id } from "./_generated/dataModel";
import { proveDeviceRequest } from "../src/access/client";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
const now = Date.UTC(2026, 9, 13, 7);
beforeEach(() => {
  vi.stubEnv("LUKAPP_OWNER_CLERK_SUBJECT", ownerIdentity.subject);
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", ownerIdentity.issuer);
  vi.spyOn(Date, "now").mockReturnValue(now);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
function setup() {
  const root = convexTest(schema, modules);
  const session = (sid: string, extra: Partial<UserIdentity> = {}) => root.withIdentity({ ...ownerIdentity, sid, sts: "active", ...extra });
  return { root, session };
}
async function enrolled(t: DeviceTest, platform: "ios" | "android" = "ios") {
  const key = await fixtureKey();
  const device = await registerFixture(t, key, platform);
  return { t, key, device };
}
async function protectedArgs<Request extends object>(client: { t: DeviceTest; key: FixtureKey; device: { id: Id<"mobileDevices"> } }, operation: AccessOperation, request: Request) {
  return { ...request, access: await fixtureProof(client.t, client.key, operation, request, client.device.id) };
}
async function provision(client: Awaited<ReturnType<typeof enrolled>>) {
  return client.t.mutation(api.accounting.createPersonalWorkspace, await protectedArgs(client, "accounting.createPersonalWorkspace", { functionalCurrency: "COP", now: septNow }));
}
async function postingSetup(client: Awaited<ReturnType<typeof enrolled>>) {
  const workspace = await provision(client);
  const profile = await client.t.mutation(api.accounting.createFinancialAccountProfile, await protectedArgs(client, "accounting.createFinancialAccountProfile", { workspaceId: workspace.id, name: "Bank", productKind: "bankAccount" as const }));
  return { workspace, profile };
}

test.each([
  [undefined, "active", "session_id_required"],
  ["", "active", "session_id_invalid"],
  [17, "active", "session_id_invalid"],
  ["not-a-session", "active", "session_id_invalid"],
  ["sess_valid", undefined, "session_state_unverified"],
  ["sess_valid", "pending", "session_not_active"],
])("unverified session facts are denied, sid=%s sts=%s", async (sid, sts, code) => {
  const { root } = setup();
  const t = root.withIdentity({ ...ownerIdentity, sid, sts });
  expect(await t.query(api.devices.status, {})).toEqual({ kind: "denied", code, directive: "wipe-local-input-and-sign-out" });
  expect(await caught(t.mutation(api.accounting.createPersonalWorkspace, { functionalCurrency: "COP", now: septNow }))).toMatchObject({ data: { code } });
  expect(await root.run((ctx) => ctx.db.query("workspaces").collect())).toEqual([]);
});

test("contact/bootstrap endpoints reveal no financial data and registration requires possession", async () => {
  const { session } = setup();
  const t = session("sess_new");
  expect(await t.query(api.devices.status, {})).toEqual({ kind: "denied", code: "device_unregistered", directive: "register-device" });
  expect(await t.query(api.devices.list, {})).toEqual([]);
  expect(await caught(t.query(api.accounting.personalWorkspace, { now: septNow }))).toMatchObject({ data: { code: "device_proof_required" } });
  const key = await fixtureKey();
  const args = { name: "Phone", platform: "ios" as const, publicKey: key.publicKey };
  expect(await caught(t.mutation(api.devices.register, args))).toMatchObject({ data: { code: "device_proof_required" } });
  const access = await fixtureProof(t, key, "devices.register", args);
  expect(await caught(t.mutation(api.devices.register, { ...args, access: { ...access, signature: "0".repeat(128) } }))).toMatchObject({ data: { code: "device_proof_invalid" } });
  expect(await t.run((ctx) => ctx.db.query("mobileDevices").collect())).toEqual([]);
});

test("registration retries and same-session concurrent claims converge on one binding", async () => {
  const { session } = setup();
  const t = session("sess_first");
  const key = await fixtureKey();
  const registrations = await Promise.all(Array.from({ length: 5 }, () => registerFixture(t, key)));
  expect(new Set(registrations.map((device) => device.id)).size).toBe(1);
  expect(await t.run((ctx) => ctx.db.query("mobileDevices").collect())).toHaveLength(1);
  const other = await fixtureKey();
  const args = { name: "Changed", platform: "ios" as const, publicKey: other.publicKey };
  const access = await fixtureProof(t, key, "devices.register", args, registrations[0]?.id);
  expect(await caught(t.mutation(api.devices.register, { ...args, access }))).toMatchObject({ data: { code: "device_proof_invalid" } });
});

test("racing iOS claims take one slot and Android takes the other, with labels treated as metadata", async () => {
  const { session, root } = setup();
  const candidates = await Promise.all(Array.from({ length: 4 }, async (_, i) => ({ t: session(`sess_ios${i}`), key: await fixtureKey() })));
  const results = await Promise.allSettled(candidates.map(({ t, key }) => registerFixture(t, key, "ios", "Claimed iOS")));
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  for (const result of results) if (result.status === "rejected") expect(result.reason).toMatchObject({ data: { code: "device_slot_occupied" } });
  const android = await enrolled(session("sess_android"), "android");
  expect(android.device.platform).toBe("android");
  const all = await root.run((ctx) => ctx.db.query("mobileDevices").collect());
  expect(all.filter((device) => device.state.kind === "active")).toHaveLength(2);
});

test("a sid from arguments, copied id, different signing key and different session cannot grant financial authority", async () => {
  const { session } = setup();
  const first = await enrolled(session("sess_first"));
  const workspace = await provision(first);
  const second = session("sess_second");
  const args = { workspaceId: workspace.id };
  const access = await fixtureProof(first.t, first.key, "accounting.balances", args, first.device.id);
  expect(await caught(second.query(api.accounting.balances, { ...args, access }))).toMatchObject({ data: { code: "device_proof_invalid" } });
  expect(await caught(second.mutation(api.devices.prepare, { operation: "accounting.balances", payloadHash: await requestHash(args), deviceId: first.device.id }))).toMatchObject({ data: { code: "device_unknown" } });
  const thirdKey = await fixtureKey();
  const forged = { ...access, signature: await thirdKey.sign("anything") };
  expect(await caught(first.t.query(api.accounting.balances, { ...args, access: forged }))).toMatchObject({ data: { code: "device_proof_invalid" } });
  const forgedSidArgs = { ...args, sid: "sess_first", access };
  await expect(second.query(api.accounting.balances, forgedSidArgs)).rejects.toThrow();
  expect(await caught(first.t.query(api.accounting.balances, args))).toMatchObject({ data: { code: "device_proof_required" } });
});

test("proof binds operation and payload before any accounting write, and mutation replay is denied", async () => {
  const { session } = setup();
  const client = await enrolled(session("sess_first"));
  const { workspace, profile } = await postingSetup(client);
  const request = groceries(workspace.id, profile.id);
  const signed = await protectedArgs(client, "accounting.recordCashExpense", request);
  expect(await caught(client.t.mutation(api.accounting.recordCashIncome, signed))).toMatchObject({ data: { code: "device_proof_invalid" } });
  expect(await caught(client.t.mutation(api.accounting.recordCashExpense, { ...signed, amount: { currency: "COP", minorUnits: 100 } }))).toMatchObject({ data: { code: "device_request_mismatch" } });
  expect(await client.t.run((ctx) => ctx.db.query("journalEntries").collect())).toEqual([]);
  const first = await client.t.mutation(api.accounting.recordCashExpense, signed);
  expect(first.postedBy).toBe(ownerIdentity.tokenIdentifier);
  expect(await caught(client.t.mutation(api.accounting.recordCashExpense, signed))).toMatchObject({ data: { code: "device_challenge_replayed" } });
  const retry = await client.t.mutation(api.accounting.recordCashExpense, await protectedArgs(client, "accounting.recordCashExpense", request));
  expect(retry.id).toBe(first.id);
  expect(retry.replay).toBe(true);
  expect(await client.t.run((ctx) => ctx.db.query("journalEntries").collect())).toHaveLength(1);
});

test("challenge lifetime uses trusted server time, unaffected by a forged accounting now", async () => {
  const { session } = setup();
  const client = await enrolled(session("sess_first"));
  const request = { functionalCurrency: "COP", now: now + 100 * accessPolicy.maximumLifetimeMs };
  const signed = await protectedArgs(client, "accounting.createPersonalWorkspace", request);
  vi.mocked(Date.now).mockReturnValue(now + accessPolicy.challengeLifetimeMs);
  expect(await caught(client.t.mutation(api.accounting.createPersonalWorkspace, signed))).toMatchObject({ data: { code: "device_challenge_expired" } });
  expect(await client.t.run((ctx) => ctx.db.query("workspaces").collect())).toEqual([]);
});

test("revocation closes the JWT window and causes next-contact wipe, then replacement uses a new sid and key", async () => {
  const { session, root } = setup();
  const lost = await enrolled(session("sess_lost"));
  const { workspace, profile } = await postingSetup(lost);
  const signed = await protectedArgs(lost, "accounting.recordCashExpense", groceries(workspace.id, profile.id));
  const newcomer = session("sess_replacement");
  const newKey = await fixtureKey();
  expect(await caught(registerFixture(newcomer, newKey))).toMatchObject({ data: { code: "device_slot_occupied" } });
  const revokeArgs = { deviceId: lost.device.id };
  const access = await fixtureProof(newcomer, newKey, "devices.revoke", revokeArgs);
  expect(await newcomer.mutation(api.devices.revoke, { ...revokeArgs, access })).toEqual({ kind: "revoked", providerRevocation: "pending-integration" });
  expect(await caught(lost.t.mutation(api.accounting.recordCashExpense, signed))).toMatchObject({ data: { code: "device_revoked", directive: "wipe-local-input-and-sign-out" } });
  expect(await lost.t.query(api.devices.status, {})).toEqual({ kind: "denied", code: "device_revoked", directive: "wipe-local-input-and-sign-out" });
  expect(await caught(registerFixture(lost.t, await fixtureKey()))).toMatchObject({ data: { code: "device_revoked" } });
  expect(await caught(registerFixture(newcomer, lost.key))).toMatchObject({ data: { code: "device_registration_conflict" } });
  const replacement = await registerFixture(newcomer, newKey);
  expect(replacement.id).not.toBe(lost.device.id);
  expect(await root.run((ctx) => ctx.db.query("journalEntries").collect())).toEqual([]);
  expect((await root.run((ctx) => ctx.db.query("mobileDevices").collect())).filter((device) => device.state.kind === "active")).toHaveLength(1);
});

test.each(["inactivity", "maximum"])("binding %s expiry denies financial access and cannot reset through registration", async (kind) => {
  const { session } = setup();
  const client = await enrolled(session("sess_first"));
  const workspace = await provision(client);
  if (kind === "maximum") {
    for (let day = 20; day <= 80; day += 20) {
      vi.mocked(Date.now).mockReturnValue(now + day * 24 * 60 * 60 * 1000);
      await client.t.mutation(api.devices.heartbeat, await protectedArgs(client, "devices.heartbeat", {}));
    }
  }
  const lifetime = kind === "inactivity" ? accessPolicy.inactivityLifetimeMs : accessPolicy.maximumLifetimeMs;
  vi.mocked(Date.now).mockReturnValue(now + lifetime);
  const code = kind === "inactivity" ? "session_inactive" : "session_maximum_lifetime";
  expect(await client.t.query(api.devices.status, {})).toEqual({ kind: "denied", code, directive: "wipe-local-input-and-sign-out" });
  expect(await caught(client.t.query(api.accounting.balances, { workspaceId: workspace.id }))).toMatchObject({ data: { code } });
  expect(await caught(registerFixture(client.t, client.key))).toMatchObject({ data: { code } });
});

test("queries and unproved contact cannot renew inactivity, a proved heartbeat can", async () => {
  const { session } = setup();
  const client = await enrolled(session("sess_first"));
  const workspace = await provision(client);
  vi.mocked(Date.now).mockReturnValue(now + accessPolicy.inactivityLifetimeMs - 1);
  await client.t.query(api.devices.status, {});
  await client.t.query(api.devices.list, {});
  await client.t.query(api.accounting.balances, await protectedArgs(client, "accounting.balances", { workspaceId: workspace.id }));
  expect(await client.t.run((ctx) => ctx.db.get(client.device.id))).toMatchObject({ lastSeenAt: now });
  await client.t.mutation(api.devices.heartbeat, await protectedArgs(client, "devices.heartbeat", {}));
  vi.mocked(Date.now).mockReturnValue(now + accessPolicy.inactivityLifetimeMs);
  expect(await client.t.query(api.devices.status, {})).toMatchObject({ kind: "registered" });
});

test("membership and permission are rechecked after a proof was issued", async () => {
  const { session } = setup();
  const client = await enrolled(session("sess_first"));
  const { workspace, profile } = await postingSetup(client);
  const signed = await protectedArgs(client, "accounting.recordCashExpense", groceries(workspace.id, profile.id));
  await client.t.run(async (ctx) => {
    const membership = await ctx.db.query("workspaceMemberships").unique();
    if (!membership) throw new Error("Fixture membership missing");
    await ctx.db.patch(membership._id, { role: "Preparer" });
  });
  expect(await caught(client.t.mutation(api.accounting.recordCashExpense, signed))).toMatchObject({ data: { code: "workspace_permission_required" } });
  await client.t.run(async (ctx) => {
    const membership = await ctx.db.query("workspaceMemberships").unique();
    if (!membership) throw new Error("Fixture membership missing");
    await ctx.db.delete(membership._id);
  });
  expect(await caught(client.t.mutation(api.accounting.recordCashExpense, signed))).toMatchObject({ data: { code: "workspace_membership_required" } });
  expect(await client.t.run((ctx) => ctx.db.query("journalEntries").collect())).toEqual([]);
});

test("trusted recovery revokes both bindings, blocks unknown old sessions, and retries do not revoke the recovered device", async () => {
  const { session, root } = setup();
  const ios = await enrolled(session("sess_ios"));
  const android = await enrolled(session("sess_android"), "android");
  const workspace = await provision(ios);
  const proof = await protectedArgs(ios, "accounting.balances", { workspaceId: workspace.id });
  const recovery = { ...ownerIdentity, recoveredSid: "sess_recovered", eventId: "fixture-clerk-recovery-1" };
  await root.mutation(internal.devices.applyClerkRecovery, recovery);
  expect(await caught(ios.t.query(api.accounting.balances, proof))).toMatchObject({ data: { code: "device_revoked" } });
  expect(await android.t.query(api.devices.status, {})).toMatchObject({ code: "device_revoked", directive: "wipe-local-input-and-sign-out" });
  const unknownOld = session("sess_preRecoveryUnknown");
  expect(await unknownOld.query(api.devices.status, {})).toEqual({ kind: "denied", code: "recovery_registration_blocked", directive: "wipe-local-input-and-sign-out" });
  expect(await caught(registerFixture(unknownOld, await fixtureKey()))).toMatchObject({ data: { code: "recovery_registration_blocked" } });
  const recovered = await enrolled(session("sess_recovered"));
  await root.mutation(internal.devices.applyClerkRecovery, recovery);
  expect(await recovered.t.query(api.devices.status, {})).toMatchObject({ kind: "registered" });
  expect(await provision(recovered)).toEqual(workspace);
  const newAndroid = session("sess_newAndroid");
  const key = await fixtureKey();
  expect(await caught(registerFixture(newAndroid, key, "android"))).toMatchObject({ data: { code: "recovery_registration_blocked" } });
  await recovered.t.mutation(api.devices.approveRegistration, await protectedArgs(recovered, "devices.approveRegistration", { sid: "sess_newAndroid" }));
  expect(await registerFixture(newAndroid, key, "android")).toMatchObject({ platform: "android" });
});

test("client recovery or device actor claims are rejected, wrong Owner cannot use safe endpoints", async () => {
  const { session } = setup();
  const t = session("sess_unknown");
  const forgedRecovery = { operation: "devices.register" as const, payloadHash: "0".repeat(64), recoveryVerified: true };
  await expect(t.mutation(api.devices.prepare, forgedRecovery)).rejects.toThrow();
  for (const identity of [{ subject: "user_other" }, { issuer: "https://other.clerk.accounts.dev" }]) {
    const caller = session("sess_other", identity);
    expect(await caught(caller.query(api.devices.status, {}))).toMatchObject({ data: { code: "owner_not_allowed" } });
    expect(await caught(caller.query(api.devices.list, {}))).toMatchObject({ data: { code: "owner_not_allowed" } });
  }
});

test("an internally verified provider revocation denies a still-authenticated caller and even an unregistered sid", async () => {
  const { session, root } = setup();
  const client = await enrolled(session("sess_first"));
  const workspace = await provision(client);
  const signed = await protectedArgs(client, "accounting.balances", { workspaceId: workspace.id });
  const event = { ...ownerIdentity, sid: "sess_first" };
  await root.mutation(internal.devices.applyClerkSessionRevocation, event);
  await root.mutation(internal.devices.applyClerkSessionRevocation, event);
  expect(await caught(client.t.query(api.accounting.balances, signed))).toMatchObject({ data: { code: "session_revoked" } });
  expect(await client.t.query(api.devices.status, {})).toEqual({ kind: "denied", code: "session_revoked", directive: "wipe-local-input-and-sign-out" });
  await root.mutation(internal.devices.applyClerkSessionRevocation, { ...ownerIdentity, sid: "sess_unknownOld" });
  expect(await caught(registerFixture(session("sess_unknownOld"), await fixtureKey()))).toMatchObject({ data: { code: "session_revoked" } });
  expect(await root.run((ctx) => ctx.db.query("deviceSessionDenials").collect())).toHaveLength(2);
});


test("the typed native handoff signs registration and a real financial bootstrap through public APIs", async () => {
  const { session } = setup();
  const t = session("sess_nativeContract");
  const fixture = await fixtureKey();
  const key = { publicKey: async () => fixture.publicKey, sign: fixture.sign };
  const hash = { sha256Utf8: async (message: string) => bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message)))) };
  const transport = { prepare: (args: import("../src/access/client").PrepareRequest) => t.mutation(api.devices.prepare, args) };
  const registered = await t.mutation(api.devices.register, await proveDeviceRequest({
    transport, hash, key, operation: "devices.register", request: { name: "Native contract fixture", platform: "ios" as const, publicKey: fixture.publicKey },
  }));
  const workspace = await t.mutation(api.accounting.createPersonalWorkspace, await proveDeviceRequest({
    transport, hash, key, deviceId: registered.id, operation: "accounting.createPersonalWorkspace", request: { functionalCurrency: "COP", now: septNow },
  }));
  expect(workspace).toMatchObject({ kind: "Personal", functionalCurrency: "COP" });
  expect(await t.query(api.devices.status, { deviceId: registered.id })).toMatchObject({ kind: "registered", policy: accessPolicy });
});
