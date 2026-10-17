import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { convexAccounting, createOwnedWorkspace } from "../src/accounting/convexHarness";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);

async function backfill(t: Awaited<ReturnType<typeof convexAccounting>>) {
  let cursor: string | null = null;
  let updated = 0;
  for (;;) {
    const result: { cursor: string; done: boolean; updated: number } =
      await t.mutation(internal.workspaceBackfill.backfillWorkspaceTimeZones, { cursor, batchSize: 1 });
    updated += result.updated;
    if (result.done) return updated;
    cursor = result.cursor;
  }
}

test("the timezone backfill writes America/Bogota once and leaves existing zones alone", async () => {
  const t = await convexAccounting(modules);
  const created = await createOwnedWorkspace(t);
  const missing = await t.run(async (ctx) => {
    const id = await ctx.db.insert("workspaces", {
      kind: "Personal",
      functionalCurrency: "COP",
      chartOfAccountsTemplate: "co-puc-personal@1",
    });
    await ctx.db.patch(created.id as Id<"workspaces">, { timeZone: "America/Lima" });
    return id;
  });
  expect(await backfill(t)).toBe(1);
  expect(await backfill(t)).toBe(0);
  const zones = await t.run(async (ctx) => ({
    created: (await ctx.db.get(created.id as Id<"workspaces">))?.timeZone,
    missing: (await ctx.db.get(missing))?.timeZone,
  }));
  expect(zones).toEqual({ created: "America/Lima", missing: "America/Bogota" });
});
