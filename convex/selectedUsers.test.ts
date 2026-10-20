import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import type { ClerkSession } from "./lib/clerkProvider";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
const subjects = ["owner-fixture", "unlisted-a-fixture", "unlisted-b-fixture"];
const issuer = "https://fixture.clerk.accounts.dev";
const setup = { functionalCurrency: "COP", startingMinorUnits: 1000, timeZone: "America/Bogota" };
const registration = {
  installId: "shared-install-fixture", label: "Fixture phone", platform: "ios", appVersion: "test",
} as const;
let sessions: Map<string, ClerkSession>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
  vi.stubEnv("LUKAPP_OWNER_CLERK_SUBJECT", subjects[0]);
  vi.stubEnv("LUKAPP_ADDITIONAL_CLERK_SUBJECTS", '["unrelated-fixture"]');
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", issuer);
  vi.stubEnv("CLERK_SECRET_KEY", "fixture-only-not-a-credential");
  sessions = new Map(subjects.map((subject) => [`sess_${subject}`, {
    id: `sess_${subject}`, user_id: subject, client_id: `client_${subject}`, status: "active",
    created_at: Date.now() - 1000, expire_at: Date.now() + 90_000, abandon_at: Date.now() + 90_000,
  }]));
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input, options) => {
    const url = new URL(String(input));
    if (url.origin !== "https://api.clerk.com" || options?.method !== "GET")
      throw new Error("Unexpected fixture provider request");
    if (url.pathname === "/v1/sessions") {
      const data = [...sessions.values()].filter((s) => s.user_id === url.searchParams.get("user_id"));
      return Response.json({ data, total_count: data.length });
    }
    const session = sessions.get(decodeURIComponent(url.pathname.slice("/v1/sessions/".length)));
    return session ? Response.json(session) : new Response("", { status: 404 });
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function fixture() {
  const root = convexTest(schema, modules);
  const users = [];
  const ownerState = () => root.run(async (ctx) => ({
    workspace: await ctx.db.query("workspaces").first(),
    defaults: await ctx.db.query("personalDefaults").first(),
    membership: await ctx.db.query("workspaceMemberships").first(),
    profile: await ctx.db.query("financialAccountProfiles").first(),
    entry: await ctx.db.query("journalEntries").first(),
  }));
  let originalOwnerState: Awaited<ReturnType<typeof ownerState>> | undefined;
  for (const subject of subjects) {
    const client = root.withIdentity({ subject, issuer, sid: `sess_${subject}`, sts: "active" });
    expect(await client.query(api.authConnection.connection, {}))
      .toEqual({ status: "owner", clerkSubject: subject });
    await expect(client.action(api.accounting.ensurePersonalDefaults, setup))
      .rejects.toMatchObject({ data: { code: "device_registration_required" } });
    const deviceId = await client.action(api.deviceAccess.register, registration);
    expect(await client.query(api.accounting.personalDefaults, {})).toBeNull();
    const defaults = await client.action(api.accounting.ensurePersonalDefaults, setup);
    expect(await client.action(api.accounting.ensurePersonalDefaults, setup)).toEqual(defaults);
    users.push({ subject, client, deviceId, defaults });
    if (originalOwnerState) expect(await ownerState()).toEqual(originalOwnerState);
    else originalOwnerState = await ownerState();
  }
  return { root, users };
}

test.each(["unlisted", "missing", "malformed"])("original Owner and arbitrary users get private Setup, memberships and finances with %s legacy config", async (config) => {
  if (config !== "unlisted") {
    vi.stubEnv("LUKAPP_OWNER_CLERK_SUBJECT", config === "missing" ? undefined : "malformed-owner");
    vi.stubEnv("LUKAPP_ADDITIONAL_CLERK_SUBJECTS", config === "missing" ? undefined : '["unlisted-a-fixture",null]');
  }
  const { root, users } = await fixture();
  expect(new Set(users.map((u) => u.defaults.workspace.id)).size).toBe(3);
  for (const user of users) {
    const workspaceId = user.defaults.workspace.id;
    expect(await user.client.query(api.accounting.personalDefaults, {})).toEqual(user.defaults);
    expect(await user.client.query(api.accounting.listFinancialAccountProfiles, { workspaceId }))
      .toEqual([user.defaults.financialAccountProfile]);
    const expense = {
      workspaceId, financialAccountProfileId: user.defaults.financialAccountProfile.id,
      amount: { currency: "COP", minorUnits: 250 }, accountingDate: "2026-10-19",
      description: "Private fixture expense", idempotencyKey: "same-key-each-user",
    };
    const posted = await user.client.action(api.accounting.recordCashExpense, expense);
    expect(posted).toMatchObject({ postedBy: user.subject });
    for (const other of users.filter((u) => u !== user)) {
      for (const query of [api.accounting.openWorkspace, api.accounting.balances,
        api.accounting.listJournalEntries, api.accounting.listFinancialAccountProfiles]) {
        await expect(other.client.query(query, { workspaceId }))
          .rejects.toMatchObject({ data: { code: "membership_required" } });
      }
      await expect(other.client.action(api.accounting.recordCashExpense, expense))
        .rejects.toMatchObject({ data: { code: "membership_required" } });
    }
  }
  for (const user of users) {
    expect(await user.client.query(api.accounting.balances, { workspaceId: user.defaults.workspace.id }))
      .toMatchObject([{ balance: { currency: "COP", minorUnits: 750 } }]);
    const entries = await user.client.query(api.accounting.listJournalEntries, { workspaceId: user.defaults.workspace.id });
    expect(entries).toHaveLength(2);
    expect(entries.every((entry) => entry.postedBy === user.subject)).toBe(true);
  }
  const state = await root.run(async (ctx) => ({
    defaults: await ctx.db.query("personalDefaults").collect(),
    memberships: await ctx.db.query("workspaceMemberships").collect(),
    entries: await ctx.db.query("journalEntries").collect(),
  }));
  expect(state.defaults).toHaveLength(3);
  expect(state.memberships).toHaveLength(3);
  expect(state.entries).toHaveLength(6);
  for (const user of users) {
    expect(state.defaults.filter((d) => d.ownerSubject === user.subject))
      .toMatchObject([{ workspaceId: user.defaults.workspace.id }]);
    expect(state.memberships.filter((m) => m.userId === user.subject))
      .toMatchObject([{ workspaceId: user.defaults.workspace.id, role: "Owner" }]);
  }
});

test("arbitrary users' device slots, listing, status and management stay subject-scoped", async () => {
  const { root, users } = await fixture();
  for (const user of users) {
    expect(await user.client.action(api.deviceAccess.list, {})).toEqual([{
      deviceId: user.deviceId, label: registration.label, platform: "ios",
      current: true, revoked: false, clerkActive: true,
    }]);
    expect(await user.client.query(api.deviceAccess.status, { installId: registration.installId, platform: registration.platform }))
      .toMatchObject({ status: "registered", deviceId: user.deviceId });
    for (const other of users.filter((u) => u !== user)) {
      await expect(user.client.action(api.deviceAccess.revoke, { deviceId: other.deviceId }))
        .rejects.toMatchObject({ data: { code: "device_not_found" } });
      await expect(user.client.action(api.deviceAccess.replace, {
        ...registration, expectedOccupierId: other.deviceId, expectedSessionId: `sess_${other.subject}`,
      })).rejects.toMatchObject({ data: { code: "device_not_found" } });
    }
    const copiedSession = root.withIdentity({ subject: user.subject, issuer, sid: `sess_${subjects.find((s) => s !== user.subject)}` });
    await expect(copiedSession.query(api.accounting.personalDefaults, {}))
      .rejects.toMatchObject({ data: { code: "device_registration_required" } });
    await expect(copiedSession.action(api.accounting.ensurePersonalDefaults, setup))
      .rejects.toMatchObject({ data: { code: "session_inactive" } });
  }
  const devices = await root.run((ctx) => ctx.db.query("mobileDevices").collect());
  expect(devices).toHaveLength(3);
  expect(devices.every((d) => d.revokedAt === undefined)).toBe(true);
  expect(await root.run((ctx) => ctx.db.query("clerkRevocations").collect())).toEqual([]);
});

test("authenticated admission preserves session, membership and device guards", async () => {
  const { root, users } = await fixture();
  const selected = users[1];
  const session = sessions.get(`sess_${selected.subject}`);
  if (!session) throw new Error("Missing fixture session");
  session.status = "revoked";
  await expect(selected.client.action(api.accounting.ensurePersonalDefaults, setup))
    .rejects.toMatchObject({ data: { code: "session_inactive" } });
  session.status = "active";
  await root.run(async (ctx) => {
    const memberships = await ctx.db.query("workspaceMemberships").collect();
    for (const membership of memberships.filter((m) => m.userId === selected.subject))
      await ctx.db.delete(membership._id);
  });
  await expect(selected.client.query(api.accounting.personalDefaults, {}))
    .rejects.toMatchObject({ data: { code: "membership_required" } });
  await expect(selected.client.action(api.accounting.ensurePersonalDefaults, setup))
    .rejects.toMatchObject({ data: { code: "membership_required" } });
  for (const other of users.filter((u) => u !== selected)) {
    expect(await other.client.query(api.accounting.personalDefaults, {})).toEqual(other.defaults);
  }
  const second = users[2];
  await root.run((ctx) => ctx.db.patch(second.deviceId, { revokedAt: Date.now() }));
  await expect(second.client.query(api.accounting.personalDefaults, {}))
    .rejects.toMatchObject({ data: { code: "device_revoked" } });
  await expect(second.client.action(api.accounting.ensurePersonalDefaults, setup))
    .rejects.toMatchObject({ data: { code: "device_revoked" } });
});
