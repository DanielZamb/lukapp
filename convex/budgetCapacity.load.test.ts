import { afterEach, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { fixtureKey, fixtureProof, registerFixture } from "../src/access/convexHarness";
import { ownerIdentity } from "../src/accounting/convexHarness";
import { budgetFixture, createRule, evaluate, planningOnly } from "../src/budget/convexHarness";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
async function expenses(f: Awaited<ReturnType<typeof budgetFixture>>, month: number, count: number, key: string) {
  const started = performance.now();
  console.info(JSON.stringify({ qualityLoadPhase: "setup-start", month, count }));
  const posted = await f.t.mutation(api.accounting.recordCashExpense, {
    workspaceId: f.workspace.id, financialAccountProfileId: f.profile.id,
    amount: { currency: "COP", minorUnits: 1 }, accountingDate: `2026-${String(month).padStart(2, "0")}-15`,
    userCategoryId: f.category.id, description: "Capacity fixture expense", idempotencyKey: `${key}-${month}-0`,
  });
  console.info(JSON.stringify({ qualityLoadPhase: "setup-complete", month, count, elapsedMs: performance.now() - started }));
  for (let offset = 0; offset < count; offset += 25) await f.t.run(async ctx => {
    const id = ctx.db.normalizeId("journalEntries", posted.id);
    if (!id) throw new Error("Expected posted fixture id");
    const entry = await ctx.db.get(id);
    if (!entry) throw new Error("Expected posted fixture entry");
    const { _id, _creationTime, ...fields } = entry;
    const lines = await ctx.db.query("journalLines").withIndex("by_entry", q => q.eq("journalEntryId", id)).collect();
    expect(lines).toHaveLength(2);
    for (let number = Math.max(1, offset); number < Math.min(count, offset + 25); number++) {
      const journalEntryId = await ctx.db.insert("journalEntries", { ...fields, idempotencyKey: `${key}-${month}-${number}` });
      for (const line of lines) {
        const { _id, _creationTime, ...lineFields } = line;
        await ctx.db.insert("journalLines", { ...lineFields, journalEntryId });
      }
    }
  });
}

test("annual carry returns a complete evaluation or a planning limit error under real transaction limits, and posting remains independent", async () => {
  const f = await budgetFixture(modules);
  const carry = await createRule(f, { name: "Annual carry", cardinality: "multipleNamed", startMonth: { year: 2026, month: 1 },
    limit: { currency: "COP", minorUnits: 1000 }, rollover: { kind: "carryUnspent", reset: "calendarYear", cap: { currency: "COP", minorUnits: 10000 } } });
  const monthly = await createRule(f, { name: "No carry", cardinality: "multipleNamed", startMonth: { year: 2026, month: 1 },
    limit: { currency: "COP", minorUnits: 1000 }, idempotencyKey: "no-carry" });
  await createRule(f, { name: "Overlapping annual carry", cardinality: "multipleNamed", startMonth: { year: 2026, month: 1 },
    limit: { currency: "COP", minorUnits: 1000 }, rollover: { kind: "carryUnspent", reset: "calendarYear", cap: { currency: "COP", minorUnits: 10000 } }, idempotencyKey: "second-carry" });
  for (let month = 1; month <= 5; month++) await expenses(f, month, 900, "expense");
  const assertionStarted = performance.now();
  const february = await evaluate(f, 2, 2026, { kind: "revision", budgetId: carry.budget.id, revision: 1 });
  expect(february.rows).toHaveLength(1);
  expect(february.rows[0]).toMatchObject({ actual: { currency: "COP", minorUnits: 900 }, planning: {
    kind: "limited", limit: { minorUnits: 1000 }, carry: { minorUnits: 100 }, available: { minorUnits: 1100 },
    remaining: { minorUnits: 200 }, overage: { minorUnits: 0 }, carryOut: { minorUnits: 200 } } });
  expect(await evaluate(f, 5, 2026, { kind: "revision", budgetId: carry.budget.id, revision: 1 }).catch(e => e))
    .toMatchObject({ data: { code: "planning_read_limit" } });
  const proposal = { financialAccountProfileId: f.profile.id, accountingDate: "2026-05-31", amount: { currency: "COP", minorUnits: 1 } };
  expect(await planningOnly(f.t, () => f.t.query(api.budget.budgetImpactWarning, { workspaceId: f.workspace.id, proposal })).catch(e => e))
    .toMatchObject({ data: { code: "planning_read_limit" } });
  expect((await evaluate(f, 5, 2026, { kind: "revision", budgetId: monthly.budget.id, revision: 1 })).rows[0])
    .toMatchObject({ actual: { minorUnits: 900 }, planning: { kind: "limited", carry: { minorUnits: 0 }, remaining: { minorUnits: 100 } } });
  const posted = await f.spend(1, "2026-05-31", "authorized-after-unavailable-warning");
  expect(posted.amount).toEqual({ currency: "COP", minorUnits: 1 });
  expect((await evaluate(f, 5, 2026, { kind: "revision", budgetId: monthly.budget.id, revision: 1 })).rows[0])
    .toMatchObject({ actual: { minorUnits: 901 }, planning: { kind: "limited", remaining: { minorUnits: 99 } } });
  console.info(JSON.stringify({ qualityLoadPhase: "annual-assertions-complete", elapsedMs: performance.now() - assertionStarted }));
  await expenses(f, 1, 99, "boundary-january");
  await expenses(f, 2, 96, "boundary-february");
  const boundaryStarted = performance.now();
  const below = await evaluate(f, 2);
  expect(below.rows).toHaveLength(3);
  for (const row of below.rows.filter(row => row.rollover.kind === "carryUnspent"))
    expect(row).toMatchObject({ actual: { minorUnits: 996 }, planning: { carry: { minorUnits: 1 }, remaining: { minorUnits: 5 }, carryOut: { minorUnits: 5 } } });
  await f.spend(1, "2026-02-28", "boundary-at");
  const at = await evaluate(f, 2);
  expect(at.rows).toHaveLength(3);
  for (const row of at.rows.filter(row => row.rollover.kind === "carryUnspent")) {
    expect(row.sources).toHaveLength(997);
    expect(row).toMatchObject({ actual: { minorUnits: 997 }, planning: { carry: { minorUnits: 1 }, available: { minorUnits: 1001 }, remaining: { minorUnits: 4 }, carryOut: { minorUnits: 4 } } });
    expect(row.carryEvidence.map(month => month.actual.minorUnits)).toEqual([999]);
  }
  const atWarning = await planningOnly(f.t, () => f.t.query(api.budget.budgetImpactWarning, { workspaceId: f.workspace.id,
    proposal: { ...proposal, accountingDate: "2026-02-28" } }));
  expect(atWarning).toMatchObject({ hasPostingAuthority: false, blocksPosting: false });
  await f.spend(1, "2026-02-28", "boundary-over");
  expect(await evaluate(f, 2).catch(e => e)).toMatchObject({ data: { code: "planning_read_limit" } });
  expect(await planningOnly(f.t, () => f.t.query(api.budget.budgetImpactWarning, { workspaceId: f.workspace.id,
    proposal: { ...proposal, accountingDate: "2026-02-28" } })).catch(e => e)).toMatchObject({ data: { code: "planning_read_limit" } });
  expect((await evaluate(f, 2, 2026, { kind: "revision", budgetId: monthly.budget.id, revision: 1 })).rows[0])
    .toMatchObject({ actual: { minorUnits: 998 }, planning: { carry: { minorUnits: 0 }, remaining: { minorUnits: 2 } } });
  console.info(JSON.stringify({ qualityLoadPhase: "boundary-assertions-complete", elapsedMs: performance.now() - boundaryStarted }));
}, process.env.LUKAPP_INSTRUMENTED_LOAD === "1" ? 600_000 : 240_000);
