import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { action, internalMutation, query } from "./_generated/server";
import { verifyCurrentSession } from "./lib/session";
import { requirePersonalSetup, requireSubmission, requireWorkspacePermission, requireRolePermission } from "./lib/deviceAuthorization";
import { liveSession } from "./lib/securityValues";
import { ensurePersonalDefaults } from "./personalDefaults";
import { createAccountingCore } from "../src/accounting";
import { convexReadStore, convexStore } from "./store";
import { money } from "./validators";
import type { ClerkSession } from "./lib/clerkProvider";

const owner = "owner-fixture";
const issuer = "https://fixture.clerk.accounts.dev";
const identity = { subject: owner, issuer, sid: "sess_ios", sts: "active" };
const registration = { installId: "install-ios-fixture", label: "My iPhone", platform: "ios", appVersion: "1" } as const;
type Setup = Awaited<ReturnType<typeof ensurePersonalDefaults>>;
const setup = makeFunctionReference<"action", Record<string, never>, Setup>("securityFixture:setup");
const setupInternal = makeFunctionReference<"mutation", { session: import("./lib/session").LiveSession }, Setup>("securityFixture:setupInternal");
const expenseArgs = {
  workspaceId: v.string(), financialAccountProfileId: v.string(), amount: money,
  accountingDate: v.string(), description: v.string(), idempotencyKey: v.string(),
};
const expense = makeFunctionReference<"action">("securityFixture:expense");
const expenseInternal = makeFunctionReference<"mutation">("securityFixture:expenseInternal");
const read = makeFunctionReference<"query">("securityFixture:read");
const modules = {
  ...import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]),
  // These representative adapters exist only in this test's module loader, never in the deployed API.
  "./securityFixture.ts": async () => ({
    setup: action({ args: {}, handler: async (ctx): Promise<Setup> => ctx.runMutation(setupInternal, { session: await verifyCurrentSession(ctx.auth) }) }),
    setupInternal: internalMutation({ args: { session: liveSession }, handler: async (ctx, { session }) => {
      const actor = await requirePersonalSetup(ctx, session);
      return ensurePersonalDefaults(ctx, actor, { functionalCurrency: "COP", startingMinorUnits: 1000 });
    } }),
    expense: action({ args: expenseArgs, handler: async (ctx, args) => ctx.runMutation(expenseInternal, { ...args, session: await verifyCurrentSession(ctx.auth) }) }),
    expenseInternal: internalMutation({ args: { ...expenseArgs, session: liveSession }, handler: async (ctx, { session, ...args }) => {
      const actor = await requireSubmission(ctx, { session, workspaceId: args.workspaceId, permission: "accounting:post" });
      return createAccountingCore(convexStore(ctx.db)).recordCashExpense({ ...args, actor });
    } }),
    read: query({ args: { workspaceId: v.string() }, handler: async (ctx, args) => {
      const actor = await requireWorkspacePermission(ctx, { ...args, permission: "workspace:read" });
      return createAccountingCore(convexReadStore(ctx.db)).balances({ ...args, actor });
    } }),
  }),
};

