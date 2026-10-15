import { test, vi } from "vitest";
import { createServer } from "node:http";
import { AsyncLocalStorage } from "node:async_hooks";
import { z } from "zod";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { ConvexError, convexToJson, jsonToConvex } from "convex/values";
import type { SessionJSON } from "@clerk/backend";
import { ownerIdentity } from "../../../src/accounting/convexHarness";
import schema from "../../../convex/schema";
import { internal } from "../../../convex/_generated/api";

const modules = import.meta.glob(["../../../convex/**/*.{js,ts}", "!../../../convex/**/*.test.ts", "!../../../convex/**/*.d.ts"]);
const envelope = z.object({ path: z.string(), format: z.literal("convex_encoded_json"), args: z.tuple([z.json()]) });
const publicNames = /^(accounting:(completeFirstRun|firstRunStatus|phoneSummary|localInputAuthority|recordCashExpense|setupFinancialAccount|createHouseholdWorkspace|listOwnedWorkspaces)|devices:(prepare|register|status|heartbeat|list|revoke)|clerkProvider:(checkSession|beginRecovery|completeRecovery)|providerWork:status|authConnection:developmentReadiness)$/;

test("explicit loopback F03 fixture runs real public handlers and controlled official Clerk SDK transport", async () => {
  vi.stubEnv("LUKAPP_OWNER_CLERK_SUBJECT", ownerIdentity.subject);
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", ownerIdentity.issuer);
  vi.stubEnv("CLERK_INSTANCE_ID", "ins_fixture");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_controlled_fixture");
  vi.stubEnv("NODE_ENV", "test");
  const roots = { ios: convexTest(schema, modules), android: convexTest(schema, modules) };
  const sessions = new Map<string, SessionJSON>();
  const active = new Map<string, string>();
  const lost = new Set<string>();
  const frozen = new Set<string>();
  const interruptedEnrollments = new Set<string>();
  const pausedAdmissions = new Set<string>();
  const admissionReleases = new Map<string, () => void>();
  const clocks = { ios: 0, android: 0 };
  const context = new AsyncLocalStorage<"ios" | "android">();
  const realNow = Date.now.bind(Date);
  vi.spyOn(Date, "now").mockImplementation(() => realNow() + clocks[context.getStore() ?? "ios"]);
  let counter = 0;
  const sdkFetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.origin !== "https://api.clerk.com") throw new Error("Uncontrolled provider transport denied");
    if (url.pathname === "/v1/domains") return Response.json({ data: [{ object: "domain", id: "dmn_fixture", name: "fixture", frontend_api_url: ownerIdentity.issuer, is_satellite: false, cname_targets: [], development_origin: "http://localhost" }], total_count: 1 });
    if (url.pathname === "/v1/instance") return Response.json({ object: "instance", id: "ins_fixture", environment_type: "development", allowed_origins: [] });
    if (url.pathname === "/v1/sessions") return Response.json({ data: [...sessions.values()].slice(Number(url.searchParams.get("offset") ?? 0), Number(url.searchParams.get("offset") ?? 0) + Number(url.searchParams.get("limit") ?? 100)), total_count: sessions.size });
    const sid = url.pathname.split("/")[3];
    const session = sid ? sessions.get(sid) : undefined;
    if (!session) return Response.json({ errors: [{ code: "resource_not_found", message: "fixture missing" }] }, { status: 404 });
    if (init?.method === "POST" && url.pathname.endsWith("/revoke")) session.status = "revoked";
    return Response.json(session);
  };
  vi.stubGlobal("fetch", sdkFetch);
  const client = (platform: "ios" | "android") => {
    const root = roots[platform];
    const sid = active.get(platform);
    return sid ? root.withIdentity({ ...ownerIdentity, sid, sts: "active", aud: "convex" }) : root;
  };
  const server = createServer(async (req, res) => {
    const parts = (req.url ?? "").split("/");
    const platform = parts[1];
    if (platform !== "ios" && platform !== "android") { res.writeHead(404); res.end(); return; }
    await context.run(platform, async () => {
    const root = roots[platform];
    res.setHeader("Content-Type", "application/json");
    try {
      if (parts[2] === "resume") {
        const sid = active.get(platform);
        res.end(JSON.stringify({ fixture: true, sessionId: sid && sessions.get(sid)?.status === "active" ? sid : null, online: !frozen.has(platform) })); return;
      }
      if (parts[2] === "sign-in") {
        const sid = "sess_F03" + platform + ++counter;
        const now = Date.now();
        sessions.set(sid, { id: sid, object: "session", user_id: ownerIdentity.subject, client_id: "client_fixture_" + platform,
          status: "active", actor: null, created_at: now, updated_at: now, expire_at: now + 90 * 86400000, abandon_at: now + 30 * 86400000, last_active_at: now });
        active.set(platform, sid); res.end(JSON.stringify({ fixture: true, sessionId: sid, online: !frozen.has(platform) })); return;
      }
      if (parts[2] === "sign-out") {
        const sid = active.get(platform);
        if (sid) {
          const session = sessions.get(sid);
          if (session) session.status = "ended";
        }
        active.delete(platform);
        res.end(JSON.stringify({ fixture: true, signedIn: false })); return;
      }
      if (parts[2] === "control") {
        const command = parts[3];
        if (command === "lose-next-expense") lost.add(platform);
        if (command === "freeze") frozen.add(platform);
        if (command === "online") frozen.delete(platform);
        if (command === "interrupt-next-enrollment") interruptedEnrollments.add(platform);
        if (command === "advance-15-days") clocks[platform] += 15 * 86400000 + 1000;
        if (command === "rollback-clock") clocks[platform] -= 15 * 86400000 + 1000;
        if (command === "pause-next-admission") pausedAdmissions.add(platform);
        if (command === "release-admission") { admissionReleases.get(platform)?.(); admissionReleases.delete(platform); }
        if (command === "expire-contact") await root.run(async ctx => {
          for (const device of await ctx.db.query("mobileDevices").collect()) await ctx.db.patch(device._id, { lastSeenAt: Date.now() - 30 * 86400000 - 1000 });
        });
        if (command === "expire-binding") await root.run(async ctx => {
          for (const device of await ctx.db.query("mobileDevices").collect()) await ctx.db.patch(device._id, { createdAt: Date.now() - 90 * 86400000 - 1000 });
        });
        if (command === "provider-ended") {
          const sid = active.get(platform); const session = sid ? sessions.get(sid) : undefined;
          if (session) session.status = "ended";
        }
        if (command === "revoke") {
          const sid = active.get(platform);
          if (sid) await root.mutation(internal.devices.applyClerkSessionRevocation, { ...ownerIdentity, sid });
        }
        if (command === "permission" || command === "restore-permission") {
          await root.run(async ctx => {
            const rows = await ctx.db.query("workspaceMemberships").collect();
            for (const row of rows) await ctx.db.patch(row._id, { role: command === "permission" ? "Viewer" : "Owner" });
          });
        }
        if (command === "proof") {
          const [devices, entries, profiles, lines, categories, completions, challenges] = await Promise.all([
            root.run(ctx => ctx.db.query("mobileDevices").collect()),
            root.run(ctx => ctx.db.query("journalEntries").collect()),
            root.run(ctx => ctx.db.query("financialAccountProfiles").collect()),
            root.run(ctx => ctx.db.query("journalLines").collect()),
            root.run(ctx => ctx.db.query("userCategories").collect()),
            root.run(ctx => ctx.db.query("firstRunCompletions").collect()),
            root.run(ctx => ctx.db.query("deviceChallenges").collect()),
          ]);
          res.end(JSON.stringify({ fixture: true, scenario: platform, serverNow: Date.now(), deviceCount: devices.length,
            devices: devices.map(d => ({ id: d._id, createdAt: d.createdAt, lastSeenAt: d.lastSeenAt, state: d.state })),
            entries: entries.map(e => ({ id: e._id, description: e.description, idempotencyKey: e.idempotencyKey, policy: e.policy })),
            profiles: profiles.map(p => ({ id: p._id, name: p.name, balanceMinorUnits: lines.filter(l => l.ledgerAccountId === p.postingAccountId).reduce((sum, l) => sum + l.debitMinorUnits - l.creditMinorUnits, 0) })),
            lines: lines.map(l => ({ entryId: l.journalEntryId, debitMinorUnits: l.debitMinorUnits, creditMinorUnits: l.creditMinorUnits })),
            categoryCount: categories.length, completionCount: completions.length, challengeCount: challenges.length,
            consumedChallengeCount: challenges.filter(c => c.consumedAt !== undefined).length })); return;
        }
        res.end(JSON.stringify({ fixture: true, done: true })); return;
      }
      if (frozen.has(platform)) { res.writeHead(503); res.end(JSON.stringify({ fixture: true, offline: true })); return; }
      const chunks = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = envelope.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      if (!publicNames.test(body.path)) throw new Error("Nonpublic fixture operation denied");
      const args = jsonToConvex(body.args[0]);
      if (typeof args !== "object" || args === null || Array.isArray(args)) throw new Error("Arguments required");
      const t = client(platform);
      if (body.path === "devices:register" && interruptedEnrollments.delete(platform)) {
        process.stdout.write(JSON.stringify({ fixture: true, platform, operation: body.path, outcome: "interrupted-before-handler-no-binding" }) + "\n");
        res.writeHead(560); res.end(JSON.stringify({ status: "error", errorMessage: "Explicitly interrupted initial enrollment before handler", errorData: convexToJson({ code: "fixture_interrupted_enrollment" }) })); return;
      }
      let result;
      if (parts[3] === "query") result = await t.query(makeFunctionReference<"query">(body.path), args);
      else if (parts[3] === "mutation") result = await t.mutation(makeFunctionReference<"mutation">(body.path), args);
      else if (parts[3] === "action") result = await t.action(makeFunctionReference<"action">(body.path), args);
      else throw new Error("RPC kind required");
      if (body.path === "accounting:localInputAuthority" && pausedAdmissions.delete(platform)) {
        process.stdout.write(JSON.stringify({ fixture: true, platform, operation: body.path, outcome: "real-result-held-for-race" }) + "\n");
        await new Promise<void>(resolve => admissionReleases.set(platform, resolve));
      }
      if (body.path === "accounting:recordCashExpense" && lost.delete(platform)) { res.destroy(); return; }
      process.stdout.write(JSON.stringify({ fixture: true, platform, operation: body.path,
        outcome: typeof result === "object" && result !== null && "kind" in result ? result.kind : "returned" }) + "\n");
      res.end(JSON.stringify({ status: "success", value: convexToJson(result), logLines: [] }));
    } catch (error) {
      res.writeHead(560);
      res.end(JSON.stringify({ status: "error", errorMessage: "Controlled fixture request rejected",
        ...(error instanceof ConvexError ? { errorData: convexToJson(error.data) } : {}) }));
    }
    });
  });
  await new Promise<void>(resolve => server.listen(8094, "127.0.0.1", resolve));
  process.stdout.write("F03 controlled fixture ready on loopback8094; real public handlers; synthetic claims; no live provider actions\n");
  await new Promise<void>(resolve => {
    const stop = () => { server.close(() => resolve()); };
    process.once("SIGTERM", stop); process.once("SIGINT", stop);
  });
});
