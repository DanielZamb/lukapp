import { expect, test } from "vitest";
import { convexTest } from "convex-test";
import type { TransactionMetrics } from "convex/server";
import schema from "./schema";
import { planningDocuments, requirePlanningReadHeadroom } from "./planningReadCapacity";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
const boundaryMetrics = {
  databaseQueries: { used: 3000, remaining: 1096 }, documentsRead: { used: 20000, remaining: 12000 },
  bytesRead: { used: 8388608, remaining: 8388608 },
};

test("all planning headroom boundaries admit equality and reject one unit beyond", async () => {
  const root = convexTest(schema, modules);
  await root.run(async ctx => {
    const base = await ctx.meta.getTransactionMetrics();
    const meta = (overrides: Partial<TransactionMetrics>) => ({ ...ctx.meta,
      getTransactionMetrics: async () => ({ ...base, ...boundaryMetrics, ...overrides }) });
    await expect(requirePlanningReadHeadroom(meta({}))).resolves.toBeUndefined();
    for (const overrides of [
      { databaseQueries: { used: 3001, remaining: 1096 } },
      { databaseQueries: { used: 3000, remaining: 1095 } },
      { documentsRead: { used: 20001, remaining: 12000 } },
      { documentsRead: { used: 20000, remaining: 11999 } },
      { bytesRead: { used: 8388609, remaining: 8388608 } },
      { bytesRead: { used: 8388608, remaining: 8388607 } },
    ]) await expect(requirePlanningReadHeadroom(meta(overrides))).rejects.toMatchObject({ code: "planning_read_limit" });
  });
});

test("document limits return complete ordered results and close iterators on overflow", async () => {
  const root = convexTest(schema, modules);
  await root.run(async ctx => {
    const closed: string[] = [];
    async function* documents(label: string, values: string[]) {
      try { for (const value of values) yield value; }
      finally { closed.push(label); }
    }
    expect(await planningDocuments(ctx.meta, documents("empty", []), 0)).toEqual([]);
    expect(await planningDocuments(ctx.meta, documents("equal", ["first", "second"]), 2)).toEqual(["first", "second"]);
    await expect(planningDocuments(ctx.meta, documents("overflow", ["first", "second", "third"]), 2))
      .rejects.toMatchObject({ code: "planning_read_limit" });
    expect(closed).toEqual(["empty", "equal", "overflow"]);
  });
});

test("headroom is checked again after a document read consumes the remaining budget", async () => {
  const root = convexTest(schema, modules);
  await root.run(async ctx => {
    const base = await ctx.meta.getTransactionMetrics();
    let documentsRead = { used: 20000, remaining: 12000 };
    const meta = { ...ctx.meta, getTransactionMetrics: async () => ({ ...base, ...boundaryMetrics, documentsRead }) };
    let closed = false;
    async function* documents() {
      try { documentsRead = { used: 20001, remaining: 11999 }; yield "must-not-return"; }
      finally { closed = true; }
    }
    await expect(planningDocuments(meta, documents(), 10)).rejects.toMatchObject({ code: "planning_read_limit" });
    expect(closed).toBe(true);
  });
});
