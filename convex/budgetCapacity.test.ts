import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { fixtureKey, fixtureProof, registerFixture } from "../src/access/convexHarness";
import { ownerIdentity } from "../src/accounting/convexHarness";
import { budgetFixture, createRule, evaluate, planningOnly } from "../src/budget/convexHarness";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

test("planning reads reserve document and byte headroom from the actual whole transaction", async () => {
  const f = await budgetFixture(modules);
  await createRule(f);
  await f.spend(10, "2026-09-30", "headroom");
  const client = f.t.withIdentity({ ...ownerIdentity, sid: "sess_budgetheadroom", sts: "active" });
  const key = await fixtureKey();
  const device = await registerFixture(client, key, "android");
  const args = { workspaceId: f.workspace.id, month: { year: 2026, month: 9 } };
  const access = await fixtureProof(client, key, "budget.evaluateBudgets", args, device.id);
  for (const transactionLimits of [{ bytesRead: 8 * 1024 * 1024 }, { documentsRead: 12000 }, { databaseQueries: 1096 }]) {
    expect(await planningOnly(f.t, () => client.query(ctx => ctx.runQuery(api.budget.evaluateBudgets,
      { ...args, access }, { transactionLimits }))).catch(e => e)).toMatchObject({ data: { code: "planning_read_limit" } });
  }
  expect((await evaluate(f, 9)).rows[0]).toMatchObject({ actual: { minorUnits: 10 }, planning: { remaining: { minorUnits: 90 } } });
});
