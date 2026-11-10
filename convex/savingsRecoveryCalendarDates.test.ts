import { expect, test, vi } from "vitest";
import type { FunctionArgs } from "convex/server";
import { api, internal } from "./_generated/api";
import { accountingFixture, createProfile } from "../src/accounting/convexHarness";

const modules = import.meta.glob(["./**/*.{js,ts}", "!./**/*.test.ts", "!./**/*.d.ts"]);
const boundary = Date.parse("2026-11-01T04:30:00Z");

async function setup() {
  const fixture = await accountingFixture(modules);
  const { t } = fixture;
  vi.setSystemTime(Date.parse("2026-08-01T12:00:00Z"));
  const defaults = await t.action(api.accounting.ensurePersonalDefaults, {
    functionalCurrency: "COP", startingMinorUnits: 0, timeZone: "America/Bogota",
  });
  const workspaceId = await t.run(async ctx => {
    const id = ctx.db.normalizeId("workspaces", defaults.workspace.id);
    if (!id) throw new Error("Missing workspace");
    return id;
  });
  const source = defaults.financialAccountProfile.id;
  const destination = await createProfile(t, workspaceId, "Savings", "savingsAccount");
  const read = () => t.query(api.savingsRecovery.evaluate, { workspaceId, month: "2026-10" });
  async function legacyPlan(key: string, now: number, date: string, cancelled: boolean) {
    vi.setSystemTime(now);
    const expense = await t.action(api.accounting.recordCashExpense, {
      workspaceId, financialAccountProfileId: source, accountingDate: "2026-08-01",
      amount: { currency: "COP", minorUnits: 100 }, description: key, idempotencyKey: `expense:${key}`,
    });
    const args = { workspaceId, sourceJournalEntryId: expense.id, destinationFinancialAccountProfileId: destination.id,
      installmentCount: 4, installmentMinorUnits: 25, idempotencyKey: key };
    const receipt = await t.run(async ctx => {
      const sourceJournalEntryId = ctx.db.normalizeId("journalEntries", expense.id);
      const destinationFinancialAccountProfileId = ctx.db.normalizeId("financialAccountProfiles", destination.id);
      if (!sourceJournalEntryId || !destinationFinancialAccountProfileId) throw new Error("Missing fixture IDs");
      const plan = { workspaceId, sourceJournalEntryId, destinationFinancialAccountProfileId,
        title: key, principalMinorUnits: 100, installmentCount: 4, installmentMinorUnits: 25,
        impliedAnnualRateBps: 0, currency: "COP", activationMonth: date.slice(0, 7),
        idempotencyKey: key, createdBy: "owner-1", createdAt: now };
      const id = await ctx.db.insert("savingsRecoveryPlans", plan);
      return { plan: { id, ...plan }, replay: true };
    });
    const cancelArgs = { workspaceId, planId: receipt.plan.id, reason: "Legacy cancellation", idempotencyKey: `cancel:${key}` };
    const cancellation = cancelled ? await t.run(async ctx => {
      const decision = { workspaceId, planId: receipt.plan.id, reason: cancelArgs.reason,
        idempotencyKey: cancelArgs.idempotencyKey, createdBy: "owner-1", eventTime: now + 100, recordedAt: now + 100 };
      const id = await ctx.db.insert("savingsRecoveryCancellations", decision);
      return { cancellation: { id, ...decision, origin: { kind: "person" as const } }, replay: true };
    }) : undefined;
    const contribute = (date: string, key: string) => t.action(api.savingsRecovery.recordContribution, {
      workspaceId, planId: receipt.plan.id, sourceFinancialAccountProfileId: source,
      amount: { currency: "COP", minorUnits: 25 }, accountingDate: date,
      description: "Recovery", idempotencyKey: key,
    });
    return { args, receipt, date, cancelArgs, cancellation, contribute };
  }
  const changeZone = (timeZone: string, expectedTimeZone: string, now: number) => {
    vi.setSystemTime(now);
    return t.action(api.accounting.changeWorkspaceTimeZone, { workspaceId, timeZone, expectedTimeZone, idempotencyKey: timeZone });
  };
  return { ...fixture, workspaceId, source, destination, legacyPlan, changeZone, read };
}