let sessions: Map<string, ClerkSession>;
let transport: ReturnType<typeof vi.fn<typeof fetch>>;
function session(id: string, userId = owner): ClerkSession {
  return { id, user_id: userId, client_id: `client_${id}`, status: "active", created_at: Date.now() - 1000, expire_at: Date.now() + 90_000, abandon_at: Date.now() + 90_000 };
}
beforeEach(() => {
  vi.stubEnv("LUKAPP_OWNER_CLERK_SUBJECT", owner);
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", issuer);
  vi.stubEnv("CLERK_SECRET_KEY", "fixture-only-not-a-credential");
  sessions = new Map([["sess_ios", session("sess_ios")]]);
  transport = vi.fn<typeof fetch>(async (input, options) => {
    const url = new URL(String(input));
    if (url.pathname === "/v1/sessions") {
      const all = [...sessions.values()].filter((s) => s.user_id === url.searchParams.get("user_id") && s.status === "active");
      return Response.json({ data: all.slice(Number(url.searchParams.get("offset")), Number(url.searchParams.get("offset")) + 100), total_count: all.length });
    }
    const sid = decodeURIComponent(url.pathname.split("/")[3]);
    const found = sessions.get(sid);
    if (!found) return new Response("", { status: 404 });
    if (options?.method === "POST") found.status = "revoked";
    return Response.json(found);
  });
  vi.stubGlobal("fetch", transport);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function fixture() {
  const root = convexTest(schema, modules);
  const client = root.withIdentity(identity);
  const deviceId = await client.action(api.deviceAccess.register, registration);
  return { root, client, deviceId };
}

test("normal registered action bootstraps once, posts an expense once on retry, and keeps reads reactive", async () => {
  const { client, root } = await fixture();
  const first = await client.action(setup, {});
  expect(await client.action(setup, {})).toEqual(first);
  const args = { workspaceId: first.workspace.id, financialAccountProfileId: first.financialAccountProfile.id,
    amount: { currency: "COP", minorUnits: 250 }, accountingDate: "2026-10-17", description: "Food", idempotencyKey: "uncertain-expense" };
  const posted = await client.action(expense, args);
  expect(await client.action(expense, args)).toEqual({ ...posted, replay: true });
  transport.mockClear();
  expect(await client.query(read, { workspaceId: first.workspace.id })).toMatchObject([{ balance: { minorUnits: 750 } }]);
  expect(transport).not.toHaveBeenCalled();
  expect(await root.run((ctx) => ctx.db.query("journalEntries").collect())).toHaveLength(2);
  expect(await root.run((ctx) => ctx.db.query("workspaceMemberships").collect())).toMatchObject([{ userId: owner, role: "Owner" }]);
});

for (const state of ["revoked", "ended", "pending", "expired", "abandoned"]) {
  test(`registration and submission reject live Clerk ${state} sessions`, async () => {
    const { client } = await fixture();
    const current = sessions.get("sess_ios");
    if (!current) throw new Error("fixture session missing");
    current.status = state;
    await expect(client.action(api.deviceAccess.register, registration)).rejects.toMatchObject({ data: { code: "session_inactive" } });
    await expect(client.action(setup, {})).rejects.toMatchObject({ data: { code: "session_inactive" } });
  });
}

test("expiry, inactivity expiry, foreign/mismatched/missing provider sessions all fail closed", async () => {
  const { client } = await fixture();
  for (const patch of [{ expire_at: Date.now() }, { abandon_at: Date.now() }, { user_id: "foreign" }, { id: "copied-sid" }]) {
    sessions.set("sess_ios", { ...session("sess_ios"), ...patch });
    await expect(client.action(setup, {})).rejects.toMatchObject({ data: { code: "session_inactive" } });
  }
  sessions.delete("sess_ios");
  await expect(client.action(setup, {})).rejects.toMatchObject({ data: { code: "session_inactive" } });
});

test("unsigned copied identifiers, wrong owner/issuer, and legacy token without sid never admit", async () => {
  const { root, client, deviceId } = await fixture();
  for (const invalid of [
    { ...identity, sid: undefined }, { ...identity, subject: "stranger" },
    { ...identity, issuer: "https://foreign.clerk.accounts.dev" }, { ...identity, sts: "pending" },
  ]) await expect(root.withIdentity(invalid).action(api.deviceAccess.register, registration)).rejects.toThrow();
  await expect(client.action(makeFunctionReference<"action">("deviceAccess:register"), { ...registration, userId: owner, sid: "sess_ios", deviceId })).rejects.toThrow();
  const copied = root.withIdentity({ ...identity, sid: "sess_unregistered" });
  expect(await copied.query(api.deviceAccess.status, {})).toEqual({ status: "unregistered", wipeLocalInput: false });
  await expect(copied.query(read, { workspaceId: "copied-workspace" })).rejects.toMatchObject({ data: { code: "device_registration_required" } });
});

test("registration retry is idempotent; one iOS and one Android slot; revoke must precede replacement", async () => {
  vi.useFakeTimers();
  const { client, root, deviceId } = await fixture();
  expect(await client.action(api.deviceAccess.register, registration)).toBe(deviceId);
  sessions.set("sess_android", session("sess_android"));
  const android = root.withIdentity({ ...identity, sid: "sess_android" });
  await android.action(api.deviceAccess.register, { ...registration, platform: "android", installId: "install-android-fixture" });
  sessions.set("sess_replacement", session("sess_replacement"));
  const replacement = root.withIdentity({ ...identity, sid: "sess_replacement" });
  await expect(replacement.action(api.deviceAccess.register, { ...registration, installId: "install-replacement" })).rejects.toMatchObject({ data: { code: "device_slot_occupied" } });
  expect(await replacement.action(api.deviceAccess.revoke, { deviceId })).toEqual({ status: "revoked", clerkRevocation: "queued" });
  expect(await client.query(api.deviceAccess.status, {})).toEqual({ status: "revoked", wipeLocalInput: true });
  await replacement.action(api.deviceAccess.register, { ...registration, installId: "install-replacement" });
  await expect(client.action(api.deviceAccess.register, registration)).rejects.toMatchObject({ data: { code: "device_revoked" } });
  await root.finishAllScheduledFunctions(vi.runAllTimers);
  expect(sessions.get("sess_ios")?.status).toBe("revoked");
});

test("membership removal denies setup retry, registered reads, and posting before ledger lookup", async () => {
  const { root, client } = await fixture();
  const first = await client.action(setup, {});
  await root.run(async (ctx) => {
    const membership = await ctx.db.query("workspaceMemberships").unique();
    if (membership) await ctx.db.delete(membership._id);
  });
  await expect(client.action(setup, {})).rejects.toMatchObject({ data: { code: "membership_required" } });
  await expect(client.query(read, { workspaceId: first.workspace.id })).rejects.toMatchObject({ data: { code: "membership_required" } });
  await expect(client.action(expense, { workspaceId: first.workspace.id, financialAccountProfileId: first.financialAccountProfile.id,
    amount: { currency: "COP", minorUnits: 1 }, accountingDate: "2026-10-17", description: "Food", idempotencyKey: "x" })).rejects.toMatchObject({ data: { code: "membership_required" } });
});

test("Owner permissions are explicit and every other role has no grants in this cutover", () => {
  for (const permission of ["workspace:read", "workspace:admin", "accounting:post", "accounting:correct", "period:lock", "category:manage"] as const) {
    expect(() => requireRolePermission("Owner", permission)).not.toThrow();
    for (const role of ["Viewer", "Preparer", "Accountant", "unknown"])
      expect(() => requireRolePermission(role, permission)).toThrow();
  }
});

test("provider timeout/429/malformed response/missing secret deny registration and a later retry succeeds", async () => {
  const { client } = await fixture();
  transport.mockRejectedValueOnce(new Error("offline"));
  await expect(client.action(setup, {})).rejects.toMatchObject({ data: { code: "provider_unavailable" } });
  transport.mockResolvedValueOnce(new Response("", { status: 429 }));
  await expect(client.action(setup, {})).rejects.toMatchObject({ data: { code: "provider_unavailable" } });
  transport.mockResolvedValueOnce(Response.json({ status: "active" }));
  await expect(client.action(setup, {})).rejects.toMatchObject({ data: { code: "provider_unavailable" } });
  vi.stubEnv("CLERK_SECRET_KEY", "");
  await expect(client.action(setup, {})).rejects.toMatchObject({ data: { code: "provider_unavailable" } });
  vi.stubEnv("CLERK_SECRET_KEY", "fixture-only-not-a-credential");
  expect((await client.action(setup, {})).workspace.kind).toBe("Personal");
});

test("local denial survives failed Clerk revocation, is reconciled on retry, and cannot revoke a foreign session", async () => {
  vi.useFakeTimers();
  const { root, client, deviceId } = await fixture();
  const first = await client.action(setup, {});
  sessions.set("sess_ios", session("sess_ios", "foreign"));
  await expect(client.action(api.deviceAccess.revoke, { deviceId })).rejects.toMatchObject({ data: { code: "session_inactive" } });
  sessions.set("sess_ios", session("sess_ios"));
  await client.action(api.deviceAccess.revoke, { deviceId });
  const job = await root.run((ctx) => ctx.db.query("clerkRevocations").unique());
  if (!job) throw new Error("missing revocation job");
  transport.mockRejectedValueOnce(new Error("offline"));
  await root.action(internal.deviceAccessInternal.reconcileRevocation, { id: job._id });
  expect(await root.run((ctx) => ctx.db.get(job._id))).toMatchObject({ attempts: 1 });
  expect((await root.run((ctx) => ctx.db.get(job._id)))?.completedAt).toBeUndefined();
  await expect(client.query(read, { workspaceId: first.workspace.id })).rejects.toMatchObject({ data: { code: "device_revoked" } });
  await root.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await root.run((ctx) => ctx.db.get(job._id))).toMatchObject({ attempts: 2, completedAt: expect.any(Number) });
});

test("recovery revoke-others invalidates registered and unregistered old sessions before Clerk retry", async () => {
  vi.useFakeTimers();
  const { root, client } = await fixture();
  sessions.set("sess_recovery", session("sess_recovery"));
  sessions.set("sess_unregistered_old", session("sess_unregistered_old"));
  const recovered = root.withIdentity({ ...identity, sid: "sess_recovery" });
  await recovered.action(api.deviceAccess.revokeOtherSessions, {});
  expect(await client.query(api.deviceAccess.status, {})).toEqual({ status: "revoked", wipeLocalInput: true });
  const old = root.withIdentity({ ...identity, sid: "sess_unregistered_old" });
  await expect(old.action(api.deviceAccess.register, registration)).rejects.toMatchObject({ data: { code: "device_revoked" } });
  await recovered.action(api.deviceAccess.register, { ...registration, installId: "new-recovered-install" });
  await root.finishAllScheduledFunctions(vi.runAllTimers);
  expect(sessions.get("sess_recovery")?.status).toBe("active");
  expect(sessions.get("sess_unregistered_old")?.status).toBe("revoked");
});

test("local revocation wins the action-to-mutation race; foreign workspace and stale observations deny", async () => {
  vi.useFakeTimers();
  const { root, client, deviceId } = await fixture();
  const first = await client.action(setup, {});
  await expect(client.query(read, { workspaceId: "foreign" })).rejects.toMatchObject({ data: { code: "membership_required" } });
  const observation = { userId: owner, clerkSessionId: "sess_ios", clerkClientId: "client_sess_ios", verifiedAt: Date.now() - 5001, expiresAt: Date.now() + 1000, abandonsAt: Date.now() + 1000 };
  await expect(client.mutation(setupInternal, { session: observation })).rejects.toMatchObject({ data: { code: "session_verification_required" } });
  await client.action(api.deviceAccess.revoke, { deviceId });
  await expect(client.mutation(setupInternal, { session: { ...observation, verifiedAt: Date.now() } })).rejects.toMatchObject({ data: { code: "device_revoked" } });
  await root.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await root.run((ctx) => ctx.db.query("journalEntries").collect())).toHaveLength(1);
  expect(first.workspace.id).toBeTruthy();
});

test("a locally revoked session cannot use security controls during its remaining signed JWT lifetime", async () => {
  vi.useFakeTimers();
  const { root, client, deviceId } = await fixture();
  await client.action(api.deviceAccess.revoke, { deviceId });
  await expect(client.action(api.deviceAccess.revokeOtherSessions, {})).rejects.toMatchObject({ data: { code: "device_revoked" } });
  await expect(client.action(api.deviceAccess.list, {})).rejects.toMatchObject({ data: { code: "device_revoked" } });
  await root.finishAllScheduledFunctions(vi.runAllTimers);
});

test("simultaneous slot claims converge to one registered sid and copied install IDs grant no access", async () => {
  const root = convexTest(schema, modules);
  sessions.set("sess_second", session("sess_second"));
  const clients = [root.withIdentity(identity), root.withIdentity({ ...identity, sid: "sess_second" })];
  const results = await Promise.allSettled(clients.map((client) => client.action(api.deviceAccess.register, registration)));
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect(await root.run((ctx) => ctx.db.query("mobileDevices").collect())).toHaveLength(1);
});

test("security listing requests provider pagination, while a foreign target never creates a revocation", async () => {
  const { root, client, deviceId } = await fixture();
  expect(await client.action(api.deviceAccess.list, {})).toEqual([
    { deviceId, label: "My iPhone", platform: "ios", current: true, revoked: false, clerkActive: true },
  ]);
  const lastRequest = transport.mock.calls.at(-1)?.[0];
  expect(String(lastRequest)).toContain("paginated=true");
  sessions.set("sess_foreign", session("sess_foreign", "foreign"));
  const foreign = await root.run((ctx) => ctx.db.insert("mobileDevices", {
    clerkUserId: "foreign", clerkSessionId: "sess_foreign", clerkClientId: "client_foreign", ...registration, createdAt: Date.now(), lastSeenAt: Date.now(),
  }));
  await expect(client.action(api.deviceAccess.revoke, { deviceId: foreign })).rejects.toMatchObject({ data: { code: "device_not_found" } });
  expect(await root.run((ctx) => ctx.db.query("clerkRevocations").collect())).toEqual([]);
});