test.each([0, 1, 2])("legacy event dates survive %i zone changes before, during and after backfill", async changes => {
  const s = await setup();
  type LegacyPlan = Awaited<ReturnType<typeof s.legacyPlan>>;
  const pairs: { active: LegacyPlan; cancelled: LegacyPlan }[] = [];
  async function addPair(key: string, now: number, date: string) {
    const active = await s.legacyPlan(`${key}:active`, now, date, false);
    const cancelled = await s.legacyPlan(`${key}:cancelled`, now, date, true);
    pairs.push({ active, cancelled });
  }
  await addPair("before", boundary, "2026-10-31");
  if (changes >= 1) {
    await s.changeZone("Pacific/Auckland", "America/Bogota", boundary + 1000);
    await addPair("between", boundary + 2000, "2026-11-01");
  }
  if (changes === 2) {
    await s.changeZone("Asia/Tokyo", "Pacific/Auckland", boundary + 3000);
    await addPair("after", boundary + 4000, "2026-11-01");
  }
  vi.setSystemTime(boundary + 5000);
  async function check(stage: string) {
    for (const { active, cancelled } of pairs) {
      const view = await s.read();
      expect(view.plans.find(p => p.id === active.receipt.plan.id)).toMatchObject({ activationDate: active.date, activationMonth: active.date.slice(0, 7), status: "active" });
      const month = cancelled.date.slice(0, 7);
      expect((await s.t.query(api.savingsRecovery.evaluate, { workspaceId: s.workspaceId, month })).plans.find(p => p.id === cancelled.receipt.plan.id))
        .toMatchObject({ status: "cancelled", cancellation: { cancellationDate: cancelled.date } });
      const earlierMonth = month === "2026-11" ? "2026-10" : "2026-09";
      expect((await s.t.query(api.savingsRecovery.evaluate, { workspaceId: s.workspaceId, month: earlierMonth })).plans.find(p => p.id === cancelled.receipt.plan.id)?.status).toBe("active");
      for (const plan of [active, cancelled]) {
        expect(await s.t.action(api.savingsRecovery.activatePlan, plan.args)).toEqual(plan.receipt);
        await expect(s.t.action(api.savingsRecovery.activatePlan, { ...plan.args, installmentMinorUnits: 26 }))
          .rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
      }
      expect(await s.t.action(api.savingsRecovery.cancelPlan, cancelled.cancelArgs)).toEqual(cancelled.cancellation);
      await expect(s.t.action(api.savingsRecovery.cancelPlan, { ...cancelled.cancelArgs, reason: "Changed intent" }))
        .rejects.toMatchObject({ data: { code: "idempotency_key_conflict" } });
      const previous = active.date === "2026-11-01" ? "2026-10-31" : "2026-10-30";
      await expect(active.contribute(previous, `${stage}:early:${active.args.idempotencyKey}`))
        .rejects.toMatchObject({ data: { code: "transfer_predates_activation" } });
      expect(await active.contribute(active.date, `${stage}:valid:${active.args.idempotencyKey}`))
        .toMatchObject({ contribution: { contributionDate: active.date } });
    }
  }
  await check("before");
  const snapshot = await s.read();
  const ledger = await s.t.query(api.accounting.listJournalEntries, { workspaceId: s.workspaceId });
  async function backfill() {
    let updated = 0;
    for (const table of ["plans", "cancellations"] as const) {
      let cursor: string | null = null;
      for (;;) {
        const args: FunctionArgs<typeof internal.savingsRecoveryWrites.backfillEventCalendarDates> = { workspaceId: s.workspaceId, table, cursor, batchSize: 1 };
        const page = await s.t.mutation(internal.savingsRecoveryWrites.backfillEventCalendarDates, args);
        expect(page.scanned).toBeLessThanOrEqual(1);
        expect(page.updated).toBeLessThanOrEqual(1);
        expect(await s.read()).toEqual(snapshot);
        expect(await s.t.mutation(internal.savingsRecoveryWrites.backfillEventCalendarDates, args)).toEqual({ ...page, updated: 0 });
        updated += page.updated;
        if (page.done) break;
        cursor = page.cursor;
      }
    }
    return updated;
  }
  expect(await backfill()).toBe(pairs.length * 3);
  expect(await backfill()).toBe(0);
  expect(await s.t.query(api.accounting.listJournalEntries, { workspaceId: s.workspaceId })).toEqual(ledger);
  await check("after");
  const rows = await s.t.run(async ctx => ({ plans: await ctx.db.query("savingsRecoveryPlans").collect(), cancellations: await ctx.db.query("savingsRecoveryCancellations").collect() }));
  expect(rows.plans.every(plan => plan.activationDate?.slice(0, 7) === plan.activationMonth)).toBe(true);
  expect(rows.cancellations.every(item => item.cancellationDate !== undefined)).toBe(true);
});

test.each([0, -1, 1.5, 251])("backfill rejects invalid batch size %s without writes", async batchSize => {
  const s = await setup();
  await s.legacyPlan("legacy", boundary, "2026-10-31", false);
  await expect(s.t.mutation(internal.savingsRecoveryWrites.backfillEventCalendarDates, { workspaceId: s.workspaceId, table: "plans", cursor: null, batchSize }))
    .rejects.toThrow("batchSize must be an integer between 1 and 250");
  expect((await s.t.run(ctx => ctx.db.query("savingsRecoveryPlans").collect()))[0]?.activationDate).toBeUndefined();
});

test("backfill rejects a missing workspace without filling orphaned rows", async () => {
  const s = await setup();
  await s.legacyPlan("legacy", boundary, "2026-10-31", false);
  await s.t.run(async ctx => { await ctx.db.delete(s.workspaceId); });
  await expect(s.t.mutation(internal.savingsRecoveryWrites.backfillEventCalendarDates, { workspaceId: s.workspaceId, table: "plans", cursor: null }))
    .rejects.toThrow("workspace_not_found");
  expect((await s.t.run(ctx => ctx.db.query("savingsRecoveryPlans").collect()))[0]?.activationDate).toBeUndefined();
});
